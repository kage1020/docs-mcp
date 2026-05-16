import { afterEach, describe, expect, it } from "bun:test";
import { crawl } from "../../src/crawler/crawl.ts";
import { createCrawlerQueue } from "../../src/crawler/queue.ts";
import { createRobots } from "../../src/crawler/robots.ts";
import { type DbHandle, openDb } from "../../src/storage/db.ts";
import { migrate } from "../../src/storage/migrate.ts";
import { countChunks } from "../../src/storage/repositories/chunks.ts";
import { countPages, getPageByUrl } from "../../src/storage/repositories/pages.ts";
import { createSite } from "../../src/storage/repositories/sites.ts";
import { type DocsSite, startDocsSite } from "../helpers/docs-site.ts";

describe("integration/crawl-flow", () => {
  const handles: DbHandle[] = [];
  const sites: DocsSite[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) h.close();
    for (const s of sites.splice(0)) await s.server.stop();
  });

  function setupSite() {
    const site = startDocsSite();
    sites.push(site);
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    migrate(h.db);
    const siteId = createSite(h.db, {
      baseUrl: site.baseUrl,
      name: "fixture",
      crawlOptionsJson: "{}",
    });
    const robots = createRobots("User-agent: *\nDisallow: /private\n", site.baseUrl);
    const origin = site.server.origin;
    const initialUrls = [`${origin}/`, `${origin}/a`, `${origin}/b`, `${origin}/c`];
    return { site, h, siteId, robots, initialUrls };
  }

  it("indexes every sitemap URL and skips robots-disallowed paths", async () => {
    const { site, h, siteId, robots, initialUrls } = setupSite();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl: site.baseUrl,
      initialUrls,
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesAdded).toBe(4);
    expect(result.pagesUpdated).toBe(0);
    expect(countPages(h.db, siteId)).toBe(4);
    expect(getPageByUrl(h.db, siteId, `${site.server.origin}/private/secret`)).toBeUndefined();
    expect(countChunks(h.db, siteId)).toBeGreaterThan(0);
  });

  it("second crawl reports unchanged when content is identical", async () => {
    const { site, h, siteId, robots, initialUrls } = setupSite();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    await crawl({ siteId, baseUrl: site.baseUrl, initialUrls, queue: q, robots, db: h.db });
    const second = await crawl({
      siteId,
      baseUrl: site.baseUrl,
      initialUrls,
      queue: q,
      robots,
      db: h.db,
    });
    expect(second.pagesAdded).toBe(0);
    expect(second.pagesUpdated).toBe(0);
    expect(second.pagesUnchanged).toBe(4);
  });

  it("detects a single page change", async () => {
    const { site, h, siteId, robots, initialUrls } = setupSite();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    await crawl({ siteId, baseUrl: site.baseUrl, initialUrls, queue: q, robots, db: h.db });
    site.setPage("/a", {
      path: "/a",
      title: "Topic A v2",
      body: "Brand new content for topic A. This paragraph is long enough to satisfy the readability heuristic. The version has been bumped and the indexer should detect this mutation immediately.",
    });
    const result = await crawl({
      siteId,
      baseUrl: site.baseUrl,
      initialUrls,
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesUpdated).toBe(1);
    expect(result.pagesUnchanged).toBe(3);
  });

  it("excludePatterns removes matching URLs", async () => {
    const { site, h, siteId, robots, initialUrls } = setupSite();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl: site.baseUrl,
      initialUrls,
      excludePatterns: ["/a/"],
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesAdded).toBe(3);
    expect(getPageByUrl(h.db, siteId, `${site.server.origin}/a`)).toBeUndefined();
  });

  it("maxPages caps the number of indexed pages", async () => {
    const { site, h, siteId, robots, initialUrls } = setupSite();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl: site.baseUrl,
      initialUrls,
      maxPages: 2,
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesAdded).toBe(2);
    expect(countPages(h.db, siteId)).toBe(2);
  });

  it("falls back to BFS when no initialUrls are provided", async () => {
    const { site, h, siteId, robots } = setupSite();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl: site.baseUrl,
      // no initialUrls — must follow <a> links from `/`
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesAdded).toBeGreaterThanOrEqual(3);
  });
});
