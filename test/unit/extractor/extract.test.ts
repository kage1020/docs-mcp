import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extract } from "../../../src/extractor/extract.ts";

const FIXTURE = readFileSync(
  join(import.meta.dir, "..", "..", "fixtures", "html", "nextjs-doc.html"),
  "utf8",
);
const PAGE_URL = "https://nextjs.org/docs/app-router/routing";

describe("extractor/extract", () => {
  it("returns title, url, and content html", () => {
    const r = extract({ url: PAGE_URL, html: FIXTURE });
    expect(r).not.toBeNull();
    expect(r?.url).toBe(PAGE_URL);
    expect(r?.title).toMatch(/Routing|App Router Routing/);
    expect(typeof r?.contentHtml).toBe("string");
  });

  it("strips nav / header / footer / aside / script chrome", () => {
    const html = extract({ url: PAGE_URL, html: FIXTURE })?.contentHtml ?? "";
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("Copyright");
    expect(html).not.toContain("Related");
  });

  it("resolves relative anchors against page URL", () => {
    // `../dynamic-routes` against `.../routing` (treated as a file segment by
    // the URL spec) resolves to `https://nextjs.org/docs/dynamic-routes`.
    const html = extract({ url: PAGE_URL, html: FIXTURE })?.contentHtml ?? "";
    expect(html).toContain("https://nextjs.org/docs/dynamic-routes");
  });

  it("preserves absolute anchors as-is", () => {
    const html = extract({ url: PAGE_URL, html: FIXTURE })?.contentHtml ?? "";
    expect(html).toContain("https://nextjs.org/docs/conventions");
  });

  it("absolutizes <img src> and drops srcset", () => {
    const html = extract({ url: PAGE_URL, html: FIXTURE })?.contentHtml ?? "";
    expect(html).toContain("https://nextjs.org/docs/img/routing.png");
    expect(html).not.toContain("srcset=");
  });

  it("returns null when html is empty / whitespace-only", () => {
    expect(extract({ url: PAGE_URL, html: "" })).toBeNull();
    expect(extract({ url: PAGE_URL, html: "    " })).toBeNull();
  });

  it("uses <base href> when present", () => {
    const html = `<!DOCTYPE html><html><head><base href="https://other.example/foo/"><title>T</title></head>
      <body><main><article><h1>Title</h1>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit.</p>
        <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt. <a href="bar">link</a></p>
      </article></main></body></html>`;
    const r = extract({ url: "https://x.dev/", html });
    expect(r?.contentHtml).toContain("https://other.example/foo/bar");
  });
});
