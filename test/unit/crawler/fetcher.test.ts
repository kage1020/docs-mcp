import { afterEach, describe, expect, it } from "bun:test";
import { DEFAULT_USER_AGENT, fetchUrl } from "../../../src/crawler/fetcher.ts";
import { startServer, type TestServer } from "../../helpers/http-server.ts";

describe("crawler/fetcher", () => {
  let server: TestServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it("returns body, status, and url for a 200 response", async () => {
    server = startServer(() => new Response("hello", { status: 200 }));
    const r = await fetchUrl(server.url, { maxRetries: 0 });
    expect(r.status).toBe(200);
    expect(r.body).toBe("hello");
  });

  it("sends the default User-Agent", async () => {
    server = startServer(() => new Response("ok"));
    await fetchUrl(server.url, { maxRetries: 0 });
    const ua = server.capturedRequests[0]?.headers.get("user-agent");
    expect(ua).toBe(DEFAULT_USER_AGENT);
  });

  it("sends a custom User-Agent when supplied", async () => {
    server = startServer(() => new Response("ok"));
    await fetchUrl(server.url, { userAgent: "test-agent/1.0", maxRetries: 0 });
    expect(server.capturedRequests[0]?.headers.get("user-agent")).toBe("test-agent/1.0");
  });

  it("retries on 500 then succeeds", async () => {
    let n = 0;
    server = startServer(() => {
      n++;
      return new Response(n < 3 ? "err" : "ok", { status: n < 3 ? 500 : 200 });
    });
    const r = await fetchUrl(server.url, { maxRetries: 3, retryDelayMs: 5 });
    expect(r.status).toBe(200);
    expect(r.body).toBe("ok");
    expect(server.hits()).toBe(3);
  });

  it("returns last 5xx after maxRetries", async () => {
    server = startServer(() => new Response("nope", { status: 503 }));
    const r = await fetchUrl(server.url, { maxRetries: 2, retryDelayMs: 5 });
    expect(r.status).toBe(503);
    expect(server.hits()).toBe(3);
  });

  it("honors Retry-After on 429", async () => {
    let n = 0;
    server = startServer(() => {
      n++;
      if (n === 1) {
        return new Response("slow down", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      return new Response("ok", { status: 200 });
    });
    const sleeps: number[] = [];
    const r = await fetchUrl(server.url, {
      maxRetries: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(r.status).toBe(200);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
  });

  it("returns 304 without body when If-None-Match matches", async () => {
    server = startServer((req) => {
      if (req.headers.get("if-none-match") === '"v1"') {
        return new Response(null, { status: 304 });
      }
      return new Response("body", { status: 200, headers: { ETag: '"v1"' } });
    });
    const r = await fetchUrl(server.url, { ifNoneMatch: '"v1"', maxRetries: 0 });
    expect(r.status).toBe(304);
    expect(r.body).toBe("");
  });

  it("truncates body to maxBodyBytes", async () => {
    server = startServer(() => new Response("a".repeat(10_000), { status: 200 }));
    const r = await fetchUrl(server.url, { maxBodyBytes: 1000, maxRetries: 0 });
    expect(r.body.length).toBe(1000);
    expect(r.bodyTruncated).toBe(true);
  });

  it("rejects promptly when signal is aborted", async () => {
    server = startServer(
      () => new Promise<Response>((r) => setTimeout(() => r(new Response("late")), 2000)),
    );
    const ctl = new AbortController();
    const p = fetchUrl(server.url, { signal: ctl.signal, maxRetries: 0 });
    setTimeout(() => ctl.abort(), 20);
    await expect(p).rejects.toThrow();
  });
});
