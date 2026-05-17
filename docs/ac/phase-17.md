# Phase 17 — Acceptance Criteria (locked)

## Goal
Fix a crawl-time bug surfaced by `developers.facebook.com`: when a
sitemap returns only URLs that fall *outside* the requested `baseUrl`
subtree, every seed gets rejected by `isUnderBase` and the crawl ends
without indexing the base URL itself.

## ACs

1. **AC-17.1**: `crawl({ baseUrl, initialUrls: [<out-of-scope URLs>] })`
   still indexes `baseUrl` itself (no longer 0 pages).
2. **AC-17.2**: `crawl({ baseUrl, initialUrls: [...] })` filters
   `initialUrls` through `isUnderBase` before enqueueing — out-of-scope
   sitemap entries are silently dropped (not counted as skipped).
3. **AC-17.3**: When the sitemap contains a mix of in-scope and
   out-of-scope URLs, only the in-scope ones plus `baseUrl` are seeded.
4. **AC-17.4**: When `baseUrl` itself appears in `initialUrls`, it is not
   double-enqueued (deduplicated via the seed set).
5. **AC-17.5**: Existing in-scope-sitemap behavior (Google Ads fixture,
   docs-site fixture) is unchanged — the seed list is identical to what
   it was before, modulo the always-present `baseUrl`.

These ACs are **locked**.
