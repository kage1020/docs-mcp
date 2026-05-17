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
import { startServer, type TestServer } from "../helpers/http-server.ts";

describe("integration/ux-fixups", () => {
  const handles: DbHandle[] = [];
  const sites: DocsSite[] = [];
  const auxServers: TestServer[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) h.close();
    for (const s of sites.splice(0)) await s.server.stop();
    for (const s of auxServers.splice(0)) await s.stop();
  });

  async function setup(): Promise<{ ctx: ServerContext; client: Client; docsSite: DocsSite }> {
    const docsSite = startDocsSite();
    sites.push(docsSite);
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
    const server = buildMcpServer(ctx);
    const [c, s] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ux", version: "0" });
    await Promise.all([client.connect(c), server.connect(s)]);
    return { ctx, client, docsSite };
  }

  it("AC-23.1: search_docs returns isError for unknown site_id", async () => {
    const { client } = await setup();
    const r = await client.callTool({
      name: "search_docs",
      arguments: { query: "anything", site_id: 9999 },
    });
    expect(r.isError).toBe(true);
  });

  it("AC-23.2: search_docs without site_id still works on empty DB (no error, 0 hits)", async () => {
    const { client } = await setup();
    const r = await client.callTool({
      name: "search_docs",
      arguments: { query: "anything" },
    });
    expect(r.isError).toBeFalsy();
    const struct = r.structuredContent as { hits: unknown[] };
    expect(struct.hits).toEqual([]);
  });

  it("AC-23.3: get_doc refuses a URL disallowed by robots.txt on cold fetch", async () => {
    const { client } = await setup();
    const banned = startServer((req) => {
      const u = new URL(req.url);
      if (u.pathname === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /private", { status: 200 });
      }
      return new Response("<html><body>secret</body></html>", { status: 200 });
    });
    auxServers.push(banned);
    const r = await client.callTool({
      name: "get_doc",
      arguments: { url: `${banned.origin}/private/secret` },
    });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text?: string }>)[0]?.text).toContain("robots.txt");
  });

  it("AC-23.4: get_doc returns DB-cached pages without robots check", async () => {
    const { ctx, client, docsSite } = await setup();
    // Manually pre-populate a page from the docs-site fixture so we can
    // exercise the cache path without actually crawling.
    ctx.db
      .prepare(
        "INSERT INTO sites(id, base_url, name, crawl_options_json, created_at, updated_at) VALUES (1, ?, 's', '{}', 0, 0)",
      )
      .run(docsSite.baseUrl);
    ctx.db
      .prepare(
        "INSERT INTO pages(id, site_id, url, title, content_hash, markdown, markdown_size, fetched_at, depth) VALUES (1, 1, ?, 'T', 'h', '# Hi', 4, 0, 0)",
      )
      .run(`${docsSite.server.origin}/a`);
    const r = await client.callTool({
      name: "get_doc",
      arguments: { url: `${docsSite.server.origin}/a` },
    });
    expect(r.isError).toBeFalsy();
    const struct = r.structuredContent as { source: string };
    expect(struct.source).toBe("cache");
  });

  it("AC-23.7: get_doc({persist:true}) indexes the page into the matching site", async () => {
    const { ctx, client, docsSite } = await setup();
    // Register the site (no crawl — we want to test get_doc indexing on its own).
    ctx.db
      .prepare(
        "INSERT INTO sites(id, base_url, name, crawl_options_json, created_at, updated_at) VALUES (1, ?, 's', '{}', 0, 0)",
      )
      .run(docsSite.baseUrl);
    const r = await client.callTool({
      name: "get_doc",
      arguments: { url: `${docsSite.server.origin}/a`, persist: true },
    });
    expect(r.isError).toBeFalsy();
    const struct = r.structuredContent as { persisted: boolean; siteId?: number };
    expect(struct.persisted).toBe(true);
    expect(struct.siteId).toBe(1);
    const pageCount = ctx.db
      .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM pages WHERE site_id = 1")
      .get()?.c;
    expect(pageCount).toBeGreaterThanOrEqual(1);
  });

  it("AC-23.8: get_doc({persist:true}) without a matching site is an error", async () => {
    const { client, docsSite } = await setup();
    const r = await client.callTool({
      name: "get_doc",
      arguments: { url: `${docsSite.server.origin}/a`, persist: true },
    });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text?: string }>)[0]?.text).toContain("add_site");
  });

  it("AC-23.9: default persist:false still memory-caches on second call", async () => {
    const { client, docsSite } = await setup();
    const r1 = await client.callTool({
      name: "get_doc",
      arguments: { url: `${docsSite.server.origin}/a` },
    });
    expect(r1.isError).toBeFalsy();
    expect((r1.structuredContent as { source: string }).source).toBe("fetched");
    const r2 = await client.callTool({
      name: "get_doc",
      arguments: { url: `${docsSite.server.origin}/a` },
    });
    expect((r2.structuredContent as { source: string }).source).toBe("memory-cache");
  });
});
