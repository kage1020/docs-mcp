# Phase 7 — Acceptance Criteria (locked)

## Goal
Talk to any OpenAI-compatible embeddings endpoint (Ollama / LM Studio /
OpenAI / …): probe at startup, batch the chunks, gracefully degrade to
BM25 when nothing answers.

## ACs

### Client (`src/embedding/client.ts`)

1. **AC-7.1**: `createEmbeddingClient({ baseUrl, model })` returns
   `{ embed(texts) → number[][] }`. A single call sends one
   `POST {baseUrl}/embeddings` with body `{ model, input: texts }`.
2. **AC-7.2**: When `apiKey` is set, the request includes
   `Authorization: Bearer <apiKey>`.
3. **AC-7.3**: A non-2xx response throws with the status code embedded in
   the error message.

### Probe (`src/embedding/probe.ts`)

4. **AC-7.4**: `probeEmbedding({ baseUrl, model })` returns
   `{ available: true, model, dim }` when the server responds to both
   `/models` and a single-token `/embeddings` round trip.
5. **AC-7.5**: Connection-refused / timeout / non-2xx returns
   `{ available: false, reason: <string> }` and never throws.
6. **AC-7.6**: When `/models` lists models but the requested model is not
   among them, the probe still attempts an `/embeddings` request — the
   model list is *informational*, not authoritative.

### Batch (`src/embedding/batch.ts`)

7. **AC-7.7**: `embedBatch(texts, { client, batchSize: 16 })` returns
   embeddings in input order regardless of batch boundaries.
8. **AC-7.8**: 100 texts at `batchSize: 16` produce ≥ 7 calls to
   `client.embed` (`ceil(100 / 16) = 7`).
9. **AC-7.9**: An aborted `signal` causes the function to reject with
   `AbortError` and stops issuing further client calls.

### Vec table integration

10. **AC-7.10**: `ensureVecTable(db, dim)` (Phase 1 surface) plus an
    `embeddings_meta` row of `('model', '<id>')` written by the probe
    enable callers to detect drift and rebuild the vec table when the
    configured model changes.

These ACs are **locked**.
