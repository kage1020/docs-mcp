import type { Database } from "bun:sqlite";
import type { CrawlResult } from "../crawler/crawl.ts";
import type { FetchOptions, FetchResult } from "../crawler/fetcher.ts";
import type { CrawlerQueue } from "../crawler/queue.ts";
import type { RobotsAdvisor } from "../crawler/robots.ts";
import type { EmbeddingClient } from "../embedding/client.ts";

export type IndexingTask = {
  siteId: number;
  baseUrl: string;
  startedAt: number;
  promise: Promise<void>;
  result?: CrawlResult;
  error?: string;
};

export type ServerContext = {
  db: Database;
  queue: CrawlerQueue;
  embeddingsAvailable: boolean;
  embedQuery?: (q: string) => Promise<number[]>;
  embedClient?: EmbeddingClient;
  fetcher?: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  userAgent?: string;
  indexingTasks: Map<number, IndexingTask>;
  robotsCache: Map<string, RobotsAdvisor>;
};
