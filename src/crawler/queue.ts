import PQueue from "p-queue";

export type CrawlerQueueOptions = {
  globalConcurrency?: number;
  perOriginConcurrency?: number;
  perOriginQps?: number;
};

export interface CrawlerQueue {
  enqueue<T>(origin: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  setOriginCrawlDelay(origin: string, seconds: number): void;
  size(): { global: number; perOrigin: Record<string, number> };
}

function makeOriginQueue(perOriginConcurrency: number, qps: number): PQueue {
  return new PQueue({
    concurrency: perOriginConcurrency,
    interval: 1000,
    intervalCap: Math.max(1, Math.round(qps)),
    carryoverConcurrencyCount: true,
  });
}

export function createCrawlerQueue(opts: CrawlerQueueOptions = {}): CrawlerQueue {
  const globalConcurrency = opts.globalConcurrency ?? 8;
  const perOriginConcurrency = opts.perOriginConcurrency ?? 2;
  const defaultQps = opts.perOriginQps ?? 2;

  const global = new PQueue({ concurrency: globalConcurrency });
  const perOrigin = new Map<string, PQueue>();
  const originQps = new Map<string, number>();

  const getOrigin = (origin: string): PQueue => {
    let q = perOrigin.get(origin);
    if (!q) {
      const qps = originQps.get(origin) ?? defaultQps;
      q = makeOriginQueue(perOriginConcurrency, qps);
      perOrigin.set(origin, q);
    }
    return q;
  };

  return {
    async enqueue<T>(origin: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const oq = getOrigin(origin);
      const result = await global.add(
        async () => {
          const value = await oq.add(fn, { signal: signal as AbortSignal | undefined });
          return value as T;
        },
        { signal: signal as AbortSignal | undefined },
      );
      return result as T;
    },
    setOriginCrawlDelay(origin: string, seconds: number) {
      const qps = seconds > 0 ? 1 / seconds : defaultQps;
      originQps.set(origin, qps);
      const existing = perOrigin.get(origin);
      if (existing) {
        existing.clear();
        perOrigin.set(origin, makeOriginQueue(perOriginConcurrency, qps));
      }
    },
    size() {
      const perOriginCounts: Record<string, number> = {};
      for (const [origin, q] of perOrigin) {
        perOriginCounts[origin] = q.size + q.pending;
      }
      return { global: global.size + global.pending, perOrigin: perOriginCounts };
    },
  };
}
