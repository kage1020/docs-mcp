import { type CrawlOptions, type CrawlResult, crawl } from "../crawler/crawl.ts";
import { fetchUrl } from "../crawler/fetcher.ts";
import { loadRobots, loadSitemap } from "../crawler/site-setup.ts";
import type { IndexingTask, ServerContext } from "./context.ts";

export type StartCrawlInput = {
  siteId: number;
  baseUrl: string;
  includePatterns?: readonly string[];
  excludePatterns?: readonly string[];
  maxDepth?: number;
  maxPages?: number;
};

export function getOrStartCrawl(ctx: ServerContext, input: StartCrawlInput): IndexingTask {
  const existing = ctx.indexingTasks.get(input.siteId);
  if (existing) return existing;

  const fetcher = ctx.fetcher ?? fetchUrl;
  const userAgent = ctx.userAgent ?? "docs-mcp";

  // Pre-allocate so we can reference `task` from inside the async closure
  // before we know its promise value.
  const task: IndexingTask = {
    siteId: input.siteId,
    baseUrl: input.baseUrl,
    startedAt: Date.now(),
    promise: Promise.resolve(),
  };
  ctx.indexingTasks.set(input.siteId, task);

  task.promise = (async () => {
    try {
      const { advisor, raw } = await loadRobots(input.baseUrl, fetcher);
      if (raw) {
        ctx.db.prepare("UPDATE sites SET robots_txt = ? WHERE id = ?").run(raw, input.siteId);
        const delay = advisor.crawlDelay(userAgent);
        if (typeof delay === "number" && delay > 0) {
          ctx.queue.setOriginCrawlDelay(new URL(input.baseUrl).origin, delay);
        }
      }
      const sitemapUrls = await loadSitemap(input.baseUrl, fetcher, {}, advisor.sitemaps());
      const crawlInput: CrawlOptions = {
        siteId: input.siteId,
        baseUrl: input.baseUrl,
        initialUrls: sitemapUrls,
        queue: ctx.queue,
        robots: advisor,
        db: ctx.db,
        fetcher,
        userAgent,
      };
      if (input.includePatterns) crawlInput.includePatterns = input.includePatterns;
      if (input.excludePatterns) crawlInput.excludePatterns = input.excludePatterns;
      if (typeof input.maxDepth === "number") crawlInput.maxDepth = input.maxDepth;
      if (typeof input.maxPages === "number") crawlInput.maxPages = input.maxPages;
      if (ctx.embedClient) crawlInput.embedClient = ctx.embedClient;
      const result: CrawlResult = await crawl(crawlInput);
      task.result = result;
      ctx.lastCrawlResults.set(input.siteId, result);
    } catch (err) {
      task.error = err instanceof Error ? err.message : String(err);
    } finally {
      ctx.indexingTasks.delete(input.siteId);
    }
  })();

  return task;
}
