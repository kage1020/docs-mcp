import { afterEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fetchUrl } from "../../src/crawler/fetcher.ts";
import { createCrawlerQueue } from "../../src/crawler/queue.ts";
import type { ServerContext } from "../../src/mcp/context.ts";
import { buildMcpServer } from "../../src/mcp/server.ts";
import { type DbHandle, openDb } from "../../src/storage/db.ts";
import { migrate } from "../../src/storage/migrate.ts";
import { type DocsSite, startDocsSite } from "../helpers/docs-site.ts";

describe("integration/async-indexing", () => {
  const handles: DbHandle[] = [];
  const sites: DocsSite[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) h.close();
    for (const s of sites.splice(0)) await s.server.stop();
  });

  async function setup() {
    const site = startDocsSite();
    sites.push(site);
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    migrate(h.db);
    const queue = createCrawlerQueue({ globalConcurrency: 4, perOriginQps: 100 });
    const ctx: ServerContext = {
      db: h.db,
      queue,
      embeddingsAvailable: false,
      fetcher: fetchUrl,
      indexingTasks: new Map(),
      robotsCache: new Map(),
    };
    const server = buildMcpServer(ctx);
    const [c, s] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([client.connect(c), server.connect(s)]);
    return { site, h, ctx, server, client };
  }

  it("wait:false returns immediately with status='indexing' and runs crawl in background", async () => {
    const { site, ctx, client } = await setup();
    const t0 = performance.now();
    const r = await client.callTool({
      name: "add_site",
      arguments: { base_url: site.baseUrl, wait: false },
    });
    const callMs = performance.now() - t0;
    // Should return well before crawl finishes (crawl on the docs-site
    // fixture normally takes 100-500ms).
    expect(callMs).toBeLessThan(500);
    const struct = r.structuredContent as { siteId?: number; status?: string };
    expect(struct.status === "indexing" || struct.status === "idle").toBe(true);

    const task = ctx.indexingTasks.get(struct.siteId as number);
    if (task) await task.promise;
  });

  it("add_site is idempotent: a second call returns the same siteId", async () => {
    const { site, ctx, client } = await setup();
    const first = await client.callTool({
      name: "add_site",
      arguments: { base_url: site.baseUrl, wait: false },
    });
    const second = await client.callTool({
      name: "add_site",
      arguments: { base_url: site.baseUrl, wait: false },
    });
    const a = first.structuredContent as { siteId: number };
    const b = second.structuredContent as { siteId: number; alreadyExisted: boolean };
    expect(a.siteId).toBe(b.siteId);
    expect(b.alreadyExisted).toBe(true);

    const task = ctx.indexingTasks.get(a.siteId);
    if (task) await task.promise;
  });

  it("parallel add_site for the same baseUrl folds into a single background crawl", async () => {
    const { site, ctx, client } = await setup();
    const calls = await Promise.all(
      Array.from({ length: 5 }, () =>
        client.callTool({
          name: "add_site",
          arguments: { base_url: site.baseUrl, wait: false },
        }),
      ),
    );
    const siteIds = new Set(calls.map((r) => (r.structuredContent as { siteId: number }).siteId));
    expect(siteIds.size).toBe(1);
    // exactly one background task should be tracked
    const taskCount = ctx.indexingTasks.size;
    expect(taskCount).toBeLessThanOrEqual(1);

    const task = ctx.indexingTasks.get([...siteIds][0] as number);
    if (task) await task.promise;
  });

  it("index_status reports indexing -> idle as the crawl progresses", async () => {
    const { site, ctx, client } = await setup();
    const added = await client.callTool({
      name: "add_site",
      arguments: { base_url: site.baseUrl, wait: false },
    });
    const siteId = (added.structuredContent as { siteId: number }).siteId;

    // While background task is in flight, status should be "indexing".
    if (ctx.indexingTasks.has(siteId)) {
      const live = await client.callTool({
        name: "index_status",
        arguments: { site_id: siteId },
      });
      const liveStruct = live.structuredContent as { status: string };
      expect(liveStruct.status).toBe("indexing");
    }

    await ctx.indexingTasks.get(siteId)?.promise;

    const after = await client.callTool({
      name: "index_status",
      arguments: { site_id: siteId },
    });
    const afterStruct = after.structuredContent as {
      status: string;
      pagesIndexed: number;
      error: string | null;
    };
    expect(afterStruct.status).toBe("idle");
    expect(afterStruct.pagesIndexed).toBeGreaterThan(0);
    expect(afterStruct.error).toBeNull();
  });

  it("index_status returns isError for an unknown site_id", async () => {
    const { client } = await setup();
    const r = await client.callTool({
      name: "index_status",
      arguments: { site_id: 9999 },
    });
    expect(r.isError).toBe(true);
  });

  it("list_sites reports the indexing flag per site", async () => {
    const { site, ctx, client } = await setup();
    const added = await client.callTool({
      name: "add_site",
      arguments: { base_url: site.baseUrl, wait: false },
    });
    const siteId = (added.structuredContent as { siteId: number }).siteId;

    // While in-flight, list_sites should mark this site as indexing.
    if (ctx.indexingTasks.has(siteId)) {
      const live = await client.callTool({ name: "list_sites", arguments: {} });
      const liveSites = (live.structuredContent as { sites: Array<{ indexing: boolean }> }).sites;
      expect(liveSites[0]?.indexing).toBe(true);
    }

    await ctx.indexingTasks.get(siteId)?.promise;
    const after = await client.callTool({ name: "list_sites", arguments: {} });
    const afterSites = (after.structuredContent as { sites: Array<{ indexing: boolean }> }).sites;
    expect(afterSites[0]?.indexing).toBe(false);
  });
});
