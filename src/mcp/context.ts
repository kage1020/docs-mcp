import type { Database } from "bun:sqlite";
import type { FetchOptions, FetchResult } from "../crawler/fetcher.ts";
import type { CrawlerQueue } from "../crawler/queue.ts";

export type ServerContext = {
  db: Database;
  queue: CrawlerQueue;
  embeddingsAvailable: boolean;
  embedQuery?: (q: string) => Promise<number[]>;
  fetcher?: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  userAgent?: string;
};
