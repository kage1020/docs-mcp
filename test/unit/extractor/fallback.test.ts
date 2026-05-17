import { describe, expect, it } from "bun:test";
import { extract } from "../../../src/extractor/extract.ts";

const PAGE_URL = "https://example.com/doc";

function bigParagraph(label: string, n: number): string {
  const sentence = `Detailed explanation of ${label} number `;
  return `<p>${Array.from({ length: n }, (_, i) => sentence + i).join(". ")}.</p>`;
}

describe("extractor > short-output fallback", () => {
  it("falls back to <main> when Readability under-extracts a long SSR page", () => {
    // Many shallow paragraphs across many sections — Readability tends to
    // score them all low and emit a stub. The real content lives in <main>.
    const sections = Array.from({ length: 40 }, (_, i) => {
      const heading = `<h2>Section ${i}</h2>`;
      const para = `<p>Field ${i} represents the value for parameter ${i}. See related types.</p>`;
      return heading + para;
    }).join("");
    const html = `<!DOCTYPE html><html><head><title>Big SSR Doc</title></head>
<body>
  <header><nav>Site nav</nav></header>
  <main><h1>Big SSR Doc</h1>${sections}</main>
  <footer>Copyright</footer>
</body></html>`;

    const r = extract({ url: PAGE_URL, html });
    expect(r).not.toBeNull();
    const len = (r?.contentHtml ?? "").length;
    // Should be substantial — at least a few KB, not a 200B Readability stub.
    expect(len).toBeGreaterThan(2000);
    expect(r?.contentHtml).toContain("Section 0");
    expect(r?.contentHtml).toContain("Section 39");
  });

  it("keeps Readability output when it is healthy", () => {
    // One coherent article — Readability should ace this.
    const para = bigParagraph("intro", 30);
    const html = `<!DOCTYPE html><html><head><title>Article</title></head>
<body>
  <header><nav>nav</nav></header>
  <main><article><h1>Article</h1>${para}${para}${para}${para}</article></main>
  <footer>Footer</footer>
</body></html>`;

    const r = extract({ url: PAGE_URL, html });
    expect(r).not.toBeNull();
    expect(r?.contentHtml).toContain("Detailed explanation of intro");
    // Readability normally re-wraps inside a <DIV class="page" id="readability-page-1">.
    // If the fallback fired instead, the wrapper would be missing.
    expect(r?.contentHtml).toMatch(/readability-page-1|article/);
  });

  it("returns null when both Readability and fallback are empty", () => {
    const html = "<!DOCTYPE html><html><head></head><body></body></html>";
    expect(extract({ url: PAGE_URL, html })).toBeNull();
  });

  it("respects chrome-stripping even when fallback fires", () => {
    const sections = Array.from({ length: 40 }, (_, i) => `<h2>S${i}</h2><p>tiny ${i}</p>`).join(
      "",
    );
    const html = `<!DOCTYPE html><html><head><title>X</title></head>
<body>
  <nav>NAV-SHOULD-NOT-APPEAR</nav>
  <main>${sections}</main>
  <footer>FOOTER-SHOULD-NOT-APPEAR</footer>
</body></html>`;

    const r = extract({ url: PAGE_URL, html });
    expect(r?.contentHtml).not.toContain("NAV-SHOULD-NOT-APPEAR");
    expect(r?.contentHtml).not.toContain("FOOTER-SHOULD-NOT-APPEAR");
  });
});
