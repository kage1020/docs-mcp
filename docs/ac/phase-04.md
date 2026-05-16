# Phase 4 — Acceptance Criteria (locked)

## Goal
Convert a Markdown page into search-ready chunks.

- Heading-aware sectioning (h1 / h2 / h3 boundaries; h4+ stays inline).
- Soft cap of 512 "tokens" per chunk, with an 80-token overlap between
  adjacent chunks that share the same `heading_path`.
- Code fences are never split.
- A fast, dependency-free token approximation that handles CJK.

## ACs

### Tokenizer (`src/indexer/tokenize.ts`)

1. **AC-4.1**: `tokenCount("")` is `0`.
2. **AC-4.2**: `tokenCount("hello world")` ≥ 1.
3. **AC-4.3**: For purely ASCII input, `tokenCount(s) === Math.ceil(byteLength / 4)`.
4. **AC-4.4**: For pure CJK input (e.g. 100 Japanese characters), the count
   reflects the codepoint-aware floor (≥ the CJK codepoint count). This
   prevents the byte/4 path from over-shrinking dense CJK pages.

### Chunker (`src/indexer/chunk.ts`)

5. **AC-4.5**: `chunk("# A\n\ntext\n\n## B\n\nmore")` returns at least
   two chunks; the first has `heading_path = "A"`, the second
   `heading_path = "A > B"`.
6. **AC-4.6**: An `h4` heading **does not** start a new chunk
   (kept inside the parent h3/h2/h1 chunk).
7. **AC-4.7**: A section whose body exceeds `maxTokens` is split on
   paragraph boundaries (`\n\n`) but never inside a fenced code block.
8. **AC-4.8**: A fenced code block (``` ... ```) is preserved verbatim and
   never broken across chunks.
9. **AC-4.9**: When two adjacent chunks share the same `heading_path`, the
   second chunk begins with up to `overlapTokens` worth of trailing text
   from the previous chunk (followed by a blank line). Different
   `heading_path` ⇒ no overlap is added.
10. **AC-4.10**: Each chunk carries `ord` (sequential integer starting at 0)
    and a non-zero `tokenCount`.
11. **AC-4.11**: Empty / whitespace-only Markdown produces an empty array.

These ACs are **locked**.

---

### Change log

- **2026-05-16**: Revised AC-4.3 / AC-4.4 during initial implementation.
  The original `Math.max(byte/4, codepoint*0.6)` over-counted ASCII (a
  100-char ASCII string would resolve to 60 tokens, far above any real
  tokenizer). New rule: `Math.max(byte/4, cjkCodepointCount)` — ASCII
  follows the byte path exactly, CJK is rescued by codepoint counting so a
  100-character CJK page is at least 100 tokens.
