# docs-mcp

Fast local MCP server that indexes documentation sites by base URL and exposes
keyword search, optional semantic search, and Markdown page retrieval as MCP
tools.

> **Status**: under active development. See `.claude/plans/goofy-spinning-lantern.md`
> (or `docs/ac/phase-*.md`) for the implementation roadmap.

## Goals

- Give it a base URL (e.g. `https://nextjs.org/docs`) — it crawls, extracts,
  chunks, and indexes the site into a local SQLite database.
- BM25 full-text search out of the box (SQLite FTS5).
- Optional semantic search via any **OpenAI-compatible embeddings API**
  (Ollama, LM Studio, OpenAI, …). Auto-detected at startup; falls back to BM25
  if unavailable.
- Hybrid search via Reciprocal Rank Fusion when both are available.
- Markdown-clean output (Readability + Turndown + GFM) suitable for LLMs.
- Both **stdio** and **Streamable HTTP** MCP transports.
- Multiple sites in one server, managed via tools (`add_site`, `list_sites`, …).

## Quick start (during development)

```bash
bun install
bun run test
bun run bin/docs-mcp --help
```

## MCP tools (planned)

| tool | purpose |
|---|---|
| `search_docs` | BM25 / vector / hybrid / auto search across indexed sites |
| `get_doc` | Fetch a single URL as Markdown (cached if previously indexed) |
| `add_site` | Crawl & index a new documentation base URL |
| `remove_site` | Remove an indexed site |
| `list_sites` | List indexed sites |
| `refresh_site` | Re-crawl an indexed site (diff or full) |

## Configuration (env)

| variable | default | purpose |
|---|---|---|
| `DOCS_MCP_DATA_DIR` | XDG data dir | Override the SQLite & cache location |
| `DOCS_MCP_EMBEDDING_BASE_URL` | (unset) | e.g. `http://localhost:11434/v1` for Ollama |
| `DOCS_MCP_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model name |
| `DOCS_MCP_EMBEDDING_API_KEY` | (unset) | Bearer token if required |
| `LOG_LEVEL` | `info` | pino log level |

## License

MIT (TBD)
