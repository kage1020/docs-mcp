# docs-mcp

Fast local MCP server that indexes documentation sites by base URL and serves
keyword search, optional semantic search, and Markdown page retrieval as MCP
tools — all from a single SQLite file.

- **Bun + TypeScript** runtime, **`bun:sqlite` + `sqlite-vec`** storage,
  **FTS5 (BM25)** full-text + optional **vec0 KNN** vectors fused via
  **Reciprocal Rank Fusion**.
- Both **stdio** and **Streamable HTTP** MCP transports.
- Auto-detects any **OpenAI-compatible embeddings endpoint**
  (Ollama, LM Studio, OpenAI, …) — falls back to BM25 if none is reachable.
- Polite crawler: sitemap-first, BFS fallback, robots.txt-aware,
  per-origin QPS, exponential backoff with jitter, conditional GETs.

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

## MCP tools

| tool | purpose |
|---|---|
| `search_docs` | BM25 / vector / hybrid (RRF) / auto search across indexed sites |
| `get_doc` | Fetch a URL as Markdown (cached if previously indexed) |
| `add_site` | Crawl & index a new documentation base URL |
| `remove_site` | Remove an indexed site (cascades to pages + chunks) |
| `list_sites` | List indexed sites |
| `refresh_site` | Re-crawl an indexed site (`mode: diff | full`) |

`search_docs` returns `structuredContent.hits` shaped like:

```ts
{
  chunkId: number;
  pageUrl: string;
  pageTitle: string | null;
  headingPath: string;   // e.g. "Guide > Routing > Dynamic"
  snippet: string;
  score: number;         // normalized 0..1
  source: "bm25" | "vector" | "both";
}
```

## Configuration

| variable | default | purpose |
|---|---|---|
| `DOCS_MCP_DATA_DIR` | XDG data dir | SQLite DB location (Linux: `$XDG_DATA_HOME/docs-mcp`, macOS: `~/Library/Application Support/docs-mcp`, Windows: `%LOCALAPPDATA%\docs-mcp`) |
| `DOCS_MCP_CACHE_DIR` | XDG cache dir | reserved (unused for now) |
| `DOCS_MCP_EMBEDDING_BASE_URL` | _(unset)_ | e.g. `http://localhost:11434/v1` (Ollama) or `http://localhost:1234/v1` (LM Studio) |
| `DOCS_MCP_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model name |
| `DOCS_MCP_EMBEDDING_API_KEY` | _(unset)_ | Bearer token if required |
| `DOCS_MCP_USER_AGENT` | `docs-mcp/<ver>` | Override the crawl User-Agent |
| `DOCS_MCP_RENDER` | `fetch` | `fetch` (native, default) or `playwright` (JS-rendered SPA support) |
| `LOG_LEVEL` | `info` | pino log level (`fatal/error/warn/info/debug/trace/silent`) |

### SPA rendering with playwright (optional)

For sites whose pages render in the browser (e.g. parts of
`developers.google.com`, many React/Next.js docs apps), set
`DOCS_MCP_RENDER=playwright`. This swaps the native fetcher for a
headless-chromium one (`page.goto` → `waitUntil: domcontentloaded` →
short `networkidle` settle → `page.content()`).

Setup (one-time):

```bash
bun add -d playwright
bunx playwright install chromium
```

**Note**: at the time of writing, Bun + Windows have a stdio-pipe
incompatibility with playwright's chromium launcher, so `DOCS_MCP_RENDER=playwright`
should be run under **Node.js** on Windows. Linux and macOS Bun runs work.
The interface, env wiring, and unit tests are all in place — only the
runtime launch handshake is gated on Bun's Windows pipe support.

When the embedding endpoint is unreachable, the server logs a warning and
continues in BM25-only mode.

## Claude Desktop / Claude Code config

Add to `claude_desktop_config.json` (Claude Desktop) or
`~/.claude/mcp_servers.json` (Claude Code):

```jsonc
{
  "mcpServers": {
    "docs": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/docs-mcp/bin/docs-mcp", "serve", "--stdio"],
      "env": {
        "DOCS_MCP_EMBEDDING_BASE_URL": "http://localhost:11434/v1",
        "DOCS_MCP_EMBEDDING_MODEL": "nomic-embed-text"
      }
    }
  }
}
```

A copy lives at `examples/mcp.json`.

## Streamable HTTP

```bash
docs-mcp serve --http --port 7777
```

Then point any MCP client at `http://127.0.0.1:7777/mcp`. The transport
follows the MCP Streamable HTTP spec (POST + DELETE on `/mcp`).

## Performance benchmarks

```bash
bun run bench
bun run bench:diff bench-baseline.json bench-result.json --threshold 0.2
```

Indicative single-thread numbers on an M-class CPU:

| benchmark | hot-path mean |
|---|---|
| `crawler/url.normalize` | ~7 µs |
| `crawler/sitemap.parseSitemap` (10k urls) | ~36 ms |
| `extractor/extract` (real docs page) | ~0.8 ms |
| `extractor/markdown.htmlToMarkdown` (~200 KB body) | ~20 ms |
| `indexer/chunk.chunk` (~50 KB md) | ~1 ms |
| `search/hybrid.rrf` (top-50 × 2) | ~7 µs |
| `storage/migrate.migrate` (empty DB) | ~1 ms |

## Architecture

```
src/
├── cli/        # subcommand dispatcher + bootstrap (DB open, migrate, embedding probe)
├── mcp/        # McpServer + 6 tool handlers + zod schemas
├── crawler/    # url normalization / robots / sitemap / queue / fetcher / orchestrator
├── extractor/  # readability + linkedom + turndown(GFM)
├── indexer/    # heading-aware chunking, lightweight token approximation, indexPage()
├── search/     # BM25 / vector / hybrid (RRF) / mode dispatch
├── embedding/  # OpenAI-compatible client + probe + batch
├── storage/    # bun:sqlite + sqlite-vec, user_version migrations, repositories
├── config/     # XDG paths + zod env schema
└── logger.ts   # pino → stderr (stdio mode keeps stdout clean)
```

## Development

- TDD: each phase has acceptance criteria locked in `docs/ac/phase-XX.md`.
- `bun run test` (~140 tests, ~6 s).
- `bun run check` runs Biome (no `@ts-ignore`/`biome-ignore`/etc. allowed).
- `bun run typecheck` runs `tsc --noEmit` against the strict config
  (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).

## License

MIT (TBD)
