# Phase 23 — Acceptance Criteria (locked)

## Goal
Three small UX fix-ups surfaced during real-world use:

1. `search_docs` silently returned 0 hits when the caller passed a
   non-existent `site_id` — masking a bug in the caller.
2. `get_doc` ignored robots.txt on cold fetches, even though the
   crawler honors it.
3. `get_doc` only memory-cached cold-fetched pages; there was no way
   for an agent to "pin this page into the search index" short of a
   full `add_site` crawl.

## ACs

### search_docs validation (`src/mcp/tools/search-docs.ts`)

1. **AC-23.1**: `search_docs({ site_id })` with no matching `sites` row
   returns `isError: true` with the message
   `"No site with id <n>"`. Hits are not silently empty.
2. **AC-23.2**: `search_docs` without `site_id` (cross-site search)
   continues to work as before.

### get_doc robots check (`src/mcp/tools/get-doc.ts`)

3. **AC-23.3**: A cold (non-cached) `get_doc({ url })` fetches the
   target host's robots.txt (cached per-origin on `ServerContext`) and
   refuses the request when `isAllowed === false`, returning
   `isError: true` with a message naming the URL.
4. **AC-23.4**: A `get_doc` for a URL already in the local DB skips the
   robots check (we already crawled it under the configured policy).
5. **AC-23.5**: A failed robots fetch is treated as "allow all"
   (preserving current behavior; same as Phase 2 `loadRobots`).
6. **AC-23.6**: The per-origin robots cache lives on
   `ServerContext.robotsCache: Map<string, RobotsAdvisor>` so multiple
   `get_doc` calls don't re-fetch.

### get_doc persist option (`src/mcp/tools/get-doc.ts`)

7. **AC-23.7**: `get_doc({ url, persist: true })` indexes the page into
   the DB after fetching:
   - Find the registered `site` whose `base_url` covers `url` via
     `isUnderBase`.
   - If found: insert/update `pages` + replace `chunks`, run
     `embedAndStoreChunks` when `embedClient` is configured.
   - Returns `structuredContent.persisted: true` and `siteId: <n>`.
8. **AC-23.8**: `get_doc({ url, persist: true })` for a URL not covered
   by any registered site returns `isError: true` and the page is not
   stored — the user is told to call `add_site` first.
9. **AC-23.9**: `get_doc({ url })` (default `persist: false`) keeps the
   existing memory-cache-only behavior — back-compat with Phase 9.

### Schemas

10. **AC-23.10**: `GetDocShape` gains `persist: boolean` (default
    `false`).

These ACs are **locked**.
