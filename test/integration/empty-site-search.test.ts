import { afterEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fetchUrl } from "../../src/crawler/fetcher.ts";
import { createCrawlerQueue } from "../../src/crawler/queue.ts";
import type { ServerContext } from "../../src/mcp/context.ts";
import { buildMcpServer } from "../../src/mcp/server.ts";
import { type DbHandle, openDb } from "../../src/storage/db.ts";
import { migrate } from "../../src/storage/migrate.ts";
import { createSite } from "../../src/storage/repositories/sites.ts";

describe("integration/empty-site-search", () => {
  const handles: DbHandle[] = [];

  afterEach(() => {
    for (const h of handles.splice(0)) h.close();
  });

  async function setup() {
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
    return { ctx, client, mcp };
  }

  it("AC-27.1: search_docs against a known but empty site returns a helpful hint", async () => {
    const { ctx, client, mcp } = await setup();
    const siteId = createSite(ctx.db, {
      baseUrl: "https://example.com/",
      name: "example",
      crawlOptionsJson: "{}",
    });
    const r = await client.callTool({
      name: "search_docs",
      arguments: { query: "campaign", site_id: siteId },
    });
    expect(r.isError).toBeFalsy();
    const text = (r.content as Array<{ text?: string }>)[0]?.text ?? "";
    expect(text).toMatch(/no pages indexed|not been crawled|add_site|index_status/i);
    const struct = r.structuredContent as { hits: unknown[]; siteEmpty?: boolean };
    expect(struct.hits).toEqual([]);
    expect(struct.siteEmpty).toBe(true);
    await mcp.close();
  });

  it("AC-27.2: search_docs against a populated site does not signal siteEmpty", async () => {
    const { ctx, client, mcp } = await setup();
    const siteId = createSite(ctx.db, {
      baseUrl: "https://example.com/",
      name: "example",
      crawlOptionsJson: "{}",
    });
    ctx.db
      .prepare(
        "INSERT INTO pages(site_id, url, title, content_hash, markdown, markdown_size, fetched_at, depth) VALUES (?, ?, 'T', 'h', '# hi', 4, 0, 0)",
      )
      .run(siteId, "https://example.com/p");
    const r = await client.callTool({
      name: "search_docs",
      arguments: { query: "anything", site_id: siteId },
    });
    expect(r.isError).toBeFalsy();
    const struct = r.structuredContent as { siteEmpty?: boolean };
    expect(struct.siteEmpty).toBeFalsy();
    await mcp.close();
  });
});
