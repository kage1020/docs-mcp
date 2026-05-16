# Phase 1 — Acceptance Criteria (locked)

## Goal
Provide the SQLite storage substrate that every later phase will use:
`bun:sqlite` + `sqlite-vec` loading, XDG-aware data directory resolution,
and `PRAGMA user_version`-driven migrations.

## ACs

1. **AC-1.1**: `openDb({ dbPath, enableVec })` returns a handle with
   `{ db, vecAvailable, close() }`. With `dbPath: ":memory:"` and
   `enableVec: true`, `vecAvailable === true` on a runtime that bundles a
   load-extension capable SQLite (default Bun).
2. **AC-1.2**: `migrate(db)` on an empty DB applies all migrations and sets
   `PRAGMA user_version` to the highest known version (currently `2`). Tables
   `sites`, `pages`, `chunks`, `embeddings_meta`, and the FTS5 virtual table
   `chunks_fts` all exist afterwards.
3. **AC-1.3**: `migrate(db)` is **idempotent**: calling it again on a fully
   migrated DB performs no DDL writes and leaves `user_version` unchanged.
4. **AC-1.4**: `sites.base_url` is `UNIQUE` — inserting the same URL twice
   throws a `SQLITE_CONSTRAINT` error.
5. **AC-1.5**: Foreign keys are enforced (`PRAGMA foreign_keys = ON`).
   Deleting a `sites` row cascades to its `pages` and to each page's
   `chunks`.
6. **AC-1.6**: When `customSqlitePath` is provided and points to a
   nonexistent file, `openDb` still succeeds (falls back to Bun's bundled
   SQLite) without throwing.
7. **AC-1.7**: A pure INSERT into `chunks` is auto-propagated to
   `chunks_fts` by the triggers, so `MATCH` queries find the new chunk.
   UPDATE and DELETE on `chunks` keep `chunks_fts` in sync.
8. **AC-1.8**: `ensureVecTable(db, dim)` creates the `chunks_vec` virtual
   table with the given dimension and records `('dim', String(dim))` in
   `embeddings_meta`. Calling it again with the same `dim` is a no-op
   (returns `false`). With a different `dim`, it drops & recreates the
   table and returns `true`.
9. **AC-1.9**: `resolveDataDir(env)` returns the platform-correct location:
   - `DOCS_MCP_DATA_DIR` overrides everything if set
   - Linux: `$XDG_DATA_HOME/docs-mcp` (default `~/.local/share/docs-mcp`)
   - macOS: `~/Library/Application Support/docs-mcp`
   - Windows: `%LOCALAPPDATA%\docs-mcp`
10. **AC-1.10**: `resolveCacheDir(env)` follows the analogous OS conventions
    (Linux `$XDG_CACHE_HOME`, macOS `~/Library/Caches/docs-mcp`,
    Windows `%LOCALAPPDATA%\docs-mcp\cache`).

These ACs are **locked**. Any change requires a written justification appended below.
