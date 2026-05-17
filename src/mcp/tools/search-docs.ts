import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { search } from "../../search/search.ts";
import { countPages } from "../../storage/repositories/pages.ts";
import { getSite } from "../../storage/repositories/sites.ts";
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
      let siteEmpty = false;
      if (typeof input.site_id === "number") {
        const site = getSite(ctx.db, input.site_id);
        if (!site) {
          return {
            isError: true,
            content: [{ type: "text", text: `No site with id ${input.site_id}` }],
          };
        }
        if (countPages(ctx.db, input.site_id) === 0) {
          siteEmpty = true;
          const stillIndexing = ctx.indexingTasks.has(input.site_id);
          const hint = stillIndexing
            ? `Site #${input.site_id} (${site.name}) crawl is still running — no pages indexed yet. Poll index_status before searching.`
            : `Site #${input.site_id} (${site.name}) has no pages indexed yet. Call add_site (or check index_status) before searching.`;
          return {
            content: [{ type: "text", text: hint }],
            structuredContent: {
              mode: "bm25",
              hits: [],
              siteEmpty: true,
            },
          };
        }
      }
      const opts: Parameters<typeof search>[0] = {
        db: ctx.db,
        query: input.query,
        topK: input.top_k,
        mode: input.mode,
        maxPerPage: input.max_per_page,
        embeddingsAvailable: ctx.embeddingsAvailable,
      };
      if (typeof input.site_id === "number") opts.siteId = input.site_id;
      if (ctx.embedQuery) opts.embedQuery = ctx.embedQuery;
      const result = await search(opts);
      const summary = result.hits
        .map((h, i) => {
          const snippet = h.snippet.replace(/\s+/g, " ").trim().slice(0, 160);
          const tail = snippet ? `\n   "${snippet}"` : "";
          return `${i + 1}. [${h.score.toFixed(3)} ${h.source}] ${h.pageTitle ?? "(untitled)"} — ${h.pageUrl}\n   ${h.headingPath}${tail}`;
        })
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
          siteEmpty,
        },
      };
    },
  );
}
