import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { countPages } from "../../storage/repositories/pages.ts";
import { listSites } from "../../storage/repositories/sites.ts";
import type { ServerContext } from "../context.ts";
import { ListSitesShape } from "../schemas.ts";

export function registerListSites(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "list_sites",
    {
      title: "List indexed documentation sites",
      description: "Returns every indexed site with its page count and last-crawled timestamp.",
      inputSchema: ListSitesShape,
    },
    async () => {
      const sites = listSites(ctx.db).map((s) => ({
        siteId: s.id,
        name: s.name,
        baseUrl: s.base_url,
        pageCount: countPages(ctx.db, s.id),
        createdAt: s.created_at,
        lastCrawledAt: s.last_crawled_at,
      }));
      const text =
        sites.length === 0
          ? "(no sites indexed yet)"
          : sites
              .map(
                (s) =>
                  `#${s.siteId} ${s.name} — ${s.baseUrl} (${s.pageCount} pages, last crawled ${s.lastCrawledAt ?? "never"})`,
              )
              .join("\n");
      return {
        content: [{ type: "text", text }],
        structuredContent: { sites },
      };
    },
  );
}
