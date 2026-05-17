import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type DocsMcpEnv, parseEnv } from "../config/env.ts";
import { resolveDbPath } from "../config/paths.ts";
import { type CrawlerQueue, createCrawlerQueue } from "../crawler/queue.ts";
import { createEmbeddingClient } from "../embedding/client.ts";
import { probeEmbedding } from "../embedding/probe.ts";
import { createLogger } from "../logger.ts";
import type { ServerContext } from "../mcp/context.ts";
import { type DbHandle, ensureVecTable, openDb } from "../storage/db.ts";
import { migrate } from "../storage/migrate.ts";

export type Bootstrap = {
  ctx: ServerContext;
  handle: DbHandle;
  env: DocsMcpEnv;
  shutdown: () => void | Promise<void>;
};

function isProcessEnv(value: NodeJS.ProcessEnv | DocsMcpEnv): value is NodeJS.ProcessEnv {
  return typeof (value as NodeJS.ProcessEnv).PATH !== "undefined" || !("LOG_LEVEL" in value);
}

export async function bootstrapContext(
  rawEnv: NodeJS.ProcessEnv | DocsMcpEnv = process.env,
  overrides: { dbPath?: string; queue?: CrawlerQueue } = {},
): Promise<Bootstrap> {
  const env: DocsMcpEnv = isProcessEnv(rawEnv) ? parseEnv(rawEnv) : rawEnv;
  const log = createLogger(env.LOG_LEVEL);

  const dbPath =
    overrides.dbPath ??
    resolveDbPath({
      DOCS_MCP_DATA_DIR: env.DOCS_MCP_DATA_DIR,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    });
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const handle = openDb({ dbPath });
  migrate(handle.db);

  let embeddingsAvailable = false;
  let embedQuery: ServerContext["embedQuery"];
  if (env.DOCS_MCP_EMBEDDING_BASE_URL) {
    const probeOpts: Parameters<typeof probeEmbedding>[0] = {
      baseUrl: env.DOCS_MCP_EMBEDDING_BASE_URL,
      model: env.DOCS_MCP_EMBEDDING_MODEL,
      timeoutMs: 5_000,
    };
    if (env.DOCS_MCP_EMBEDDING_API_KEY) probeOpts.apiKey = env.DOCS_MCP_EMBEDDING_API_KEY;
    const probe = await probeEmbedding(probeOpts);
    if (probe.available) {
      embeddingsAvailable = true;
      ensureVecTable(handle.db, probe.dim);
      handle.db
        .prepare(
          "INSERT INTO embeddings_meta(key, value) VALUES ('model', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(env.DOCS_MCP_EMBEDDING_MODEL);
      const clientOpts: Parameters<typeof createEmbeddingClient>[0] = {
        baseUrl: env.DOCS_MCP_EMBEDDING_BASE_URL,
        model: env.DOCS_MCP_EMBEDDING_MODEL,
      };
      if (env.DOCS_MCP_EMBEDDING_API_KEY) clientOpts.apiKey = env.DOCS_MCP_EMBEDDING_API_KEY;
      const client = createEmbeddingClient(clientOpts);
      embedQuery = async (q: string) => {
        const out = await client.embed([q]);
        return out[0] ?? [];
      };
      log.info({ dim: probe.dim }, "embedding endpoint is available");
    } else {
      log.warn({ reason: probe.reason }, "embedding endpoint is unavailable; falling back to BM25");
    }
  }

  const queue = overrides.queue ?? createCrawlerQueue({});
  const ctx: ServerContext = {
    db: handle.db,
    queue,
    embeddingsAvailable,
  };
  if (embedQuery) ctx.embedQuery = embedQuery;
  if (env.DOCS_MCP_USER_AGENT) ctx.userAgent = env.DOCS_MCP_USER_AGENT;

  let renderShutdown: (() => Promise<void>) | null = null;
  if (env.DOCS_MCP_RENDER === "playwright") {
    const { createPlaywrightFetcher } = await import("../crawler/playwright-fetcher.ts");
    const pfOpts: Parameters<typeof createPlaywrightFetcher>[0] = {};
    if (env.DOCS_MCP_USER_AGENT) pfOpts.userAgent = env.DOCS_MCP_USER_AGENT;
    const handle = await createPlaywrightFetcher(pfOpts);
    ctx.fetcher = handle.fetch;
    renderShutdown = handle.close;
    log.info({ render: "playwright" }, "playwright fetcher is active");
  }

  return {
    ctx,
    handle,
    env,
    shutdown: async () => {
      if (renderShutdown) await renderShutdown();
      handle.close();
    },
  };
}
