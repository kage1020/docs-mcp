import { afterEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fetchUrl } from "../../src/crawler/fetcher.ts";
import { createCrawlerQueue } from "../../src/crawler/queue.ts";
import { buildMcpServer } from "../../src/mcp/server.ts";
import { type DbHandle, openDb } from "../../src/storage/db.ts";
import { migrate } from "../../src/storage/migrate.ts";
import { type DocsSite, startDocsSite } from "../helpers/docs-site.ts";

describe("integration/mcp-tools", () => {
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
    const server = buildMcpServer({
      db: h.db,
      queue,
      embeddingsAvailable: false,
      fetcher: fetchUrl,
      indexingTasks: new Map(),
      robotsCache: new Map(),
      lastCrawlResults: new Map(),
    });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([client.connect(clientT), server.connect(serverT)]);
    return { site, h, server, client };
  }

  it("lists the seven tools", async () => {
    const { client } = await setup();
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "add_site",
        "get_doc",
        "index_status",
        "list_sites",
        "refresh_site",
        "remove_site",
        "search_docs",
      ].sort(),
    );
  });

  it("add_site -> list_sites -> search_docs -> get_doc end-to-end", async () => {
    const { site, client } = await setup();
    const added = await client.callTool({
      name: "add_site",
      arguments: { base_url: site.baseUrl, name: "fixture" },
    });
    expect(added.isError).toBeFalsy();
    const struct = (added.structuredContent ?? {}) as { siteId?: number; pagesIndexed?: number };
    expect(struct.siteId).toBeDefined();
    expect(struct.pagesIndexed ?? 0).toBeGreaterThan(0);

    const list = await client.callTool({ name: "list_sites", arguments: {} });
    const sitesContent = (list.structuredContent ?? {}) as { sites?: Array<{ siteId: number }> };
    expect(sitesContent.sites?.length).toBe(1);

    const search = await client.callTool({
      name: "search_docs",
      arguments: { query: "topic", top_k: 5 },
    });
    expect(search.isError).toBeFalsy();
    const sresult = (search.structuredContent ?? {}) as {
      hits?: Array<{ pageUrl: string }>;
      mode?: string;
    };
    expect(sresult.mode).toBe("bm25");
    expect((sresult.hits ?? []).length).toBeGreaterThan(0);

    const firstUrl = sresult.hits?.[0]?.pageUrl;
    const doc = await client.callTool({
      name: "get_doc",
      arguments: { url: firstUrl ?? `${site.server.origin}/`, max_chars: 200 },
    });
    expect(doc.isError).toBeFalsy();
    const dresult = (doc.structuredContent ?? {}) as { source?: string; markdown?: string };
    expect(dresult.source).toBe("cache");
    expect((dresult.markdown ?? "").length).toBeGreaterThan(0);
  });

  it("returns an error result on schema-invalid input", async () => {
    const { client } = await setup();
    let threw = false;
    let result: Awaited<ReturnType<typeof client.callTool>> | null = null;
    try {
      result = await client.callTool({
        name: "search_docs",
        arguments: { query: 123 as unknown as string },
      });
    } catch {
      threw = true;
    }
    expect(threw || result?.isError === true).toBe(true);
  });

  it("remove_site cascades pages + chunks", async () => {
    const { site, h, client } = await setup();
    const added = await client.callTool({
      name: "add_site",
      arguments: { base_url: site.baseUrl },
    });
    const siteId = ((added.structuredContent ?? {}) as { siteId?: number }).siteId as number;
    const pagesBefore = h.db
      .query<{ c: number }, [number]>("SELECT COUNT(*) AS c FROM pages WHERE site_id = ?")
      .get(siteId)?.c;
    expect(pagesBefore).toBeGreaterThan(0);
    const removed = await client.callTool({
      name: "remove_site",
      arguments: { site_id: siteId },
    });
    expect(removed.isError).toBeFalsy();
    const after = h.db
      .query<{ c: number }, [number]>("SELECT COUNT(*) AS c FROM pages WHERE site_id = ?")
      .get(siteId)?.c;
    expect(after).toBe(0);
  });

  it("refresh_site re-crawls and reports unchanged the second time", async () => {
    const { site, client } = await setup();
    const added = await client.callTool({
      name: "add_site",
      arguments: { base_url: site.baseUrl },
    });
    const siteId = ((added.structuredContent ?? {}) as { siteId?: number }).siteId as number;
    const refresh = await client.callTool({
      name: "refresh_site",
      arguments: { site_id: siteId, mode: "diff" },
    });
    expect(refresh.isError).toBeFalsy();
    const result = (refresh.structuredContent ?? {}) as {
      pagesUpdated: number;
      pagesUnchanged: number;
    };
    expect(result.pagesUpdated).toBe(0);
    expect(result.pagesUnchanged).toBeGreaterThan(0);
  });
});
