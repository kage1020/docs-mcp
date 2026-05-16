import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { countChunks } from "../../storage/repositories/chunks.ts";
import { countPages } from "../../storage/repositories/pages.ts";
import { deleteSite, getSite } from "../../storage/repositories/sites.ts";
import type { ServerContext } from "../context.ts";
import { RemoveSiteShape } from "../schemas.ts";

export function registerRemoveSite(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "remove_site",
    {
      title: "Remove an indexed site",
      description: "Deletes a site row and cascades to its pages and chunks.",
      inputSchema: RemoveSiteShape,
    },
    async (input) => {
      const site = getSite(ctx.db, input.site_id);
      if (!site) {
        return {
          isError: true,
          content: [{ type: "text", text: `No site with id ${input.site_id}` }],
        };
      }
      const pagesDeleted = countPages(ctx.db, input.site_id);
      const chunksDeleted = countChunks(ctx.db, input.site_id);
      deleteSite(ctx.db, input.site_id);
      return {
        content: [
          {
            type: "text",
            text: `Deleted site #${input.site_id} (${site.name}): ${pagesDeleted} pages, ${chunksDeleted} chunks.`,
          },
        ],
        structuredContent: {
          deleted: true,
          siteId: input.site_id,
          pagesDeleted,
          chunksDeleted,
        },
      };
    },
  );
}
