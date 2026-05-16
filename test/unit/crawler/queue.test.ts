import { describe, expect, it } from "bun:test";
import { createCrawlerQueue } from "../../../src/crawler/queue.ts";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("crawler/queue", () => {
  it("limits per-origin concurrency", async () => {
    const q = createCrawlerQueue({
      globalConcurrency: 16,
      perOriginConcurrency: 2,
      perOriginQps: 100,
    });
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 6 }, (_, i) =>
      q.enqueue("https://a.dev", async () => {
        active++;
        peak = Math.max(peak, active);
        await delay(40);
        active--;
        return i;
      }),
    );
    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("throttles a single origin to perOriginQps", async () => {
    const q = createCrawlerQueue({
      globalConcurrency: 16,
      perOriginConcurrency: 4,
      perOriginQps: 2,
    });
    const started = Date.now();
    const tasks = Array.from({ length: 8 }, () =>
      q.enqueue("https://a.dev", async () => {
        await delay(1);
      }),
    );
    await Promise.all(tasks);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(2500);
  });

  it("runs tasks across different origins in parallel", async () => {
    const q = createCrawlerQueue({
      globalConcurrency: 16,
      perOriginConcurrency: 1,
      perOriginQps: 100,
    });
    const started = Date.now();
    await Promise.all([
      q.enqueue("https://a.dev", () => delay(80)),
      q.enqueue("https://b.dev", () => delay(80)),
      q.enqueue("https://c.dev", () => delay(80)),
      q.enqueue("https://d.dev", () => delay(80)),
    ]);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(250);
  });

  it("setOriginCrawlDelay slows a specific origin", async () => {
    const q = createCrawlerQueue({
      globalConcurrency: 16,
      perOriginConcurrency: 4,
      perOriginQps: 100,
    });
    q.setOriginCrawlDelay("https://slow.dev", 1);
    const started = Date.now();
    const tasks = Array.from({ length: 3 }, () =>
      q.enqueue("https://slow.dev", async () => {
        await delay(1);
      }),
    );
    await Promise.all(tasks);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1500);
  });

  it("propagates AbortSignal", async () => {
    const q = createCrawlerQueue({ globalConcurrency: 1, perOriginConcurrency: 1 });
    const ctl = new AbortController();
    const slow = q.enqueue(
      "https://a.dev",
      () => new Promise((res) => setTimeout(res, 5000)),
      ctl.signal,
    );
    setTimeout(() => ctl.abort(), 30);
    await expect(slow).rejects.toThrow();
  });
});
