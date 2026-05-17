# Phase 19 — Acceptance Criteria (locked)

## Goal
Stop strangling the BFS link graph. Phase 6 implemented BFS by walking
the anchors inside `extracted.contentHtml` — but extract strips the
nav/header/sidebar before returning, and for most documentation sites
the table-of-contents lives in exactly those stripped regions.

Result: on `developers.facebook.com/documentation/.../marketing-api`
the crawler followed only 1 link (an in-content one to `/overview`),
even though the raw page contains 1,000+ same-host anchors and ~20+
in-scope ones.

## ACs

1. **AC-19.1**: `crawl()` collects follow-up links from the **raw fetched
   HTML** (`res.body`), not from `extracted.contentHtml`. This restores
   visibility into TOC / nav / sidebar anchors.
2. **AC-19.2**: A re-measure against the Facebook marketing-api docs
   indexes ≥ 5 pages (vs. 2 before).
3. **AC-19.3**: The Phase 6 docs-site fixture continues to pass (same
   `pagesAdded` count after `crawl()` runs, no regression in
   `test/integration/crawl-flow.test.ts`).
4. **AC-19.4**: Out-of-scope anchors (`/blog/`, `/docs/`, cross-host)
   are still filtered out by the existing `accept(url)` chain
   (`isUnderBase`, `robots.isAllowed`, `include/excludePatterns`).

These ACs are **locked**.
