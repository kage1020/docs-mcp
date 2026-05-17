# Phase 16 — Acceptance Criteria (locked)

## Goal
Catch the case where Readability is over-aggressive on SSR-heavy
documentation pages (e.g. Google Developer reference): the score-based
heuristic trims a 3 MB SSR'd page down to a 1 KB stub of
title + metadata. Add a length-ratio sanity check that falls back to
the raw `<main>` / `<article>` element when Readability's output is a
tiny fraction of the original body text.

## ACs

### Length-ratio fallback (`src/extractor/extract.ts`)

1. **AC-16.1**: When Readability returns content whose plain-text length
   is **< 5%** of the original `<body>` plain-text length, `extract`
   tries the largest of `<main>`, `<article>`, `[role=main]` and adopts
   that element's `innerHTML` instead — but only if its plain-text length
   is **at least 2× the Readability content's** length.
2. **AC-16.2**: When Readability's content is healthy (≥ 5% of body),
   it is kept as-is (back-compat with the nextjs fixture in Phase 3).
3. **AC-16.3**: When Readability returns nothing, the existing fallback
   chain (`<main>` → `<article>` → `<body>`) is unchanged.
4. **AC-16.4**: When both Readability and the candidate fallback are
   empty, `extract` returns `null` (unchanged).
5. **AC-16.5**: The fallback honors chrome-stripping done earlier in the
   pipeline (nav/header/footer/aside already removed).

### Title preservation

6. **AC-16.6**: Even when the body fallback fires, the `title` field
   continues to use Readability's `article.title` when present, falling
   back to `<title>` / `<h1>` otherwise.

These ACs are **locked**.
