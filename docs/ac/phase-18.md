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

5. **AC-18.5**: Any site that actually serves a gzipped sitemap can now
   be indexed — demonstrated by the synthetic fixture in
   `test/unit/crawler/sitemap-gzip.test.ts` (urlset + sitemapindex,
   both gzipped, no `Content-Encoding` header).

   Note discovered during measurement: `developers.facebook.com` does
   *not* actually serve gzipped sitemaps despite advertising
   `*.xml.gz` URLs in `robots.txt`. Those URLs return
   `text/html; charset="utf-8"` (a cookie-wall page). This is a content
   problem on Facebook's side, not a docs-mcp gap. For sites with this
   pattern, indexing via BFS is the only path (and likely needs
   `DOCS_MCP_RENDER=playwright` if the link graph is JS-rendered).

These ACs are **locked**.
