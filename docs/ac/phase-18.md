# Phase 18 — Acceptance Criteria (locked)

## Goal
Decompress `.xml.gz` sitemaps so loadSitemap can read them. Many sites
(Facebook, Reddit, large MDX docs) advertise gzipped sitemap files via
`robots.txt`, and the server returns them as `application/octet-stream`
without a `Content-Encoding: gzip` header — so neither Bun nor Node's
fetch auto-decompresses them.

## ACs

### loadSitemap (`src/crawler/site-setup.ts`)

1. **AC-18.1**: `loadSitemap` fetches `.gz` / `.xml.gz` URLs as raw bytes
   (not text), gunzips them with `node:zlib`, and feeds the decoded XML
   string to `parseSitemap`.
2. **AC-18.2**: A malformed gzipped body returns an empty result rather
   than throwing (so one bad sitemap entry can't sink the whole crawl).
3. **AC-18.3**: Non-`.gz` URLs continue to use the existing fetcher path
   unchanged.
4. **AC-18.4**: `Content-Encoding: gzip` responses are already
   transparently decoded by Bun/Node — those still work and do NOT get
   double-decoded. (Implementation gates on the URL extension, not on
   inspecting bytes; the few sites that double-encode are out of scope.)

### Real-world

5. **AC-18.5**: A re-measure against
   `https://developers.facebook.com/documentation/ads-commerce/marketing-api`
   returns dozens to thousands of URLs from
   `developers_facebook_com_docs_sitemap.xml.gz` (vs. 0 previously),
   and `pagesIndexed` is at least an order of magnitude higher than the
   Phase 17 result.

These ACs are **locked**.
