# Phase 14 — Acceptance Criteria (locked)

## Goal
Make `search_docs` results meaningfully distinguishable when many chunks
share the same `heading_path` (e.g. an index page where 70 chunks all
live under `## misc`). Two changes:

- **leaf label derivation**: chunk-level enhancement that appends a
  short identifier extracted from the chunk's first interesting line.
- **MCP `search_docs` summary**: include the snippet (not just the
  heading path) in the human-readable text payload.

## ACs

### Leaf label (`src/indexer/chunk.ts`)

1. **AC-14.1**: `chunk(md)` continues to return chunks whose `headingPath`
   is exactly the heading hierarchy (back-compat for Phase 4 tests).
2. **AC-14.2**: `chunk(md, { leafLabel: true })` enables leaf-label
   appending: each chunk's `headingPath` becomes
   `<parent-path> > <leaf>` when a leaf can be derived.
3. **AC-14.3**: When the chunk's body starts with a markdown link
   (`[`Foo`](url)` or `[Foo](url)`), the leaf is the link text with
   surrounding backticks stripped — e.g. `services > CampaignService`.
4. **AC-14.4**: When the chunk's body starts with a heading
   (`### Foo`), the leaf is the heading text.
5. **AC-14.5**: When no leaf is derivable, `headingPath` is unchanged
   (no trailing `>`).
6. **AC-14.6**: Identical-path chunks produced by oversize-section
   splitting get distinct leaves derived from each split's first line.

### Search summary (`src/mcp/tools/search-docs.ts`)

7. **AC-14.7**: The `content[0].text` summary now includes a sanitized
   snippet (newlines collapsed, length-capped to ~120 chars) on its own
   indented line under each hit so the result is identifiable at a
   glance without parsing `structuredContent`.

### Wiring (`src/crawler/crawl.ts`)

8. **AC-14.8**: The crawler invokes `chunk(md, { leafLabel: true })` so
   `search_docs` benefits without any tool-call changes.

These ACs are **locked**.
