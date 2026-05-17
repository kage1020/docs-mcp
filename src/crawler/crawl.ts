import type { Database } from "bun:sqlite";
import { parseHTML } from "linkedom";
import { extract } from "../extractor/extract.ts";
import { htmlToMarkdown } from "../extractor/markdown.ts";
import { chunk } from "../indexer/chunk.ts";
import { indexPage } from "../indexer/index-page.ts";
import { touchLastCrawledAt } from "../storage/repositories/sites.ts";
import { type FetchOptions, type FetchResult, fetchUrl } from "./fetcher.ts";
import type { CrawlerQueue } from "./queue.ts";
import type { RobotsAdvisor } from "./robots.ts";
import { isUnderBase, matchPatterns, normalize } from "./url.ts";

export type CrawlOptions = {
  siteId: number;
  baseUrl: string;
  initialUrls?: readonly string[];
  includePatterns?: readonly string[];
  excludePatterns?: readonly string[];
  maxDepth?: number;
  maxPages?: number;
  queue: CrawlerQueue;
  robots: RobotsAdvisor;
  db: Database;
  userAgent?: string;
  fetcher?: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  now?: () => number;
  signal?: AbortSignal;
};

export type CrawlResult = {
  pagesAdded: number;
  pagesUpdated: number;
  pagesUnchanged: number;
  pagesSkipped: number;
};

function collectLinks(html: string, pageUrl: string): string[] {
  try {
    const { document } = parseHTML(html);
    const out: string[] = [];
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = (a as Element).getAttribute("href");
      if (!href) continue;
      try {
        out.push(new URL(href, pageUrl).toString());
      } catch {
        // ignore invalid hrefs
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function crawl(opts: CrawlOptions): Promise<CrawlResult> {
  const {
    siteId,
    baseUrl,
    initialUrls,
    includePatterns,
    excludePatterns,
    maxDepth = 5,
    maxPages = 2000,
    queue,
    robots,
    db,
    userAgent,
    fetcher = fetchUrl,
    now = () => Date.now(),
    signal,
  } = opts;

  const result: CrawlResult = {
    pagesAdded: 0,
    pagesUpdated: 0,
    pagesUnchanged: 0,
    pagesSkipped: 0,
  };

  const visited = new Set<string>();
  const inflight = new Set<Promise<void>>();
  let enqueuedCount = 0;

  const accept = (url: string): boolean => {
    if (!isUnderBase(url, baseUrl)) return false;
    if (!robots.isAllowed(url, userAgent ?? "docs-mcp")) return false;
    let path = "/";
    try {
      path = new URL(url).pathname;
    } catch {
      return false;
    }
    if (!matchPatterns(path, includePatterns)) return false;
    if (excludePatterns && excludePatterns.length > 0) {
      const negate = excludePatterns.map((p) => (p.startsWith("!") ? p : `!${p}`));
      if (!matchPatterns(path, ["**/*", ...negate])) return false;
    }
    return true;
  };

  const enqueue = (rawUrl: string, depth: number): void => {
    let url: string;
    try {
      url = normalize(rawUrl, { baseUrl });
    } catch {
      return;
    }
    if (visited.has(url)) return;
    visited.add(url);
    if (enqueuedCount >= maxPages) {
      result.pagesSkipped++;
      return;
    }
    if (!accept(url)) {
      result.pagesSkipped++;
      return;
    }
    enqueuedCount++;

    let origin = "";
    try {
      origin = new URL(url).origin;
    } catch {
      return;
    }

    const p = queue
      .enqueue(
        origin,
        async () => {
          if (signal?.aborted) return;
          const fetchOpts: FetchOptions = {};
          if (signal) fetchOpts.signal = signal;
          if (userAgent) fetchOpts.userAgent = userAgent;
          const res = await fetcher(url, fetchOpts);
          if (res.status !== 200 || res.body === "") {
            result.pagesSkipped++;
            return;
          }
          const extracted = extract({ url, html: res.body });
          if (!extracted) {
            result.pagesSkipped++;
            return;
          }
          const md = htmlToMarkdown(extracted.contentHtml);
          const chunks = chunk(md, { leafLabel: true });
          const indexed = indexPage(
            db,
            {
              siteId,
              url,
              title: extracted.title,
              etag: res.headers.get("etag"),
              lastModified: res.headers.get("last-modified"),
              markdown: md,
              fetchedAt: now(),
              depth,
            },
            chunks,
          );
          if (indexed.state === "inserted") result.pagesAdded++;
          else if (indexed.state === "updated") result.pagesUpdated++;
          else result.pagesUnchanged++;

          if (depth + 1 <= maxDepth) {
            for (const link of collectLinks(extracted.contentHtml, url)) {
              enqueue(link, depth + 1);
            }
          }
        },
        signal,
      )
      .catch(() => {
        result.pagesSkipped++;
      });

    let wrapped: Promise<void>;
    wrapped = p.then(() => {
      inflight.delete(wrapped);
    });
    inflight.add(wrapped);
  };

  const seeds = initialUrls && initialUrls.length > 0 ? initialUrls : [baseUrl];
  for (const seed of seeds) enqueue(seed, 0);

  while (inflight.size > 0) {
    await Promise.all([...inflight]);
  }

  touchLastCrawledAt(db, siteId, now());
  return result;
}
