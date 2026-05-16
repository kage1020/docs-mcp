# Phase 8 — Acceptance Criteria (locked)

## Goal
Cross-mode search over the indexed chunks: BM25, vector KNN, hybrid (RRF),
auto (picks BM25 / hybrid based on embedding availability).

## ACs

### BM25 (`src/search/bm25.ts`)

1. **AC-8.1**: `searchBm25(db, { query, topK })` returns up to `topK` hits
   ordered by FTS5 BM25 (smallest distance first). Each hit carries
   `chunkId, pageUrl, pageTitle, headingPath, snippet, bm25Score`.
2. **AC-8.2**: A `siteId` filter limits hits to that site.
3. **AC-8.3**: `searchBm25` returns `[]` for an empty / whitespace query.

### Vector (`src/search/vector.ts`)

4. **AC-8.4**: `searchVector(db, queryEmbedding, { topK })` runs a vec0 KNN
   and returns `chunkId, pageUrl, pageTitle, headingPath, text, distance`.
5. **AC-8.5**: A `siteId` filter narrows by site.
6. **AC-8.6**: When the vec table does not yet exist, `searchVector` returns
   `[]` instead of throwing.

### RRF (`src/search/hybrid.ts`)

7. **AC-8.7**: `rrf(bm25Hits, vecHits, { k: 60 })` merges by `chunkId`,
   computes `score = Σ 1 / (k + rank_i)`, normalizes max → 1.0, sorts
   descending, and tags each hit with `source: "bm25" | "vector" | "both"`.

### Search dispatch (`src/search/search.ts`)

8. **AC-8.8**: `search({ mode: "bm25", … })` calls only BM25.
9. **AC-8.9**: `search({ mode: "vector", … })` requires `embedQuery`; absence
   throws (caller bug, not a runtime fallback).
10. **AC-8.10**: `search({ mode: "hybrid", … })` runs both and RRF-merges.
11. **AC-8.11**: `search({ mode: "auto", … })` resolves to `"hybrid"` when
    `embeddingsAvailable: true` *and* `embedQuery` is provided, otherwise
    `"bm25"`.

These ACs are **locked**.
