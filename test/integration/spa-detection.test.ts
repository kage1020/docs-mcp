import { afterEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { crawl } from "../../src/crawler/crawl.ts";
import { fetchUrl } from "../../src/crawler/fetcher.ts";
import { createCrawlerQueue } from "../../src/crawler/queue.ts";
import { createRobots } from "../../src/crawler/robots.ts";
import type { ServerContext } from "../../src/mcp/context.ts";
import { buildMcpServer } from "../../src/mcp/server.ts";
import { type DbHandle, openDb } from "../../src/storage/db.ts";
import { migrate } from "../../src/storage/migrate.ts";
import { createSite } from "../../src/storage/repositories/sites.ts";
import { startServer, type TestServer } from "../helpers/http-server.ts";

const SPA_SHELL_HTML = `<!doctype html>
<html><head><title>App</title></head>
<body><div id="root"></div><script src="/app.js"></script></body></html>`;

const RICH_HTML = `<!doctype html>
<html><head><title>Docs Home</title></head>
<body><main>
  <h1>Welcome</h1>
  <p>This documentation is rendered server-side.</p>
  <p>Long enough paragraph so readability is happy. Long enough paragraph so readability is happy. Long enough paragraph so readability is happy.</p>
  <ul>
    <li><a href="/guide">Guide</a></li>
    <li><a href="/api">API</a></li>
  </ul>
</main></body></html>`;

describe("integration/spa-detection", () => {
  const handles: DbHandle[] = [];
  const servers: TestServer[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) h.close();
    for (const s of servers.splice(0)) await s.stop();
  });

  function setupSite(handler: Parameters<typeof startServer>[0]) {
    const server = startServer(handler);
    servers.push(server);
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    migrate(h.db);
    const siteId = createSite(h.db, {
      baseUrl: `${server.origin}/`,
      name: "fixture",
      crawlOptionsJson: "{}",
    });
    const robots = createRobots("", `${server.origin}/`);
    return { server, h, siteId, robots };
  }

  it("AC-24.3: surfaces SPA warning when root returns shell with no in-scope links", async () => {
    const { server, h, siteId, robots } = setupSite(
      () => new Response(SPA_SHELL_HTML, { headers: { "content-type": "text/html" } }),
    );
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl: `${server.origin}/`,
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.warnings ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/SPA|playwright/i)]),
    );
  });

  it("AC-24.2: warns when 0 pages indexed but a fetch was attempted", async () => {
    const { server, h, siteId, robots } = setupSite(
      () => new Response("", { status: 404, headers: { "content-type": "text/html" } }),
    );
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl: `${server.origin}/`,
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesAdded + result.pagesUpdated + result.pagesUnchanged).toBe(0);
    expect(result.warnings ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/0 pages|no pages/i)]),
    );
  });

  it("AC-24.4: no warnings emitted on a normal successful crawl", async () => {
    const { server, h, siteId, robots } = setupSite(
      () => new Response(RICH_HTML, { headers: { "content-type": "text/html" } }),
    );
    const q = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const result = await crawl({
      siteId,
      baseUrl: `${server.origin}/`,
      queue: q,
      robots,
      db: h.db,
    });
    expect(result.pagesAdded).toBeGreaterThan(0);
    expect(result.warnings ?? []).toEqual([]);
  });

  it("AC-24.6: add_site surfaces SPA warnings via structuredContent.warnings", async () => {
    const server = startServer(
      () => new Response(SPA_SHELL_HTML, { headers: { "content-type": "text/html" } }),
    );
    servers.push(server);
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    migrate(h.db);

    const ctx: ServerContext = {
      db: h.db,
      queue: createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 }),
      embeddingsAvailable: false,
      fetcher: fetchUrl,
      indexingTasks: new Map(),
      robotsCache: new Map(),
      lastCrawlResults: new Map(),
    };
    const mcp = buildMcpServer(ctx);
    const [c, s] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([client.connect(c), mcp.connect(s)]);

    const res = await client.callTool({
      name: "add_site",
      arguments: { base_url: `${server.origin}/`, name: "spa-fixture", wait: true },
    });
    const struct = res.structuredContent as { warnings?: string[] } | undefined;
    expect(struct?.warnings ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/playwright/i)]),
    );

    await mcp.close();
  });
});
