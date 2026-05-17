#!/usr/bin/env bun
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * Measure docs-mcp end-to-end against a real documentation site.
 * Usage:
 *   bun run scripts/measure-real.ts <base_url> [max_pages]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { bootstrapContext } from "../src/cli/bootstrap.ts";
import { buildMcpServer } from "../src/mcp/server.ts";

const baseUrl = process.argv[2] ?? "https://developers.google.com/google-ads/api/reference/rpc/v22";
const maxPages = Number(process.argv[3] ?? "50");
const QUERIES = ["campaign", "ad group", "conversion tracking", "report"];

const dataDir = join(tmpdir(), `docs-mcp-measure-${Date.now()}`);
mkdirSync(dataDir, { recursive: true });
process.env.DOCS_MCP_DATA_DIR = dataDir;
process.env.LOG_LEVEL = "warn";

type Struct = Record<string, unknown> | undefined;
type Hit = {
  pageUrl: string;
  pageTitle: string | null;
  headingPath: string;
  snippet: string;
  score: number;
  source: string;
};

function ms(t0: number): number {
  return Math.round(performance.now() - t0);
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ baseUrl, maxPages, dataDir }, null, 2));
  const boot = await bootstrapContext();
  const server = buildMcpServer(boot.ctx);
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "measure", version: "0" });
  await Promise.all([client.connect(c), server.connect(s)]);

  const addStart = performance.now();
  const added = await client.callTool(
    {
      name: "add_site",
      arguments: { base_url: baseUrl, name: "google-ads-v22", max_pages: maxPages },
    },
    undefined,
    { timeout: 30 * 60_000, resetTimeoutOnProgress: true, maxTotalTimeout: 60 * 60_000 },
  );
  const addMs = ms(addStart);
  const addStruct = added.structuredContent as Struct;
  console.log(`\n[add_site] ${addMs}ms`);
  console.log(JSON.stringify(addStruct, null, 2));

  const pagesIndexed = Number(addStruct?.pagesIndexed ?? 0);
  console.log(`\n[per-page] ${pagesIndexed > 0 ? Math.round(addMs / pagesIndexed) : "n/a"}ms/page`);

  if (added.isError) {
    console.error("add_site failed — aborting search measurement");
    await server.close();
    boot.shutdown();
    rmSync(dataDir, { recursive: true, force: true });
    process.exit(1);
  }

  console.log("\n[search_docs]");
  for (const q of QUERIES) {
    const t0 = performance.now();
    const res = await client.callTool({
      name: "search_docs",
      arguments: { query: q, top_k: 5 },
    });
    const took = ms(t0);
    const struct = res.structuredContent as { mode?: string; hits?: Hit[] } | undefined;
    const hits = struct?.hits ?? [];
    console.log(`  "${q}" — ${took}ms — mode=${struct?.mode} — ${hits.length} hits`);
    for (const h of hits.slice(0, 2)) {
      console.log(`    [${h.score.toFixed(3)} ${h.source}] ${h.headingPath} — ${h.pageUrl}`);
    }
  }

  const listRes = await client.callTool({ name: "list_sites", arguments: {} });
  const sites =
    (listRes.structuredContent as { sites?: Array<{ pageCount: number }> } | undefined)?.sites ??
    [];
  const firstPageUrl =
    sites.length > 0
      ? (boot.ctx.db.query<{ url: string }, []>("SELECT url FROM pages LIMIT 1").get()?.url ?? null)
      : null;

  if (firstPageUrl) {
    console.log("\n[get_doc cached]");
    const t0 = performance.now();
    const doc = await client.callTool({
      name: "get_doc",
      arguments: { url: firstPageUrl, max_chars: 4000 },
    });
    const took = ms(t0);
    const struct = doc.structuredContent as
      | { source?: string; markdown?: string; title?: string | null }
      | undefined;
    console.log(`  ${took}ms — source=${struct?.source} — ${struct?.markdown?.length ?? 0} chars`);
    console.log(`  title: ${struct?.title ?? "(none)"}`);
  }

  console.log("\n[indexed pages]");
  const rows = boot.ctx.db
    .query<{ url: string; title: string | null; chunks: number; size: number }, []>(
      `SELECT p.url AS url, p.title AS title, COUNT(c.id) AS chunks, p.markdown_size AS size
       FROM pages p LEFT JOIN chunks c ON c.page_id = p.id
       GROUP BY p.id ORDER BY p.id`,
    )
    .all();
  for (const r of rows) {
    console.log(
      `  [${r.chunks} chunks, ${r.size}B] ${r.title?.slice(0, 50) ?? "(no title)"} — ${r.url}`,
    );
  }
  console.log(`\n  ${rows.length} unique URLs indexed`);
  console.log(`  unique URLs by row: ${new Set(rows.map((r) => r.url)).size}`);

  await server.close();
  boot.shutdown();
  cleanup();
}

function cleanup(): void {
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      return;
    } catch {
      // sqlite-wal/shm may linger for a tick on Windows; retry briefly
      Bun.sleepSync(50);
    }
  }
}

main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
