# Phase 3 — Acceptance Criteria (locked)

## Goal
Turn arbitrary documentation HTML into clean Markdown:
1. Strip site chrome (nav/header/footer/aside) via Readability.
2. Resolve relative links/images against the page URL.
3. Convert to Markdown with GFM (tables, strikethrough, fenced code with
   language hint).

## ACs

### Extract (`src/extractor/extract.ts`)

1. **AC-3.1**: `extract({ url, html })` returns `{ url, title, contentHtml }`
   with chrome elements (`nav`, `header`, `footer`, `aside`) removed from
   `contentHtml`.
2. **AC-3.2**: `<title>` (or the first `<h1>`) is exposed as the result's
   `title` (trimmed). If neither exists, `title` is `null`.
3. **AC-3.3**: Every `<a href>` and `<img src>` in the extracted content is
   absolute. A relative href like `"../about"` against
   `https://x.dev/docs/intro` becomes `https://x.dev/about`. A `<base href>`
   in the original document is honored.
4. **AC-3.4**: `srcset` is removed from images; only the absolute `src` is
   preserved.
5. **AC-3.5**: When the page is too short / has no extractable article,
   `extract` returns `null` instead of throwing.

### HTML → Markdown (`src/extractor/markdown.ts`)

6. **AC-3.6**: `htmlToMarkdown(html)` returns Markdown that:
   - uses **ATX headings** (`# Title`)
   - emits **fenced** code blocks (\`\`\`lang ... \`\`\`) with the language
     recovered from `class="language-<lang>"` or `class="hljs language-<lang>"`
   - emits **GFM tables**
   - emits **strikethrough** for `<del>` / `<s>`
   - uses `-` as the unordered list marker.
7. **AC-3.7**: Inline `<code>` is wrapped in backticks; multi-line `<pre><code>`
   is emitted as a fenced block — never as indented code.
8. **AC-3.8**: Anchor and image URLs in the rendered Markdown are absolute
   (verified end-to-end alongside `extract`).
9. **AC-3.9**: `htmlToMarkdown` never throws on real-world docs HTML.

These ACs are **locked**.
