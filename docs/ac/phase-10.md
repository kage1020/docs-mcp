# Phase 10 — Acceptance Criteria (locked)

## Goal
Make the server runnable end-to-end from the command line:
- `docs-mcp serve --stdio` and `docs-mcp serve --http --port <n>`
- `docs-mcp add <base_url>` / `list` / `remove --id` / `refresh --id`
- env-driven config (XDG paths + embedding endpoint).

## ACs

1. **AC-10.1**: `docs-mcp --version` prints `docs-mcp X.Y.Z`.
2. **AC-10.2**: `docs-mcp --help` lists every subcommand: `serve`, `add`,
   `list`, `remove`, `refresh`.
3. **AC-10.3**: `docs-mcp serve --stdio` connects an MCP server over stdio
   that an `InMemoryTransport`-style client (or any MCP client) can
   `initialize` against. (Verified indirectly by Phase 9 integration
   tests: the same server-build code runs under stdio.)
4. **AC-10.4**: `docs-mcp serve --http --port 0` starts a Streamable HTTP
   MCP endpoint at `/mcp` on a random local port and responds 405 to GET
   on that path (proves the route exists). The server can be stopped
   programmatically.
5. **AC-10.5**: `docs-mcp list` prints "(no sites indexed yet)" against an
   empty data directory.
6. **AC-10.6**: `bootstrapContext(env)` opens the DB at the resolved data
   path, runs migrations, probes the optional embedding endpoint, and
   returns a `ServerContext` plus a `shutdown()` callback.
7. **AC-10.7**: When `DOCS_MCP_EMBEDDING_BASE_URL` is unset, the context
   reports `embeddingsAvailable: false` without trying any network calls.
8. **AC-10.8**: When the embedding endpoint is configured but unreachable,
   the context still returns `embeddingsAvailable: false` (no throw).
9. **AC-10.9**: Stdout is never written by the server during stdio mode
   except for JSON-RPC framing — pino logger is bound to stderr.

These ACs are **locked**.
