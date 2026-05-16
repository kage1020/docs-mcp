import { describe, expect, it } from "bun:test";
import { createRobots } from "../../../src/crawler/robots.ts";

describe("crawler/robots", () => {
  it("treats empty robots.txt as allow-all and never throws", () => {
    const r = createRobots("", "https://x.dev/");
    expect(r.isAllowed("https://x.dev/anything", "docs-mcp")).toBe(true);
    expect(r.sitemaps()).toEqual([]);
    expect(r.crawlDelay("docs-mcp")).toBeUndefined();
  });

  it("treats garbage as allow-all", () => {
    const r = createRobots("<<not robots>>", "https://x.dev/");
    expect(r.isAllowed("https://x.dev/", "docs-mcp")).toBe(true);
  });

  it("honors a global Disallow rule", () => {
    const r = createRobots("User-agent: *\nDisallow: /private", "https://x.dev/");
    expect(r.isAllowed("https://x.dev/private/secret", "docs-mcp")).toBe(false);
    expect(r.isAllowed("https://x.dev/public/page", "docs-mcp")).toBe(true);
  });

  it("honors bot-specific Allow rules over the wildcard Disallow", () => {
    const txt = ["User-agent: *", "Disallow: /", "", "User-agent: docs-mcp", "Allow: /docs/"].join(
      "\n",
    );
    const r = createRobots(txt, "https://x.dev/");
    expect(r.isAllowed("https://x.dev/docs/intro", "docs-mcp")).toBe(true);
    expect(r.isAllowed("https://x.dev/docs/intro", "OtherBot")).toBe(false);
  });

  it("parses Crawl-delay as a number", () => {
    const r = createRobots(["User-agent: docs-mcp", "Crawl-delay: 5"].join("\n"), "https://x.dev/");
    expect(r.crawlDelay("docs-mcp")).toBe(5);
    expect(r.crawlDelay("OtherBot")).toBeUndefined();
  });

  it("returns Sitemap URLs", () => {
    const r = createRobots(
      ["Sitemap: https://x.dev/sitemap.xml", "Sitemap: https://x.dev/news.xml"].join("\n"),
      "https://x.dev/",
    );
    expect(r.sitemaps()).toEqual(["https://x.dev/sitemap.xml", "https://x.dev/news.xml"]);
  });
});
