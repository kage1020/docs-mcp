#!/usr/bin/env bun
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { bootstrapContext } from "../src/cli/bootstrap.ts";
import { buildMcpServer } from "../src/mcp/server.ts";

type Json = Record<string, unknown>;

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const sub = process.argv[2];
  if (!sub) {
    console.error("usage: eval-driver <add-site|list-sites|index-status|search|get-doc> ...");
    process.exit(2);
  }

  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "error";
  const boot = await bootstrapContext();
  const server = buildMcpServer(boot.ctx);
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "eval-driver", version: "0" });
  await Promise.all([client.connect(c), server.connect(s)]);

  const cleanup = async () => {
    await server.close();
    await boot.shutdown();
  };

  try {
    let args: Json = {};
    let toolName = "";

    switch (sub) {
      case "add-site": {
        const baseUrl = process.argv[3];
        if (!baseUrl) throw new Error("add-site requires <base_url>");
        toolName = "add_site";
        args = {
          base_url: baseUrl,
          name: arg("--name") ?? "",
          max_pages: Number(arg("--max-pages") ?? "200"),
          max_depth: Number(arg("--max-depth") ?? "5"),
          wait: !flag("--no-wait"),
        };
        const inc = arg("--include");
        const exc = arg("--exclude");
        if (inc) args.include_patterns = inc.split(",");
        if (exc) args.exclude_patterns = exc.split(",");
        break;
      }
      case "list-sites":
        toolName = "list_sites";
        break;
      case "index-status": {
        const id = Number(process.argv[3] ?? "");
        if (!Number.isFinite(id)) throw new Error("index-status requires <site_id>");
        toolName = "index_status";
        args = { site_id: id };
        break;
      }
      case "search": {
        const query = process.argv[3];
        if (!query) throw new Error("search requires <query>");
        toolName = "search_docs";
        args = {
          query,
          top_k: Number(arg("--top-k") ?? "10"),
          mode: arg("--mode") ?? "auto",
          max_per_page: Number(arg("--max-per-page") ?? "2"),
        };
        const sid = arg("--site-id");
        if (sid) args.site_id = Number(sid);
        break;
      }
      case "get-doc": {
        const url = process.argv[3];
        if (!url) throw new Error("get-doc requires <url>");
        toolName = "get_doc";
        args = {
          url,
          max_chars: Number(arg("--max-chars") ?? "60000"),
          persist: flag("--persist"),
        };
        break;
      }
      default:
        throw new Error(`unknown subcommand: ${sub}`);
    }

    const t0 = performance.now();
    const res = await client.callTool({ name: toolName, arguments: args }, undefined, {
      timeout: 30 * 60_000,
      resetTimeoutOnProgress: true,
      maxTotalTimeout: 60 * 60_000,
    });
    const ms = Math.round(performance.now() - t0);

    const out = {
      tool: toolName,
      ok: !res.isError,
      ms,
      structured: res.structuredContent ?? null,
      text: Array.isArray(res.content)
        ? res.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("\n")
        : null,
    };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
