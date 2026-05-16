import { describe, expect, it } from "bun:test";
import { parseSitemap } from "../../../src/crawler/sitemap.ts";

describe("crawler/sitemap", () => {
  it("extracts <loc> values from a urlset", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://x.dev/a</loc></url>
  <url><loc>  https://x.dev/b  </loc></url>
</urlset>`;
    const r = parseSitemap(xml);
    expect(r.urls).toEqual(["https://x.dev/a", "https://x.dev/b"]);
    expect(r.sitemaps).toEqual([]);
  });

  it("extracts child sitemap URLs from a sitemapindex", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://x.dev/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://x.dev/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;
    const r = parseSitemap(xml);
    expect(r.sitemaps).toEqual(["https://x.dev/sitemap-1.xml", "https://x.dev/sitemap-2.xml"]);
    expect(r.urls).toEqual([]);
  });

  it("deduplicates URLs", () => {
    const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://x.dev/a</loc></url>
  <url><loc>https://x.dev/a</loc></url>
</urlset>`;
    expect(parseSitemap(xml).urls).toEqual(["https://x.dev/a"]);
  });

  it("returns empty result for empty / non-string / non-XML input", () => {
    expect(parseSitemap("")).toEqual({ urls: [], sitemaps: [] });
    expect(parseSitemap("   ")).toEqual({ urls: [], sitemaps: [] });
    expect(parseSitemap("plain text")).toEqual({ urls: [], sitemaps: [] });
    expect(parseSitemap("<broken><xml>")).toEqual({ urls: [], sitemaps: [] });
  });

  it("drops non-http(s) URLs", () => {
    const xml = `<urlset>
      <url><loc>mailto:foo@x.dev</loc></url>
      <url><loc>https://x.dev/ok</loc></url>
    </urlset>`;
    expect(parseSitemap(xml).urls).toEqual(["https://x.dev/ok"]);
  });
});
