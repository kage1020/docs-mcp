#!/usr/bin/env bun
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * End-to-end embedding verification:
 *   1. Spin up the docs-site fixture
 *   2. Bootstrap with DOCS_MCP_EMBEDDING_BASE_URL=<ollama>
 *   3. add_site -> crawl + embed
 *   4. search mode=hybrid and report sources
 *   5. compare hits to mode=bm25
 *
 * Run:
 *   bun run scripts/measure-embedding.ts
 *
 * env:
 *   DOCS_MCP_EMBEDDING_BASE_URL  (default http://localhost:11434/v1)
 *   DOCS_MCP_EMBEDDING_MODEL     (default embeddinggemma:latest)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { bootstrapContext } from "../src/cli/bootstrap.ts";
import { buildMcpServer } from "../src/mcp/server.ts";
import { startDocsSite } from "../test/helpers/docs-site.ts";

const dataDir = join(tmpdir(), `docs-mcp-embed-${Date.now()}`);
mkdirSync(dataDir, { recursive: true });
process.env.DOCS_MCP_DATA_DIR = dataDir;
process.env.LOG_LEVEL = "warn";
process.env.DOCS_MCP_EMBEDDING_BASE_URL =
  process.env.DOCS_MCP_EMBEDDING_BASE_URL ?? "http://localhost:11434/v1";
process.env.DOCS_MCP_EMBEDDING_MODEL =
  process.env.DOCS_MCP_EMBEDDING_MODEL ?? "embeddinggemma:latest";

type Hit = {
  pageUrl: string;
  pageTitle: string | null;
  headingPath: string;
  snippet: string;
  score: number;
  source: string;
};

const site = startDocsSite();
console.log(`[fixture] ${site.baseUrl}`);

try {
  console.log("\n[bootstrap]");
  const t0 = performance.now();
  const boot = await bootstrapContext();
  console.log(
    `  embeddingsAvailable=${boot.ctx.embeddingsAvailable} (${Math.round(performance.now() - t0)}ms)`,
  );

  if (!boot.ctx.embeddingsAvailable) {
    console.error("[abort] embedding endpoint unavailable — start Ollama / set env");
    await boot.shutdown();
    process.exit(1);
  }

  const server = buildMcpServer(boot.ctx);
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "embed-check", version: "0" });
  await Promise.all([client.connect(c), server.connect(s)]);

  console.log("\n[add_site]");
  const t1 = performance.now();
  const added = await client.callTool(
    {
      name: "add_site",
      arguments: { base_url: site.baseUrl, max_pages: 10 },
    },
    undefined,
    { timeout: 10 * 60_000, resetTimeoutOnProgress: true, maxTotalTimeout: 30 * 60_000 },
  );
  console.log(
    `  ${Math.round(performance.now() - t1)}ms — ${JSON.stringify(added.structuredContent)}`,
  );

  const vecCount =
    boot.ctx.db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM chunks_vec").get()?.c ?? 0;
  const chunkCount =
    boot.ctx.db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM chunks").get()?.c ?? 0;
  console.log(`\n[storage] chunks=${chunkCount}, chunks_vec rows=${vecCount}`);

  for (const q of ["routing", "rendering", "deployment"]) {
    for (const mode of ["bm25", "hybrid"] as const) {
      const tq = performance.now();
      const r = await client.callTool(
        {
          name: "search_docs",
          arguments: { query: q, top_k: 5, mode },
        },
        undefined,
        { timeout: 60_000, resetTimeoutOnProgress: true, maxTotalTimeout: 120_000 },
      );
      const ms = Math.round(performance.now() - tq);
      const struct = r.structuredContent as { mode?: string; hits?: Hit[] } | undefined;
      const hits = struct?.hits ?? [];
      const sources = hits.map((h) => h.source);
      console.log(
        `[search "${q}" mode=${mode}] ${ms}ms — ${hits.length} hits, sources=[${sources.join(",")}]`,
      );
      for (const h of hits.slice(0, 3)) {
        console.log(`    [${h.score.toFixed(3)} ${h.source}] ${h.headingPath} — ${h.pageUrl}`);
      }
    }
  }

  await server.close();
  await boot.shutdown();
} finally {
  await site.server.stop();
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch {
      Bun.sleepSync(50);
    }
  }
}
