import type { Database } from "bun:sqlite";
import type { FetchOptions, FetchResult } from "../crawler/fetcher.ts";
import type { CrawlerQueue } from "../crawler/queue.ts";
import type { EmbeddingClient } from "../embedding/client.ts";

export type ServerContext = {
  db: Database;
  queue: CrawlerQueue;
  embeddingsAvailable: boolean;
  embedQuery?: (q: string) => Promise<number[]>;
  embedClient?: EmbeddingClient;
  fetcher?: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  userAgent?: string;
};
