# Phase 21 — Acceptance Criteria (locked)

## Goal
Wire embedding generation into the crawl path. Phase 7 built the probe,
client, and batch primitives, and Phase 8 built vector + hybrid search,
but nothing in between writes to `chunks_vec` — so even with a
configured embedding endpoint, `search mode=vector|hybrid` always
returns 0 vector hits.

## ACs

### Server context (`src/mcp/context.ts`)

1. **AC-21.1**: `ServerContext` gains an optional `embedClient`
   (`EmbeddingClient`). When the probe succeeds in `bootstrapContext`,
   the same client used for `embedQuery` is also stored on `ctx`.

### Embed-and-store helper (`src/indexer/embed-chunks.ts`)

2. **AC-21.2**: `embedAndStoreChunks(db, pageId, client)` reads every
   chunk of the given page, calls `embedBatch` once, deletes any
   pre-existing `chunks_vec` rows for those chunk IDs, and inserts the
   new embeddings as `FLOAT[dim]` BLOBs.
3. **AC-21.3**: When `chunks_vec` does not exist (embedding not
   configured), the helper is a no-op (no throw).
4. **AC-21.4**: On batch failure (network drop), the helper swallows
   the error and logs once — the crawl must not be killed by a flaky
   embedding endpoint. Pages without vectors simply won't appear in
   vector hits; BM25 still works.

### Crawl wiring (`src/crawler/crawl.ts`)

5. **AC-21.5**: After `indexPage` returns `state: "inserted" | "updated"`
   and `embedClient` is present, the crawler calls
   `embedAndStoreChunks(db, pageId, embedClient)` before scheduling
   follow-up links.
6. **AC-21.6**: When `state: "unchanged"`, embedding is NOT regenerated
   (content_hash matched ⇒ existing vectors are still valid).

### Real-world

7. **AC-21.7**: After a crawl with `DOCS_MCP_EMBEDDING_BASE_URL` set,
   `chunks_vec` contains one row per chunk in pages added/updated by
   the crawl, and `search mode=hybrid` returns at least one hit with
   `source: "vector"` or `"both"`.

These ACs are **locked**.
