# Phase 22 — Acceptance Criteria (locked)

## Goal
Let agents kick off indexing without blocking. Today `add_site` runs the
full crawl synchronously inside the MCP tool call (5-15 minutes against
real docs). An agent that wants to start search_docs immediately must
either wait or fire-and-forget against a separate tool. We add:

- a background-indexing mode on `add_site`,
- idempotency so parallel `add_site` calls for the same base URL fold
  into a single in-flight crawl,
- a new `index_status` tool to poll progress,
- and `list_sites` reports per-site indexing state.

## ACs

### Server context (`src/mcp/context.ts`)

1. **AC-22.1**: `ServerContext` gains `indexingTasks: Map<number, IndexingTask>`
   where each `IndexingTask` holds `{ siteId, baseUrl, startedAt, promise,
   error?, result? }`.

### add_site (`src/mcp/tools/add-site.ts`)

2. **AC-22.2**: `add_site` accepts new field `wait` (boolean, default
   `true`). When `wait: false`, the call returns immediately with
   `structuredContent.status = "indexing"` and the crawl runs in the
   background; on completion the entry is removed from `indexingTasks`.
3. **AC-22.3**: When the base URL was already registered (or another
   `add_site(wait:false)` is in flight), `add_site` is **idempotent**:
   no UNIQUE-violation error, the existing `siteId` is returned, and:
   - if a background task is in flight, `status: "indexing"` is
     returned (without restarting the crawl),
   - otherwise `status: "idle"` is returned with current counts.
4. **AC-22.4**: Parallel `add_site(baseUrl, wait:false)` calls (5+)
   produce exactly **one** background crawl. Subsequent calls just
   return `status: "indexing"`.
5. **AC-22.5**: Background-task errors are stored on the task and
   surfaced via `index_status`. They do **not** crash the server.

### index_status (`src/mcp/tools/index-status.ts`, new)

6. **AC-22.6**: `index_status({ site_id })` returns
   `{ siteId, baseUrl, status: "indexing" | "idle", startedAt | null,
     pagesIndexed, chunksIndexed, error: string | null }`.
7. **AC-22.7**: `index_status` for an unknown `site_id` returns
   `isError: true` (no silent zero).

### list_sites enhancement

8. **AC-22.8**: `list_sites` adds `indexing: boolean` (and `pageCount`,
   `lastCrawledAt` remain) per row so an agent can see at a glance
   which sites are still crawling.

### MCP server registration

9. **AC-22.9**: `buildMcpServer` registers **7 tools** now
   (the existing 6 + `index_status`).

These ACs are **locked**.
