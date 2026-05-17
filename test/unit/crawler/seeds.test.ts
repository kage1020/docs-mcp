import { afterEach, describe, expect, it } from "bun:test";
import { crawl } from "../../../src/crawler/crawl.ts";
import { createCrawlerQueue } from "../../../src/crawler/queue.ts";
import { createRobots } from "../../../src/crawler/robots.ts";
import { type DbHandle, openDb } from "../../../src/storage/db.ts";
import { migrate } from "../../../src/storage/migrate.ts";
import { countPages } from "../../../src/storage/repositories/pages.ts";
import { createSite } from "../../../src/storage/repositories/sites.ts";
import { type DocsSite, startDocsSite } from "../../helpers/docs-site.ts";

describe("crawler/crawl > seed selection", () => {
  const handles: DbHandle[] = [];
  const sites: DocsSite[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) h.close();
    for (const s of sites.splice(0)) await s.server.stop();
  });

  function setup() {
    const site = startDocsSite();
    sites.push(site);
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    migrate(h.db);
    const baseUrl = `${site.server.origin}/a`;
    const siteId = createSite(h.db, {
      baseUrl,
      name: "scoped",
      crawlOptionsJson: "{}",
    });
    const robots = createRobots("", baseUrl);
    return { site, h, siteId, baseUrl, robots };
  }

  it("indexes baseUrl even when every initialUrl is out-of-scope", async () => {
    const { site, h, siteId, baseUrl, robots } = setup();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const outOfScope = [`${site.server.origin}/b`, `${site.server.origin}/c`];
    const result = await crawl({
      siteId,
      baseUrl,
      initialUrls: outOfScope,
      maxDepth: 0,
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesAdded).toBeGreaterThanOrEqual(1);
    expect(countPages(h.db, siteId)).toBeGreaterThanOrEqual(1);
  });

  it("does not double-enqueue baseUrl when it also appears in initialUrls", async () => {
    const { h, siteId, baseUrl, robots } = setup();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl,
      initialUrls: [baseUrl, baseUrl],
      maxDepth: 0,
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesAdded).toBe(1);
    expect(result.pagesSkipped).toBe(0);
  });

  it("only out-of-scope URLs are silently dropped (not counted as skipped)", async () => {
    const { site, h, siteId, baseUrl, robots } = setup();
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl,
      initialUrls: [
        `${site.server.origin}/b`,
        `${site.server.origin}/c`,
        `${site.server.origin}/private/secret`,
      ],
      maxDepth: 0,
      queue: q,
      robots,
      db: h.db,
    });
    // baseUrl is the only seed that runs; out-of-scope URLs are dropped
    // *before* enqueue, so they don't inflate pagesSkipped.
    expect(result.pagesAdded).toBe(1);
    expect(result.pagesSkipped).toBe(0);
  });
});
