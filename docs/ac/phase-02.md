# Phase 2 — Acceptance Criteria (locked)

## Goal
Implement deterministic URL normalization, robots.txt evaluation, and
sitemap parsing — the three pure-function building blocks every crawl will
depend on.

## ACs

### URL normalization (`src/crawler/url.ts`)

1. **AC-2.1**: `normalize("https://Example.COM:443/a/index.html?b=2&a=1#frag")`
   returns `"https://example.com/a/?a=1&b=2"`. The function lowercases the
   host, strips default ports (`:80`, `:443`), removes the URL fragment,
   collapses `/index.html` and `/index.htm` to `/`, and sorts query keys.
2. **AC-2.2**: Tracking parameters `utm_source`, `utm_medium`, `utm_campaign`,
   `utm_term`, `utm_content`, `fbclid`, `gclid`, `ref`, `ref_src` are removed
   by default. `stripTrackingParams: false` opts out.
3. **AC-2.3**: `normalize(url, { baseUrl })` matches the trailing-slash
   discipline of `baseUrl`: if base ends with `/`, every normalized URL
   ends with `/` (unless it has a file-style last path component like `.html`,
   `.txt`); otherwise the trailing slash is removed (except for the root `/`).
4. **AC-2.4**: `stripPaginationParams: ["page", "p", "offset"]` removes those
   query keys from the normalized URL.
5. **AC-2.5**: `isSameOrigin(a, b)` returns true iff scheme+host+port match.
6. **AC-2.6**: `isUnderBase(url, baseUrl)` returns true iff the normalized URL
   shares origin with the base **and** its pathname starts with the base
   pathname.
7. **AC-2.7**: `matchPatterns(path, patterns)` uses micromatch globs; an
   empty/undefined `patterns` array means "match all".

### Robots (`src/crawler/robots.ts`)

8. **AC-2.8**: `createRobots(robotsTxt, baseUrl)` exposes `isAllowed`,
   `crawlDelay`, `sitemaps`. `Disallow: /private` blocks `/private/x` for
   any user-agent. `User-agent: docs-mcp\nAllow: /` honors the bot-specific
   rule even when the wildcard rules disallow.
9. **AC-2.9**: `crawlDelay("docs-mcp")` returns the integer seconds when a
   `Crawl-delay` directive is set; `undefined` otherwise.
10. **AC-2.10**: `sitemaps()` returns the absolute URLs of every `Sitemap:`
    directive (handles both `https://…` and relative paths resolved against
    `baseUrl`).
11. **AC-2.11**: Empty or garbage robots.txt is treated as "allow all" and
    never throws.

### Sitemap (`src/crawler/sitemap.ts`)

12. **AC-2.12**: `parseSitemap(xml)` returns
    `{ urls: string[], sitemaps: string[] }`. A `<urlset>` document yields
    the `<loc>` values in `urls`. A `<sitemapindex>` document yields them in
    `sitemaps`. Both arrays are deduplicated.
13. **AC-2.13**: Malformed XML, plain text, or empty input returns
    `{ urls: [], sitemaps: [] }` instead of throwing.
14. **AC-2.14**: Whitespace inside `<loc>` is trimmed; non-`http(s)` URLs
    (e.g. `mailto:`) are dropped.

These ACs are **locked**.
