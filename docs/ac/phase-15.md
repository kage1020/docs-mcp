# Phase 15 — Acceptance Criteria (locked)

## Goal
Optional JS-rendering crawl path so SPA documentation sites (e.g.
Google Developer reference pages) can be indexed end-to-end.

## ACs

### Playwright fetcher (`src/crawler/playwright-fetcher.ts`)

1. **AC-15.1**: `createPlaywrightFetcher(opts?)` returns
   `{ fetch: Fetcher, close: () => Promise<void> }`.
   It lazy-imports `playwright` so the dependency is only required when
   the feature is actually used.
2. **AC-15.2**: The `fetch` method satisfies the same `Fetcher` signature
   as `fetchUrl`: takes `(url, FetchOptions)` and resolves to
   `{ status, headers, body, url, bodyTruncated }`. The `body` is the
   rendered HTML (`page.content()` after `waitUntil: "domcontentloaded"`
   plus a short `networkidle` settle).
3. **AC-15.3**: `body` is truncated to `maxBodyBytes` (default 5 MB) just
   like the native fetcher.
4. **AC-15.4**: The browser instance is shared across calls — closing
   the fetcher tears down the browser + context cleanly.
5. **AC-15.5**: AbortSignal propagation: an aborted signal rejects the
   pending navigation promptly.

### Bootstrap wiring (`src/cli/bootstrap.ts`)

6. **AC-15.6**: When `DOCS_MCP_RENDER=playwright` is set, the bootstrap
   context's `fetcher` is the playwright-backed fetcher and `shutdown()`
   tears down the browser.
7. **AC-15.7**: When the env var is unset (or set to `fetch`), the
   bootstrap context's `fetcher` is the native `fetchUrl` and no
   browser is launched.
8. **AC-15.8**: Importing the playwright fetcher does NOT happen at
   bootstrap-time when the feature is disabled — verified by reading
   `bootstrap.ts` (only inside a `DOCS_MCP_RENDER === "playwright"`
   branch).

### Env schema (`src/config/env.ts`)

9. **AC-15.9**: `DOCS_MCP_RENDER` accepts `"fetch"` | `"playwright"`,
   defaults to `"fetch"`.

These ACs are **locked**.

## Out of scope (documented elsewhere if pursued)

- Concurrent browser contexts per origin (we use 1 shared context).
- Cookie / auth persistence.
- Stealth plugins to bypass bot detection.
