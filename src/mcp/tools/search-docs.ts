import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { search } from "../../search/search.ts";
import type { ServerContext } from "../context.ts";
import { SearchDocsShape } from "../schemas.ts";

export function registerSearchDocs(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "search_docs",
    {
      title: "Search documentation",
      description:
        "Search across indexed documentation sites with BM25, vector embedding, hybrid (RRF), or automatic mode.",
      inputSchema: SearchDocsShape,
    },
    async (input) => {
      const opts: Parameters<typeof search>[0] = {
        db: ctx.db,
        query: input.query,
        topK: input.top_k,
        mode: input.mode,
        embeddingsAvailable: ctx.embeddingsAvailable,
      };
      if (typeof input.site_id === "number") opts.siteId = input.site_id;
      if (ctx.embedQuery) opts.embedQuery = ctx.embedQuery;
      const result = await search(opts);
      const summary = result.hits
        .map(
          (h, i) =>
            `${i + 1}. [${h.score.toFixed(3)} ${h.source}] ${h.pageTitle ?? "(untitled)"} — ${h.pageUrl}\n   ${h.headingPath}`,
        )
        .join("\n");
      return {
        content: [
          {
            type: "text",
            text: result.hits.length === 0 ? "No results." : `mode=${result.mode}\n${summary}`,
          },
        ],
        structuredContent: {
          mode: result.mode,
          hits: result.hits,
        },
      };
    },
  );
}
