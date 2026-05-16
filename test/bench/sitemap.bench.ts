import { bench, describe } from "vitest";
import { parseSitemap } from "../../src/crawler/sitemap.ts";

function buildSitemap(n: number): string {
  const urls = Array.from(
    { length: n },
    (_, i) => `<url><loc>https://docs.example.com/page-${i}</loc></url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

const SMALL = buildSitemap(100);
const LARGE = buildSitemap(10_000);

describe("crawler/sitemap.parseSitemap", () => {
  bench("100 urls", () => {
    parseSitemap(SMALL);
  });

  bench("10k urls", () => {
    parseSitemap(LARGE);
  });
});
