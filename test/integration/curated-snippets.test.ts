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

type Hit = {
  chunkId: number;
  pageUrl: string;
  pageTitle: string | null;
  headingPath: string;
  snippet: string;
  description: string;
  codeBlocks: Array<{ language: string | null; code: string }>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  score: number;
  source: string;
};

describe("integration/curated-snippets", () => {
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

  it("AC-32.1: search_docs hit carries description + codeBlocks extracted from chunk", async () => {
    const { ctx, client, mcp } = await setup();
    const siteId = createSite(ctx.db, {
      baseUrl: "https://example.com/",
      name: "example",
      crawlOptionsJson: "{}",
    });
    // Insert a page + chunk with prose + a code block.
    ctx.db
      .prepare(
        "INSERT INTO pages(site_id, url, title, content_hash, markdown, markdown_size, fetched_at, depth) VALUES (?, ?, ?, 'h', '', 0, 0, 0)",
      )
      .run(siteId, "https://example.com/p", "Routing Guide");
    const pageId = ctx.db.query<{ id: number }, []>("SELECT id FROM pages").get()?.id ?? 0;
    const chunkText = `Use the campaign endpoint to fetch campaigns.\n\n\`\`\`ts\nconst r = await fetch('/campaigns');\nconst data = await r.json();\n\`\`\``;
    ctx.db
      .prepare(
        "INSERT INTO chunks(page_id, ord, heading_path, text, token_count) VALUES (?, 0, 'Guide > Campaign', ?, 10)",
      )
      .run(pageId, chunkText);

    const r = await client.callTool({
      name: "search_docs",
      arguments: { query: "campaign", top_k: 5 },
    });
    expect(r.isError).toBeFalsy();
    const struct = r.structuredContent as { hits: Hit[] };
    expect(struct.hits.length).toBeGreaterThan(0);
    const hit = struct.hits[0];
    expect(hit?.description).toContain("campaign endpoint");
    expect(hit?.codeBlocks).toHaveLength(1);
    expect(hit?.codeBlocks[0]?.language).toBe("ts");
    expect(hit?.codeBlocks[0]?.code).toContain("/campaigns");
    await mcp.close();
  });

  it("AC-33.6: spec-table chunk surfaces structured rows in hit.tables", async () => {
    const { ctx, client, mcp } = await setup();
    const siteId = createSite(ctx.db, {
      baseUrl: "https://example.com/",
      name: "spec",
      crawlOptionsJson: "{}",
    });
    ctx.db
      .prepare(
        "INSERT INTO pages(site_id, url, title, content_hash, markdown, markdown_size, fetched_at, depth) VALUES (?, ?, ?, 'h', '', 0, 0, 0)",
      )
      .run(siteId, "https://example.com/spec", "Campaign spec");
    const pageId = ctx.db.query<{ id: number }, []>("SELECT id FROM pages").get()?.id ?? 0;
    const chunkText = `Campaign object schema.

| name | type | required |
|---|---|---|
| accountId | integer | true |
| campaignName | string | true |
| budget | object | false |`;
    ctx.db
      .prepare(
        "INSERT INTO chunks(page_id, ord, heading_path, text, token_count) VALUES (?, 0, 'API > Campaign', ?, 12)",
      )
      .run(pageId, chunkText);

    const r = await client.callTool({
      name: "search_docs",
      arguments: { query: "campaign", top_k: 5 },
    });
    const struct = r.structuredContent as { hits: Hit[] };
    const hit = struct.hits[0];
    expect(hit?.tables).toHaveLength(1);
    expect(hit?.tables[0]?.headers).toEqual(["name", "type", "required"]);
    expect(hit?.tables[0]?.rows).toHaveLength(3);
    expect(hit?.tables[0]?.rows[0]).toEqual(["accountId", "integer", "true"]);

    // text content also includes a table render
    const text = (r.content as Array<{ text?: string }>)[0]?.text ?? "";
    expect(text).toContain("| name | type | required |");
    expect(text).toContain("| accountId | integer | true |");
    await mcp.close();
  });

  it("AC-32.2: text content renders heading / source / description / code block", async () => {
    const { ctx, client, mcp } = await setup();
    const siteId = createSite(ctx.db, {
      baseUrl: "https://example.com/",
      name: "example",
      crawlOptionsJson: "{}",
    });
    ctx.db
      .prepare(
        "INSERT INTO pages(site_id, url, title, content_hash, markdown, markdown_size, fetched_at, depth) VALUES (?, ?, ?, 'h', '', 0, 0, 0)",
      )
      .run(siteId, "https://example.com/ad", "Ad Group API");
    const pageId = ctx.db.query<{ id: number }, []>("SELECT id FROM pages").get()?.id ?? 0;
    ctx.db
      .prepare(
        "INSERT INTO chunks(page_id, ord, heading_path, text, token_count) VALUES (?, 0, 'Reference > AdGroupService', ?, 10)",
      )
      .run(pageId, `Manage ad groups via REST.\n\n\`\`\`bash\ncurl /ad_groups\n\`\`\``);

    const r = await client.callTool({
      name: "search_docs",
      arguments: { query: "ad groups", top_k: 5 },
    });
    const text = (r.content as Array<{ text?: string }>)[0]?.text ?? "";
    expect(text).toContain("### 1. Reference > AdGroupService");
    expect(text).toContain("Source: https://example.com/ad");
    expect(text).toContain("Manage ad groups");
    expect(text).toContain("```bash");
    expect(text).toContain("curl /ad_groups");
    await mcp.close();
  });
});
