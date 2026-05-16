# Phase 0 — Acceptance Criteria (locked)

## Goal
Bootstrap the repository so that every later phase has a working CI/test/lint pipeline.

## ACs

1. **AC-0.1**: `bun install` completes successfully and writes a `bun.lock`.
2. **AC-0.2**: `bun run check` (Biome) exits 0 on the bootstrap codebase.
3. **AC-0.3**: `bun run typecheck` (`tsc --noEmit`) exits 0.
4. **AC-0.4**: `bun run test` exits 0 with the `cli` test suite green.
5. **AC-0.5**: `bun run bin/docs-mcp --version` prints `docs-mcp X.Y.Z\n` to stdout and exits 0.
6. **AC-0.6**: `bun run bin/docs-mcp --help` (and bare invocation) prints help that mentions all six future subcommands (`serve`, `add`, `list`, `remove`, `refresh`).
7. **AC-0.7**: GitHub Actions workflow runs `bun install → bun run check → bun run typecheck → bun run test` on push & PR for Linux, macOS, and Windows runners.
8. **AC-0.8**: No third-party dependency is pinned with a fixed version inside `package.json` — every dep was installed via `bun add --latest`.
9. **AC-0.9**: No file contains `@ts-ignore`, `@ts-expect-error`, `biome-ignore`, or any equivalent linter-suppression directive.

These ACs are **locked**. Changing them requires a written justification appended below.
