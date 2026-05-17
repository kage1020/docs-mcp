import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { countChunks } from "../../storage/repositories/chunks.ts";
import { countPages } from "../../storage/repositories/pages.ts";
import { getSite } from "../../storage/repositories/sites.ts";
import type { ServerContext } from "../context.ts";
import { IndexStatusShape } from "../schemas.ts";

export function registerIndexStatus(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "index_status",
    {
      title: "Show crawl/index status for a site",
      description:
        "Reports whether a site's crawl is still running, how many pages/chunks are currently indexed, and the last error (if any).",
      inputSchema: IndexStatusShape,
    },
    async (input) => {
      const site = getSite(ctx.db, input.site_id);
      if (!site) {
        return {
          isError: true,
          content: [{ type: "text", text: `No site with id ${input.site_id}` }],
        };
      }
      const task = ctx.indexingTasks.get(input.site_id);
      const pagesIndexed = countPages(ctx.db, input.site_id);
      const chunksIndexed = countChunks(ctx.db, input.site_id);
      const status = task ? "indexing" : "idle";
      const warnings = ctx.lastCrawlResults.get(input.site_id)?.warnings ?? [];
      const baseText = `Site #${site.id} (${site.name}): ${status}, ${pagesIndexed} pages, ${chunksIndexed} chunks${task ? ` (running since ${new Date(task.startedAt).toISOString()})` : ""}`;
      const text =
        warnings.length > 0 ? `${baseText}\nwarnings:\n  - ${warnings.join("\n  - ")}` : baseText;
      return {
        content: [{ type: "text", text }],
        structuredContent: {
          siteId: site.id,
          baseUrl: site.base_url,
          name: site.name,
          status,
          pagesIndexed,
          chunksIndexed,
          startedAt: task?.startedAt ?? null,
          lastCrawledAt: site.last_crawled_at,
          error: task?.error ?? null,
          warnings,
        },
      };
    },
  );
}
