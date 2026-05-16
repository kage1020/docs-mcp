import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bench, describe } from "vitest";
import { extract } from "../../src/extractor/extract.ts";
import { htmlToMarkdown } from "../../src/extractor/markdown.ts";

const SMALL = readFileSync(
  join(import.meta.dirname ?? __dirname, "..", "fixtures", "html", "nextjs-doc.html"),
  "utf8",
);

function buildLarge(): string {
  const para = `<p>${"Lorem ipsum dolor sit amet. ".repeat(80)}</p>`;
  const code = `<pre><code class="language-ts">const x: number = 1;\n</code></pre>`;
  const section = `<h2>Section</h2>${para.repeat(4)}${code}`;
  return `<!DOCTYPE html><html><head><title>Big Page</title></head>
<body><main><article><h1>Big Page</h1>${section.repeat(40)}</article></main></body></html>`;
}
const LARGE = buildLarge();
const SMALL_EXTRACTED = extract({ url: "https://x/sample", html: SMALL })?.contentHtml ?? SMALL;
const LARGE_EXTRACTED = extract({ url: "https://x/big", html: LARGE })?.contentHtml ?? LARGE;

describe("extractor/markdown.htmlToMarkdown", () => {
  bench("nextjs fixture", () => {
    htmlToMarkdown(SMALL_EXTRACTED);
  });

  bench("synthetic ~200KB body", () => {
    htmlToMarkdown(LARGE_EXTRACTED);
  });
});

describe("extractor/extract", () => {
  bench("nextjs fixture", () => {
    extract({ url: "https://x/sample", html: SMALL });
  });
});
