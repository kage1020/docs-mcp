# Phase 20 — Acceptance Criteria (locked)

## Goal
Stop search results from collapsing onto a single page. When BM25 picks
the same article repeatedly (because it has multiple matching chunks),
`top_k=5` can return 5 hits from one URL — actively unhelpful.

## ACs

### Search dispatch (`src/search/search.ts`)

1. **AC-20.1**: `search({ ..., maxPerPage: N })` caps the number of hits
   returned from any single `pageUrl` at `N`. Default is **2**.
2. **AC-20.2**: Per-page cap is applied **after** ranking, **before**
   `topK` truncation. We over-fetch the underlying engine
   (BM25 / vector / hybrid) so that capping leaves enough candidates to
   fill `topK`.
3. **AC-20.3**: `maxPerPage` applies to all modes (`bm25`, `vector`,
   `hybrid`, `auto`).
4. **AC-20.4**: When fewer pages exist than `topK`, the cap does NOT
   short the result — we still return as many hits as we can find, even
   if that means returning multiple hits from the same page (i.e. cap
   is a *target distribution*, not a hard ceiling that drops candidates
   we can't replace).
5. **AC-20.5**: Hit ordering within each page is preserved (don't reshuffle).

### Schema (`src/mcp/schemas.ts`)

6. **AC-20.6**: `SearchDocsShape` exposes `max_per_page` (int 1..50,
   default 2) as a tool argument so MCP clients can override.

These ACs are **locked**.
