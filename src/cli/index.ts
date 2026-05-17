import packageJson from "../../package.json" with { type: "json" };
import { countPages } from "../storage/repositories/pages.ts";
import { listSites } from "../storage/repositories/sites.ts";
import { bootstrapContext } from "./bootstrap.ts";
import { serveHttp } from "./serve-http.ts";
import { serveStdio } from "./serve-stdio.ts";

const HELP_TEXT = `docs-mcp ${packageJson.version}

Fast local MCP server that indexes documentation sites by base URL and serves
Markdown content / keyword search / optional semantic search.

USAGE
  docs-mcp <subcommand> [options]

SUBCOMMANDS
  serve --stdio                     Run MCP server over stdio
  serve --http --port <n>           Run MCP server over Streamable HTTP
  add <base_url> [--name X]         Crawl & index a documentation site
  list                              List indexed sites
  remove --id <site_id>             Remove an indexed site
  refresh --id <site_id> [--full]   Re-crawl an indexed site

OPTIONS
  --version, -v   Print version and exit
  --help,    -h   Show this help

Set DOCS_MCP_EMBEDDING_BASE_URL / _MODEL / _API_KEY to enable semantic search.
Data is stored under \`$XDG_DATA_HOME/docs-mcp\` (override with DOCS_MCP_DATA_DIR).
`;

export type RunResult = { exitCode: number };

function parseFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  for (const a of args) {
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

async function runServe(args: string[]): Promise<RunResult> {
  if (hasFlag(args, "stdio")) {
    await serveStdio();
    return { exitCode: 0 };
  }
  if (hasFlag(args, "http")) {
    const port = Number(parseFlag(args, "port") ?? "7777");
    const handle = await serveHttp({ port });
    process.stderr.write(`docs-mcp HTTP server listening on http://127.0.0.1:${handle.port}/mcp\n`);
    process.on("SIGINT", async () => {
      await handle.stop();
      process.exit(0);
    });
    return { exitCode: 0 };
  }
  process.stderr.write("docs-mcp serve: pass --stdio or --http\n");
  return { exitCode: 2 };
}

async function runList(): Promise<RunResult> {
  const { ctx, shutdown } = await bootstrapContext();
  const rows = listSites(ctx.db).map((s) => ({
    id: s.id,
    name: s.name,
    base_url: s.base_url,
    pages: countPages(ctx.db, s.id),
    last_crawled_at: s.last_crawled_at,
  }));
  if (rows.length === 0) {
    process.stdout.write("(no sites indexed yet)\n");
  } else {
    for (const r of rows) {
      process.stdout.write(`#${r.id}\t${r.pages} pages\t${r.name}\t${r.base_url}\n`);
    }
  }
  await shutdown();
  return { exitCode: 0 };
}

async function runRemove(args: string[]): Promise<RunResult> {
  const idStr = parseFlag(args, "id");
  if (!idStr) {
    process.stderr.write("docs-mcp remove: --id <site_id> required\n");
    return { exitCode: 2 };
  }
  const { ctx, shutdown } = await bootstrapContext();
  const id = Number(idStr);
  const r = ctx.db.prepare("DELETE FROM sites WHERE id = ?").run(id);
  process.stdout.write(`deleted ${Number(r.changes)} site(s)\n`);
  await shutdown();
  return { exitCode: 0 };
}

async function runAdd(args: string[]): Promise<RunResult> {
  const positional = args.filter((a) => !a.startsWith("--"));
  const baseUrl = positional[0];
  if (!baseUrl) {
    process.stderr.write("docs-mcp add <base_url>\n");
    return { exitCode: 2 };
  }
  const name = parseFlag(args, "name");
  const { buildMcpServer } = await import("../mcp/server.ts");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { ctx, shutdown } = await bootstrapContext();
  const server = buildMcpServer(ctx);
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "docs-mcp-cli", version: packageJson.version });
  await Promise.all([client.connect(c), server.connect(s)]);
  const result = await client.callTool({
    name: "add_site",
    arguments: { base_url: baseUrl, ...(name ? { name } : {}) },
  });
  process.stdout.write(`${JSON.stringify(result.structuredContent ?? {}, null, 2)}\n`);
  await server.close();
  await shutdown();
  return { exitCode: result.isError ? 1 : 0 };
}

async function runRefresh(args: string[]): Promise<RunResult> {
  const idStr = parseFlag(args, "id");
  if (!idStr) {
    process.stderr.write("docs-mcp refresh: --id <site_id> required\n");
    return { exitCode: 2 };
  }
  const { buildMcpServer } = await import("../mcp/server.ts");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { ctx, shutdown } = await bootstrapContext();
  const server = buildMcpServer(ctx);
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "docs-mcp-cli", version: packageJson.version });
  await Promise.all([client.connect(c), server.connect(s)]);
  const result = await client.callTool({
    name: "refresh_site",
    arguments: { site_id: Number(idStr), mode: hasFlag(args, "full") ? "full" : "diff" },
  });
  process.stdout.write(`${JSON.stringify(result.structuredContent ?? {}, null, 2)}\n`);
  await server.close();
  await shutdown();
  return { exitCode: result.isError ? 1 : 0 };
}

export async function run(argv: readonly string[]): Promise<RunResult> {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP_TEXT);
    return { exitCode: 0 };
  }
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`docs-mcp ${packageJson.version}\n`);
    return { exitCode: 0 };
  }

  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case "serve":
      return runServe(rest);
    case "list":
      return runList();
    case "remove":
      return runRemove(rest);
    case "add":
      return runAdd(rest);
    case "refresh":
      return runRefresh(rest);
    default:
      process.stderr.write(`docs-mcp: unknown subcommand: ${sub}\n`);
      return { exitCode: 2 };
  }
}
