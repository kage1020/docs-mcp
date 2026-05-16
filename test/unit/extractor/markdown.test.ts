import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extract } from "../../../src/extractor/extract.ts";
import { htmlToMarkdown } from "../../../src/extractor/markdown.ts";

const FIXTURE = readFileSync(
  join(import.meta.dir, "..", "..", "fixtures", "html", "nextjs-doc.html"),
  "utf8",
);
const PAGE_URL = "https://nextjs.org/docs/app-router/routing";

describe("extractor/markdown", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });

  it("emits ATX heading for h1", () => {
    expect(htmlToMarkdown("<h1>Hi</h1>")).toContain("# Hi");
  });

  it("emits fenced code block with language hint", () => {
    const md = htmlToMarkdown(`<pre><code class="language-ts">const x: number = 1;</code></pre>`);
    expect(md).toContain("```ts");
    expect(md).toContain("const x: number = 1;");
    expect(md).toContain("```");
  });

  it("emits fenced code with no language when class is missing", () => {
    const md = htmlToMarkdown(`<pre><code>plain code</code></pre>`);
    expect(md).toMatch(/```\nplain code\n```/);
  });

  it("emits inline code with backticks", () => {
    expect(htmlToMarkdown("<p>use <code>foo</code> please</p>")).toContain("`foo`");
  });

  it("emits GFM tables", () => {
    const md = htmlToMarkdown(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    );
    expect(md).toContain("| A | B |");
    expect(md).toContain("| 1 | 2 |");
  });

  it("emits strikethrough for <del>", () => {
    expect(htmlToMarkdown("<p><del>gone</del></p>")).toContain("~");
  });

  it("uses - for unordered list markers", () => {
    const md = htmlToMarkdown("<ul><li>x</li><li>y</li></ul>");
    expect(md).toMatch(/^-\s+x/m);
    expect(md).toMatch(/^-\s+y/m);
  });

  it("converts the next.js fixture end-to-end with absolute URLs", () => {
    const extracted = extract({ url: PAGE_URL, html: FIXTURE });
    expect(extracted).not.toBeNull();
    const md = htmlToMarkdown(extracted?.contentHtml ?? "");
    expect(md).toContain("App Router Routing");
    expect(md).toContain("```ts");
    expect(md).toContain("| Code | Meaning |");
    expect(md).toContain("(https://nextjs.org/docs/dynamic-routes)");
    expect(md).toContain("(https://nextjs.org/docs/conventions)");
  });

  it("does not throw on malformed HTML", () => {
    expect(() => htmlToMarkdown("<not><<a real><<tag>>")).not.toThrow();
  });
});
