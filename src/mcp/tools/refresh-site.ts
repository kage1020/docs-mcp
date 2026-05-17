import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { crawl } from "../../crawler/crawl.ts";
import { fetchUrl } from "../../crawler/fetcher.ts";
import { loadRobots, loadSitemap } from "../../crawler/site-setup.ts";
import { getSite } from "../../storage/repositories/sites.ts";
import type { ServerContext } from "../context.ts";
import { RefreshSiteShape } from "../schemas.ts";

type CrawlOptionsJson = {
  includePatterns?: string[];
  excludePatterns?: string[];
  maxDepth?: number;
  maxPages?: number;
};

export function registerRefreshSite(server: McpServer, ctx: ServerContext): void {
  const fetcher = ctx.fetcher ?? fetchUrl;
  server.registerTool(
    "refresh_site",
    {
      title: "Re-crawl an indexed site",
      description: "Re-crawls a site, updating only changed pages by default.",
      inputSchema: RefreshSiteShape,
    },
    async (input) => {
      const site = getSite(ctx.db, input.site_id);
      if (!site) {
        return {
          isError: true,
          content: [{ type: "text", text: `No site with id ${input.site_id}` }],
        };
      }
      const opts = (() => {
        try {
          return JSON.parse(site.crawl_options_json) as CrawlOptionsJson;
        } catch {
          return {};
        }
      })();

      if (input.mode === "full") {
        ctx.db.prepare("DELETE FROM pages WHERE site_id = ?").run(site.id);
      }

      const { advisor } = await loadRobots(site.base_url, fetcher);
      const sitemapUrls = await loadSitemap(site.base_url, fetcher, {}, advisor.sitemaps());

      const crawlInput: Parameters<typeof crawl>[0] = {
        siteId: site.id,
        baseUrl: site.base_url,
        initialUrls: sitemapUrls,
        queue: ctx.queue,
        robots: advisor,
        db: ctx.db,
        fetcher,
      };
      if (opts.includePatterns) crawlInput.includePatterns = opts.includePatterns;
      if (opts.excludePatterns) crawlInput.excludePatterns = opts.excludePatterns;
      if (typeof opts.maxDepth === "number") crawlInput.maxDepth = opts.maxDepth;
      if (typeof opts.maxPages === "number") crawlInput.maxPages = opts.maxPages;
      if (ctx.userAgent) crawlInput.userAgent = ctx.userAgent;
      if (ctx.embedClient) crawlInput.embedClient = ctx.embedClient;

      const result = await crawl(crawlInput);
      return {
        content: [
          {
            type: "text",
            text: `Refreshed site #${site.id}: +${result.pagesAdded} ~${result.pagesUpdated} =${result.pagesUnchanged} skip${result.pagesSkipped}`,
          },
        ],
        structuredContent: result,
      };
    },
  );
}
