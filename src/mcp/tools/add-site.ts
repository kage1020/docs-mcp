import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { crawl } from "../../crawler/crawl.ts";
import { fetchUrl } from "../../crawler/fetcher.ts";
import { loadRobots, loadSitemap } from "../../crawler/site-setup.ts";
import { normalize } from "../../crawler/url.ts";
import { countChunks } from "../../storage/repositories/chunks.ts";
import { countPages } from "../../storage/repositories/pages.ts";
import { createSite, getSiteByBaseUrl } from "../../storage/repositories/sites.ts";
import type { ServerContext } from "../context.ts";
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
  const fetcher = ctx.fetcher ?? fetchUrl;
  server.registerTool(
    "add_site",
    {
      title: "Index a documentation site",
      description:
        "Crawls a documentation site (sitemap.xml first, BFS fallback) and indexes every page into the local DB.",
      inputSchema: AddSiteShape,
    },
    async (input) => {
      const baseUrl = normalize(input.base_url);
      const existing = getSiteByBaseUrl(ctx.db, baseUrl);
      if (existing) {
        return {
          isError: true,
          content: [{ type: "text", text: `Site already exists with id ${existing.id}` }],
        };
      }
      const name = input.name ?? deriveName(baseUrl);
      const crawlOptions = {
        includePatterns: input.include_patterns,
        excludePatterns: input.exclude_patterns,
        maxDepth: input.max_depth,
        maxPages: input.max_pages,
      };
      const siteId = createSite(ctx.db, {
        baseUrl,
        name,
        crawlOptionsJson: JSON.stringify(crawlOptions),
      });

      const { advisor, raw } = await loadRobots(baseUrl, fetcher);
      if (raw) {
        ctx.db.prepare("UPDATE sites SET robots_txt = ? WHERE id = ?").run(raw, siteId);
        const delay = advisor.crawlDelay(ctx.userAgent ?? "docs-mcp");
        if (typeof delay === "number" && delay > 0) {
          ctx.queue.setOriginCrawlDelay(new URL(baseUrl).origin, delay);
        }
      }

      const sitemapUrls = await loadSitemap(baseUrl, fetcher, {}, advisor.sitemaps());
      const crawlInput: Parameters<typeof crawl>[0] = {
        siteId,
        baseUrl,
        initialUrls: sitemapUrls,
        maxDepth: input.max_depth,
        maxPages: input.max_pages,
        queue: ctx.queue,
        robots: advisor,
        db: ctx.db,
        fetcher,
        userAgent: ctx.userAgent ?? "docs-mcp",
      };
      if (input.include_patterns) crawlInput.includePatterns = input.include_patterns;
      if (input.exclude_patterns) crawlInput.excludePatterns = input.exclude_patterns;
      const result = await crawl(crawlInput);

      const pagesIndexed = countPages(ctx.db, siteId);
      const chunksIndexed = countChunks(ctx.db, siteId);
      return {
        content: [
          {
            type: "text",
            text: `Indexed ${pagesIndexed} pages (${chunksIndexed} chunks) under site #${siteId} (${name}).`,
          },
        ],
        structuredContent: {
          siteId,
          name,
          baseUrl,
          pagesIndexed,
          chunksIndexed,
          ...result,
        },
      };
    },
  );
}
