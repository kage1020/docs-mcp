import { afterEach, describe, expect, it } from "bun:test";
import { gzipSync } from "node:zlib";
import { loadSitemap } from "../../../src/crawler/site-setup.ts";
import { startServer, type TestServer } from "../../helpers/http-server.ts";

describe("crawler/loadSitemap > gzip", () => {
  let server: TestServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it("decompresses .xml.gz sitemap with no Content-Encoding header", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/docs/a</loc></url>
  <url><loc>https://example.com/docs/b</loc></url>
  <url><loc>https://example.com/docs/c</loc></url>
</urlset>`;
    const gzipped = gzipSync(Buffer.from(xml, "utf-8"));
    server = startServer((req) => {
      const u = new URL(req.url);
      if (u.pathname === "/site.xml.gz") {
        return new Response(gzipped, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const urls = await loadSitemap(`${server.origin}/docs`, undefined, {}, [
      `${server.origin}/site.xml.gz`,
    ]);
    expect(urls).toContain("https://example.com/docs/a");
    expect(urls).toContain("https://example.com/docs/b");
    expect(urls).toContain("https://example.com/docs/c");
  });

  it("returns no URLs for a malformed gzipped body without throwing", async () => {
    server = startServer((req) => {
      const u = new URL(req.url);
      if (u.pathname === "/bad.xml.gz") {
        return new Response(Buffer.from("not actually gzipped"), {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const urls = await loadSitemap(`${server.origin}/docs`, undefined, {}, [
      `${server.origin}/bad.xml.gz`,
    ]);
    expect(urls).toEqual([]);
  });

  it("handles a gzipped sitemap-index referencing a gzipped urlset", async () => {
    const childXml = `<?xml version="1.0"?>
<urlset><url><loc>https://example.com/x/1</loc></url></urlset>`;
    const childGz = gzipSync(Buffer.from(childXml, "utf-8"));
    server = startServer((req) => {
      const u = new URL(req.url);
      if (u.pathname === "/index.xml.gz") {
        const origin = `${u.protocol}//${u.host}`;
        const indexXml = `<?xml version="1.0"?>
<sitemapindex><sitemap><loc>${origin}/child.xml.gz</loc></sitemap></sitemapindex>`;
        return new Response(gzipSync(Buffer.from(indexXml, "utf-8")), {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
      if (u.pathname === "/child.xml.gz") {
        return new Response(childGz, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const urls = await loadSitemap(`${server.origin}/x`, undefined, {}, [
      `${server.origin}/index.xml.gz`,
    ]);
    expect(urls).toContain("https://example.com/x/1");
  });

  it("plain (non-gz) sitemaps still work via the existing fetcher path", async () => {
    server = startServer((req) => {
      const u = new URL(req.url);
      if (u.pathname === "/site.xml") {
        return new Response(
          `<?xml version="1.0"?><urlset><url><loc>https://example.com/plain</loc></url></urlset>`,
          { status: 200, headers: { "Content-Type": "application/xml" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    const urls = await loadSitemap(`${server.origin}/x`, undefined, {}, [
      `${server.origin}/site.xml`,
    ]);
    expect(urls).toContain("https://example.com/plain");
  });
});
