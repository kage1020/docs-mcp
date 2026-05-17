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

## Quick start

### 1. Install

```bash
git clone https://github.com/kage1020/docs-mcp.git
cd docs-mcp
bun install
```

The entry point is `bin/docs-mcp`. Reference it by **absolute path** in
your agent config below. (Optional: `bun build --compile bin/docs-mcp
--outfile dist/docs-mcp` to produce a standalone binary.)

### 2. (Optional) enable semantic search

Any OpenAI-compatible embeddings endpoint works. The simplest is Ollama:

```bash
ollama pull embeddinggemma
# or any other embedding model — set DOCS_MCP_EMBEDDING_MODEL to match.
```

Then add the two env vars below to your agent config. Without these,
docs-mcp runs in BM25-only mode (still very useful, just no semantic
fallback).

### 3. Wire into your agent

All configs use the same `{ command, args, env }` shape. Replace
`/ABSOLUTE/PATH/TO/docs-mcp` with where you cloned the repo.

<details open>
<summary><b>Claude Desktop</b></summary>

Edit `claude_desktop_config.json`:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "docs": {
      "command": "bun",
      "args": ["run", "/ABSOLUTE/PATH/TO/docs-mcp/bin/docs-mcp", "serve", "--stdio"],
      "env": {
        "DOCS_MCP_EMBEDDING_BASE_URL": "http://localhost:11434/v1",
        "DOCS_MCP_EMBEDDING_MODEL": "embeddinggemma"
      }
    }
  }
}
```

Restart Claude Desktop. The 7 tools appear under the hammer icon.
</details>

<details>
<summary><b>Claude Code</b></summary>

Create `.mcp.json` at the project root:

```jsonc
{
  "mcpServers": {
    "docs": {
      "command": "bun",
      "args": ["run", "/ABSOLUTE/PATH/TO/docs-mcp/bin/docs-mcp", "serve", "--stdio"],
      "env": {
        "DOCS_MCP_EMBEDDING_BASE_URL": "http://localhost:11434/v1",
        "DOCS_MCP_EMBEDDING_MODEL": "embeddinggemma"
      }
    }
  }
}
```

Claude Code prompts to approve the server on next launch in that
project. Or register globally:

```bash
claude mcp add docs -- bun run /ABSOLUTE/PATH/TO/docs-mcp/bin/docs-mcp serve --stdio
```
</details>

<details>
<summary><b>Cursor</b></summary>

Create `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```jsonc
{
  "mcpServers": {
    "docs": {
      "command": "bun",
      "args": ["run", "/ABSOLUTE/PATH/TO/docs-mcp/bin/docs-mcp", "serve", "--stdio"],
      "env": {
        "DOCS_MCP_EMBEDDING_BASE_URL": "http://localhost:11434/v1",
        "DOCS_MCP_EMBEDDING_MODEL": "embeddinggemma"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Windsurf / Cline / Roo Code / other MCP clients</b></summary>

Most MCP-aware clients accept the same JSON shape; look for a "MCP
servers" or "Model Context Protocol" section in settings. If your
client only takes a command string, use:

```bash
bun run /ABSOLUTE/PATH/TO/docs-mcp/bin/docs-mcp serve --stdio
```
</details>

<details>
<summary><b>Remote / shared via Streamable HTTP</b></summary>

Start the server once:

```bash
DOCS_MCP_EMBEDDING_BASE_URL=http://localhost:11434/v1 \
DOCS_MCP_EMBEDDING_MODEL=embeddinggemma \
bun run /ABSOLUTE/PATH/TO/docs-mcp/bin/docs-mcp serve --http --port 7777
```

Then point any MCP client (Streamable HTTP transport) at
`http://127.0.0.1:7777/mcp`.
</details>

### 4. First crawl

From any of the agents above, ask it to:

> Index https://nextjs.org/docs in the background, then search for "app router".

Internally this calls `add_site` with `wait:false`, then `search_docs`.
The agent can poll `index_status` to see progress.

---

## Develop / contribute

```bash
bun install
bun run test
bun run check
bun run typecheck
bun run bench
```

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
  headingPath: string;     // "Guide > Routing > CampaignService"
  snippet: string;         // BM25 highlight (`<<…>>`) or first 200 chars
  description: string;     // First non-code paragraph of the chunk
  codeBlocks: Array<{ language: string | null; code: string }>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  score: number;           // normalized 0..1
  source: "bm25" | "vector" | "both";
}
```

The `content` text mirrors this as a context7-style render — each hit
becomes a `### heading / Source: … / description / fenced code / table`
block, so agents can answer the user without a separate `get_doc`
round-trip when the answer fits in a chunk.

**Spec-table docs** (Yahoo Ads, OpenAPI-style references) get a
two-step boost: (1) the extractor detects field-definition `<table>`s
and restructures each row into `<h4>fieldName</h4> + meta + description`
HTML before turndown, and (2) the chunker splits on `h1`–`h4` so each
field lands in its **own chunk** with `headingPath = "Service > Section
> fieldName"`. BM25 then matches the field name directly, and the
chunk's `description` carries the per-field doc — no `get_doc` needed
to enumerate fields.

Unknown `site_id` returns `isError: true` instead of silently empty hits.
A *known but unindexed* `site_id` (e.g. crawl still running) returns
`structuredContent.siteEmpty: true` plus a hint to poll `index_status`,
so agents don't silently treat "no pages yet" as "no matching content".

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

If a crawl yields 0 pages, or the base URL turns out to be a JS-rendered
shell (no in-scope `<a>` links in raw HTML), `structuredContent.warnings`
is populated — for example with a hint to set
`DOCS_MCP_RENDER=playwright`.

### `index_status`

```jsonc
{ "site_id": 1 }
// -> { status: "indexing"|"idle", pagesIndexed, chunksIndexed,
//      startedAt, error: string|null, warnings: string[] }
```

`warnings` carries the most recent crawl's hints (e.g. "JS-rendered
shell detected — try DOCS_MCP_RENDER=playwright") for the lifetime of
the server process.

## Configuration (env)

| variable | default | purpose |
|---|---|---|
| `DOCS_MCP_DATA_DIR` | XDG data dir | SQLite DB location (Linux: `$XDG_DATA_HOME/docs-mcp`, macOS: `~/Library/Application Support/docs-mcp`, Windows: `%LOCALAPPDATA%\docs-mcp`) |
| `DOCS_MCP_CACHE_DIR` | XDG cache dir | reserved |
| `DOCS_MCP_EMBEDDING_BASE_URL` | _(unset)_ | e.g. `http://localhost:11434/v1` (Ollama) or `http://localhost:1234/v1` (LM Studio) |
| `DOCS_MCP_EMBEDDING_MODEL` | `embeddinggemma` | Embedding model name |
| `DOCS_MCP_EMBEDDING_API_KEY` | _(unset)_ | Bearer token if required |
| `DOCS_MCP_USER_AGENT` | `docs-mcp/<ver>` | Override the crawl User-Agent |
| `DOCS_MCP_RENDER` | `fetch` | `fetch` (native) or `playwright` (JS-rendered SPA) |
| `DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT` | `60000` | Chromium launch timeout (ms). Increase on cold/slow hosts where the 60s default trips. |
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

Chromium is driven from a **node subprocess worker**
(`src/crawler/playwright-worker.mjs`), so `node` must be on `$PATH`
even when the main server runs under Bun. This is what makes the
playwright path work on Bun-on-Windows, where in-process playwright
can't speak chromium's pipe IPC. Override the worker's interpreter
via `createPlaywrightFetcher({ nodePath })` if you need a non-default
binary.

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

## License

MIT
