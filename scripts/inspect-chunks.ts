#!/usr/bin/env bun
/**
 * Dump heading_path distribution and sample text from the largest page in
 * the most recent measure-real run. Pass --url to inspect a specific page.
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { bootstrapContext } from "../src/cli/bootstrap.ts";
import { buildMcpServer } from "../src/mcp/server.ts";

const baseUrl =
  process.argv[2] ?? "https://developers.google.com/google-ads/api/reference/rest/v22";

const dataDir = join(tmpdir(), `docs-mcp-inspect-${Date.now()}`);
mkdirSync(dataDir, { recursive: true });
process.env.DOCS_MCP_DATA_DIR = dataDir;
process.env.LOG_LEVEL = "warn";

async function main(): Promise<void> {
  const boot = await bootstrapContext();
  const server = buildMcpServer(boot.ctx);
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "inspect", version: "0" });
  await Promise.all([client.connect(c), server.connect(s)]);

  await client.callTool(
    {
      name: "add_site",
      arguments: { base_url: baseUrl, name: "tmp", max_pages: 1 },
    },
    undefined,
    { timeout: 10 * 60_000, resetTimeoutOnProgress: true, maxTotalTimeout: 30 * 60_000 },
  );

  const page = boot.ctx.db
    .query<{ id: number; url: string; markdown: string }, []>(
      "SELECT id, url, markdown FROM pages ORDER BY markdown_size DESC LIMIT 1",
    )
    .get();
  if (!page) {
    console.log("(no pages)");
    return;
  }

  console.log(`URL: ${page.url}`);
  console.log(`markdown_size: ${page.markdown.length} chars\n`);

  const chunks = boot.ctx.db
    .query<{ ord: number; heading_path: string; text: string; token_count: number }, [number]>(
      "SELECT ord, heading_path, text, token_count FROM chunks WHERE page_id = ? ORDER BY ord",
    )
    .all(page.id);

  console.log(`chunks: ${chunks.length}\n`);

  const byPath = new Map<string, number>();
  for (const c of chunks) byPath.set(c.heading_path, (byPath.get(c.heading_path) ?? 0) + 1);
  console.log("heading_path distribution (top 20):");
  for (const [p, n] of [...byPath].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${n.toString().padStart(4)}  ${p || "(root)"}`);
  }
  console.log(`  ...total unique paths: ${byPath.size}`);

  console.log("\nfirst 3 chunks (truncated):");
  for (const c of chunks.slice(0, 3)) {
    console.log(`\n  ord=${c.ord} tokens=${c.token_count} path="${c.heading_path}"`);
    console.log(c.text.slice(0, 400).replace(/\n/g, "\n  "));
  }

  await server.close();
  boot.shutdown();
}

main().catch(console.error);
