import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalize } from "../../crawler/url.ts";
import { countChunks } from "../../storage/repositories/chunks.ts";
import { countPages } from "../../storage/repositories/pages.ts";
import { createSite, getSiteByBaseUrl } from "../../storage/repositories/sites.ts";
import type { ServerContext } from "../context.ts";
import { getOrStartCrawl } from "../indexing-tasks.ts";
import { AddSiteShape } from "../schemas.ts";

function deriveName(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.host}${path}`;
  } catch {
    return baseUrl;
  }
}

export function registerAddSite(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "add_site",
    {
      title: "Index a documentation site",
      description:
        "Crawls a documentation site (sitemap.xml first, BFS fallback) and indexes every page into the local DB. Idempotent: a second call for the same base URL returns the existing site (and folds into any in-flight crawl). Pass wait:false to run the crawl in the background.",
      inputSchema: AddSiteShape,
    },
    async (input) => {
      const baseUrl = normalize(input.base_url);
      const existing = getSiteByBaseUrl(ctx.db, baseUrl);
      const name = input.name ?? deriveName(baseUrl);
      const crawlOptions = {
        includePatterns: input.include_patterns,
        excludePatterns: input.exclude_patterns,
        maxDepth: input.max_depth,
        maxPages: input.max_pages,
      };

      const siteId =
        existing?.id ??
        createSite(ctx.db, {
          baseUrl,
          name,
          crawlOptionsJson: JSON.stringify(crawlOptions),
        });

      const startInput: Parameters<typeof getOrStartCrawl>[1] = {
        siteId,
        baseUrl,
        maxDepth: input.max_depth,
        maxPages: input.max_pages,
      };
      if (input.include_patterns) startInput.includePatterns = input.include_patterns;
      if (input.exclude_patterns) startInput.excludePatterns = input.exclude_patterns;

      const task = getOrStartCrawl(ctx, startInput);

      if (input.wait) {
        await task.promise;
      }

      const pagesIndexed = countPages(ctx.db, siteId);
      const chunksIndexed = countChunks(ctx.db, siteId);
      const stillIndexing = ctx.indexingTasks.has(siteId);
      const status = stillIndexing ? "indexing" : task.error ? "failed" : "idle";

      const summary = stillIndexing
        ? `Site #${siteId} (${existing ? existing.name : name}) — crawl running in background (${pagesIndexed} pages so far).`
        : task.error
          ? `Site #${siteId} (${existing ? existing.name : name}) — crawl failed: ${task.error}`
          : `Site #${siteId} (${existing ? existing.name : name}) — ${pagesIndexed} pages, ${chunksIndexed} chunks indexed.`;

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: {
          siteId,
          name: existing ? existing.name : name,
          baseUrl,
          status,
          pagesIndexed,
          chunksIndexed,
          error: task.error ?? null,
          startedAt: task.startedAt,
          alreadyExisted: !!existing,
        },
      };
    },
  );
}
