# Phase 5 — Acceptance Criteria (locked)

## Goal
Build the polite-crawl primitives: a per-origin throttled work queue and
an HTTP fetcher with retries, timeout, body cap, and conditional GETs.

## ACs

### Queue (`src/crawler/queue.ts`)

1. **AC-5.1**: `enqueue(origin, fn)` honors a per-origin **concurrency cap**
   (`perOriginConcurrency`) — when two tasks for the same origin start, a
   third for that origin waits.
2. **AC-5.2**: `enqueue` honors a per-origin **QPS cap** (`perOriginQps`):
   running 8 tasks for the same origin at QPS=2 takes ≥ ~3s.
3. **AC-5.3**: Tasks for **different origins** run in parallel up to the
   global concurrency budget — 4 tasks across 4 origins finish in
   well under the single-origin throttled time.
4. **AC-5.4**: An aborted task rejects with `AbortError` and stops blocking
   the queue.
5. **AC-5.5**: `setOriginCrawlDelay(origin, seconds)` overrides the QPS for
   that origin (used to honor `Crawl-delay`).

### Fetcher (`src/crawler/fetcher.ts`)

6. **AC-5.6**: On HTTP `500-599`, the fetcher **retries with exponential
   backoff + jitter** up to `maxRetries=3`; final attempt's status is
   returned to the caller.
7. **AC-5.7**: On HTTP `429`, the fetcher waits for `Retry-After`
   (seconds or HTTP date) before the next attempt.
8. **AC-5.8**: A successful response returns `{ status, headers, body, url }`
   with `body` truncated to at most `maxBodyBytes` (default 5 MB).
9. **AC-5.9**: An `If-None-Match` / `If-Modified-Since` request returning
   `304 Not Modified` resolves with `{ status: 304, body: "" }` — no retry.
10. **AC-5.10**: The default `User-Agent` is `docs-mcp/<version>` and is
    sent on every request.
11. **AC-5.11**: An aborted signal propagates and the in-flight fetch
    rejects promptly (no leaks).

These ACs are **locked**.
