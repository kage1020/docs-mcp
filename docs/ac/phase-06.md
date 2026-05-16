# Phase 6 — Acceptance Criteria (locked)

## Goal
Wire the Phase 1-5 building blocks into a working end-to-end crawl &
indexing pipeline that turns a `baseUrl` into a populated SQLite DB.

## ACs

### Repositories (`src/storage/repositories/{sites,pages,chunks}.ts`)

1. **AC-6.1**: `sites.create({ baseUrl, name, crawlOptions })` returns the
   inserted `site_id`; `sites.byId(id)` and `sites.all()` work.
2. **AC-6.2**: `pages.upsert(input)` updates if `(site_id, url)` exists,
   otherwise inserts. Returns `pageId`.
3. **AC-6.3**: `chunks.replaceAll(pageId, chunks[])` deletes existing
   chunks for a page and inserts the new ones in order (`ord` starts at 0).

### Index page (`src/indexer/index-page.ts`)

4. **AC-6.4**: `indexPage(db, { siteId, url, markdown, ... }, chunks)`:
   - returns `{ state: "inserted" }` on first call,
   - `{ state: "unchanged" }` on a second call with identical markdown
     (re-uses `content_hash`),
   - `{ state: "updated" }` when markdown differs and replaces chunks.
5. **AC-6.5**: `indexPage` populates `chunks_fts` (verified via FTS5 MATCH).

### Crawler (`src/crawler/crawl.ts`)

6. **AC-6.6**: `crawl({ siteId, baseUrl, … })` against a fixture site with
   N pages indexes **all N** of them when sitemap.xml lists every URL.
7. **AC-6.7**: Without a sitemap, BFS following same-origin `<a href>`
   reaches every linked page.
8. **AC-6.8**: A second `crawl` with no content changes returns
   `{ pagesAdded: 0, pagesUpdated: 0, pagesUnchanged: N }`.
9. **AC-6.9**: After mutating one fixture page, the next `crawl` returns
   `pagesUpdated=1, pagesUnchanged=N-1` and replaces that page's chunks.
10. **AC-6.10**: `excludePatterns` removes matching URLs from the crawl.
11. **AC-6.11**: `robots: Disallow: /private` causes `/private/*` URLs to
    be skipped (no fetch, no DB row).
12. **AC-6.12**: `maxPages` caps the number of pages indexed.
13. **AC-6.13**: A URL outside `baseUrl`'s prefix is never indexed.

These ACs are **locked**.
