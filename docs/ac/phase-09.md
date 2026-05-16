# Phase 9 — Acceptance Criteria (locked)

## Goal
Expose six MCP tools (`search_docs`, `get_doc`, `add_site`, `remove_site`,
`list_sites`, `refresh_site`) backed by Phase 6-8 logic, with strict zod
schemas and zero stdout pollution.

## ACs

1. **AC-9.1**: `buildMcpServer(ctx)` returns a `McpServer` with exactly the
   six tools listed above.
2. **AC-9.2**: Each tool's `inputSchema` rejects malformed input — the
   resulting tool call returns a tool error (or the SDK's protocol-level
   validation error) without crashing the server.
3. **AC-9.3**: `search_docs` returns `structuredContent.hits` shaped like
   `[{ chunkId, pageUrl, pageTitle, headingPath, snippet, score, source }]`
   and a human-readable `content[0].text` summary.
4. **AC-9.4**: `get_doc` returns the markdown for a previously indexed URL
   from the DB (no fetch needed) when the URL is cached.
5. **AC-9.5**: `get_doc` truncates the body to `max_chars` and reports
   `truncated: true` when applied.
6. **AC-9.6**: `add_site` creates a `sites` row and crawls the site,
   returning `{ siteId, name, pagesIndexed, chunksIndexed }`.
7. **AC-9.7**: `list_sites` returns one entry per site with `pageCount`
   and `lastCrawledAt`.
8. **AC-9.8**: `remove_site` deletes the site (cascades to pages + chunks)
   and returns `{ deleted: true, pagesDeleted, chunksDeleted }`.
9. **AC-9.9**: `refresh_site` re-crawls and returns `{ pagesAdded,
   pagesUpdated, pagesUnchanged, pagesSkipped }`.
10. **AC-9.10**: When the server is connected to an `InMemoryTransport`,
    a client can `listTools()` and call each tool successfully on a
    fixture site — no errors leak to `stdout`.

These ACs are **locked**.
