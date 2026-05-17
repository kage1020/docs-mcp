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

  it("AC-34.1: spec-style HTML tables get restructured into per-field <h4> blocks", () => {
    // Mimics Yahoo Ads / OpenAPI spec docs: dense field tables with
    // multi-paragraph cells. Markdown tables can't represent these, so
    // each row gets restructured into <h4>fieldName</h4> +
    // <p>type · required · …</p> + <div>description</div>. The chunker
    // then turns each field into its own searchable unit with the
    // field name in the heading_path.
    const row = (i: number) => `<tr>
      <td class="paramName"><span class="indent"></span>field${i}</td>
      <td></td>
      <td>string</td>
      <td>true</td>
      <td>title: ServiceField${i}<br>
        <div lang="ja">ServiceField${i}、ユーザー設定情報。ADD時、このフィールドは必須となります。</div>
        <div lang="en">ServiceField${i} settings. This field is required on ADD.</div>
      </td>
    </tr>`;
    const tableBlock = (n: number) =>
      `<table><thead><tr><th>name</th><th></th><th>type</th><th>required</th><th>description</th></tr></thead>
        <tbody>${Array.from({ length: n }, (_, i) => row(i)).join("")}</tbody></table>`;
    const html = `<!DOCTYPE html><html><head><title>API Reference</title></head>
      <body><main>
        <h1>CampaignService.get</h1>
        <p>Returns campaign objects.</p>
        <h2>Request</h2>
        ${tableBlock(15)}
        <h2>Response</h2>
        ${tableBlock(25)}
      </main></body></html>`;
    const r = extract({ url: "https://api.example.com/CampaignService/get/", html });
    expect(r).not.toBeNull();
    const out = r?.contentHtml ?? "";
    // Spec-table marker is set so downstream tooling can identify the
    // structure if needed.
    expect(out).toContain('data-spec-table="true"');
    // Every body row becomes its own <h4>fieldN</h4> heading.
    const h4Matches = out.match(/<h4[^>]*>field\d+<\/h4>/g) ?? [];
    expect(h4Matches.length).toBeGreaterThanOrEqual(40);
    expect(out).toContain("<h4>field0</h4>");
    expect(out).toContain("<h4>field24</h4>");
    // The metadata cells (type, required) end up in a paragraph.
    expect(out).toMatch(/<p>string · true<\/p>/);
  });
});
