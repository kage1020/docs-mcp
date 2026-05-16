# Phase 11 — Acceptance Criteria (locked)

## Goal
`bun run bench` exercises the hot paths via `vitest bench` and writes a
JSON report so CI can diff against a baseline.

## ACs

1. **AC-11.1**: `bun run bench` exits 0 and produces `bench-result.json`.
2. **AC-11.2**: At minimum the following hot paths are benchmarked:
   - `crawler/url.normalize`
   - `crawler/sitemap.parseSitemap` on a 10k-URL sitemap
   - `extractor/markdown.htmlToMarkdown` on a real-world page (~200 KB HTML)
   - `indexer/chunk.chunk` on a 50 KB markdown body
   - `search/bm25.searchBm25` against a 10k-chunk in-memory DB
   - `search/hybrid.rrf` on synthetic top-50 lists
   - `storage/migrate.migrate` on an empty in-memory DB
3. **AC-11.3**: `scripts/bench-diff.ts` reads two `bench-result.json`-shaped
   files and exits non-zero when any benchmark slows down by more than
   `--threshold` (default 20%). Used by CI on PRs after main has a
   baseline.

These ACs are **locked**.
