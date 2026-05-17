# docs-mcp

Fast local MCP server that indexes documentation sites by base URL and serves
keyword search, optional semantic search, and Markdown page retrieval as MCP
tools — all from a single SQLite file.

- **Bun + TypeScript** runtime, **`bun:sqlite` + `sqlite-vec`** storage,
  **FTS5 (BM25)** full-text + optional **vec0 KNN** vectors fused via
  **Reciprocal Rank Fusion** (with per-page diversity cap).
- Both **stdio** and **Streamable HTTP** MCP transports.
- Auto-detects any **OpenAI-compatible embeddings endpoint**
  (Ollama, LM Studio, OpenAI, …) — falls back to BM25 if none is reachable.
- Polite crawler: sitemap-first (gzip-aware), BFS fallback on raw HTML
  (so nav/TOC links count), robots.txt-aware, per-origin QPS,
  exponential backoff with jitter, conditional GETs.
- Optional **playwright fetcher** for JS-rendered (SPA) docs sites.
- **Async indexing**: kick off a crawl and have agents start
  `search_docs` immediately while the index fills in the background.

## Install

```bash
bun install
bun run typecheck
bun run test
```

The CLI lives at `bin/docs-mcp` (run with `bun run bin/docs-mcp …` during
development, or build a standalone binary with `bun build --compile`).

## CLI

```bash
docs-mcp --help
docs-mcp --version

# MCP transports
docs-mcp serve --stdio
docs-mcp serve --http --port 7777

# Site management
docs-mcp add <base_url> [--name X]
docs-mcp list
docs-mcp refresh --id <site_id> [--full]
docs-mcp remove --id <site_id>
```

## MCP tools (7)

| tool | purpose |
|---|---|
| `search_docs` | BM25 / vector / hybrid (RRF) / auto search with per-page diversity |
| `get_doc` | Fetch a URL as Markdown; optionally persist it into the index |
| `add_site` | Crawl & index a documentation base URL (sync or background) |
| `index_status` | Poll an in-flight crawl's progress / errors |
| `list_sites` | List indexed sites + their indexing state |
| `refresh_site` | Re-crawl an indexed site (`mode: diff | full`) |
| `remove_site` | Remove an indexed site (cascades to pages + chunks) |

### `search_docs`

```jsonc
{
  "query": "campaign budget",
  "site_id": 1,             // optional
  "top_k": 10,              // 1..50, default 10
  "mode": "auto",           // "bm25" | "vector" | "hybrid" | "auto"
  "max_per_page": 2         // 1..50, default 2 — cap hits per pageUrl
}
```

Returns `structuredContent.hits` shaped like:

```ts
{
  chunkId: number;
  pageUrl: string;
  pageTitle: string | null;
  headingPath: string;   // "Guide > Routing > CampaignService"
  snippet: string;
  score: number;         // normalized 0..1
  source: "bm25" | "vector" | "both";
}
```

Unknown `site_id` returns `isError: true` instead of silently empty hits.

### `get_doc`

```jsonc
{
  "url": "https://docs.example.com/page",
  "max_chars": 60000,       // 100..500000
  "persist": false          // true -> also insert into pages + chunks
}
```

- DB cache hit ⇒ `source: "cache"` (1-2 ms).
- LRU memory-cache hit ⇒ `source: "memory-cache"` (50 entries / 30 min TTL).
- Cold fetch ⇒ `source: "fetched"`. Honors `robots.txt` for the target
  host (cached per origin).
- `persist: true` requires a registered site whose `base_url` covers
  the URL; embeddings are computed if a model is configured.

### `add_site`

```jsonc
{
  "base_url": "https://docs.example.com/",
  "name": "example",
  "include_patterns": ["/api/**"],
  "exclude_patterns": ["/api/legacy/**"],
  "max_depth": 5,
  "max_pages": 2000,
  "wait": true              // false -> return immediately, crawl runs async
}
```

Idempotent: calling twice with the same `base_url` returns the existing
`siteId`. Parallel calls fold into a single background crawl.
`wait: false` returns `structuredContent.status = "indexing"`.

### `index_status`

```jsonc
{ "site_id": 1 }
// -> { status: "indexing"|"idle", pagesIndexed, chunksIndexed,
//      startedAt, error: string|null }
```

## Configuration (env)

| variable | default | purpose |
|---|---|---|
| `DOCS_MCP_DATA_DIR` | XDG data dir | SQLite DB location (Linux: `$XDG_DATA_HOME/docs-mcp`, macOS: `~/Library/Application Support/docs-mcp`, Windows: `%LOCALAPPDATA%\docs-mcp`) |
| `DOCS_MCP_CACHE_DIR` | XDG cache dir | reserved |
| `DOCS_MCP_EMBEDDING_BASE_URL` | _(unset)_ | e.g. `http://localhost:11434/v1` (Ollama) or `http://localhost:1234/v1` (LM Studio) |
| `DOCS_MCP_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model name |
| `DOCS_MCP_EMBEDDING_API_KEY` | _(unset)_ | Bearer token if required |
| `DOCS_MCP_USER_AGENT` | `docs-mcp/<ver>` | Override the crawl User-Agent |
| `DOCS_MCP_RENDER` | `fetch` | `fetch` (native) or `playwright` (JS-rendered SPA) |
| `LOG_LEVEL` | `info` | pino log level |

When the embedding endpoint is unreachable, the server logs a warning and
continues in BM25-only mode. Same when sqlite-vec can't load (older
macOS) — search degrades to BM25.

### SPA rendering with playwright (optional)

For sites where pages render in the browser (parts of
`developers.google.com`, many SPA docs apps), set
`DOCS_MCP_RENDER=playwright`.

```bash
bun add -d playwright
bunx playwright install chromium
```

**Caveat**: Bun on Windows currently can't speak playwright's chromium
stdio pipe, so the playwright path needs **Node** on Windows. Linux and
macOS Bun runs work.

## Claude Desktop / Claude Code config

```jsonc
{
  "mcpServers": {
    "docs": {
      "command": "bun",
      "args": ["run", "/abs/path/to/docs-mcp/bin/docs-mcp", "serve", "--stdio"],
      "env": {
        "DOCS_MCP_EMBEDDING_BASE_URL": "http://localhost:11434/v1",
        "DOCS_MCP_EMBEDDING_MODEL": "nomic-embed-text"
      }
    }
  }
}
```

Copy at `examples/mcp.json`.

## Streamable HTTP

```bash
docs-mcp serve --http --port 7777
```

Point any MCP client at `http://127.0.0.1:7777/mcp` (POST + DELETE).

## Performance benchmarks

```bash
bun run bench
bun run bench:diff bench-baseline.json bench-result.json --threshold 0.2
```

The CI pipeline runs `bench:diff` against `bench-baseline.json` (captured
on the GitHub Linux runner) on every push/PR; >20% slowdowns fail the
build. Update the baseline by replacing it with a fresh `bench-result.json`.

Indicative single-thread numbers (Ubuntu CI runner):

| benchmark | mean |
|---|---|
| `crawler/url.normalize` hot path | ~10 µs |
| `crawler/sitemap.parseSitemap` (10k urls) | ~53 ms |
| `extractor/extract` (real docs page) | ~1.0 ms |
| `extractor/markdown.htmlToMarkdown` (~200 KB body) | ~30 ms |
| `indexer/chunk` (~50 KB md, with leafLabel) | ~1.6 ms |
| `search/bm25.searchBm25` (10k chunks, single term) | ~2.3 ms |
| `search/bm25.searchBm25` (10k chunks, two terms) | ~0.2 ms |
| `search/hybrid.rrf` (top-50 × 2) | ~10 µs |
| `storage/migrate.migrate` (empty DB) | ~2 ms |

## Architecture

```
src/
├── cli/          # subcommand dispatcher + bootstrap (DB open, migrate, probe)
├── mcp/
│   ├── server.ts        # McpServer + tool registration
│   ├── context.ts       # ServerContext (db, queue, embed, indexingTasks, robotsCache)
│   ├── indexing-tasks.ts # getOrStartCrawl (dedupes parallel add_site)
│   └── tools/           # 7 tool handlers
├── crawler/      # url / robots / sitemap (gzip) / queue / fetcher /
│                 # playwright-fetcher / crawl (raw-HTML link harvest)
├── extractor/    # readability + linkedom + turndown(GFM), with
│                 # main/article fallback when Readability under-extracts
├── indexer/      # heading-aware chunking with leaf-label identifier,
│                 # CJK-aware token approximation, indexPage,
│                 # embedAndStoreChunks
├── search/       # BM25 / vector / hybrid (RRF) / mode dispatch +
│                 # per-page diversity cap
├── embedding/    # OpenAI-compatible client + probe + batch
├── storage/      # bun:sqlite + sqlite-vec (canary-verified), user_version
│                 # migrations, repositories
├── config/       # XDG paths + zod env schema
└── logger.ts     # pino → stderr
```

## Development

- TDD: each phase has acceptance criteria locked in `docs/ac/phase-XX.md`.
- `bun run test` — Bun's native runner; vec-dependent tests auto-skip on
  hosts where sqlite-vec can't load.
- `bun run bench` — vitest bench; `bun run bench:diff` for regression guard.
- `bun run check` runs Biome (no `@ts-ignore`/`biome-ignore` allowed).
- `bun run typecheck` runs `tsc --noEmit` against the strict config
  (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- CI runs the test matrix on ubuntu / macos / windows + bench guard on ubuntu.

## License

MIT (TBD)
