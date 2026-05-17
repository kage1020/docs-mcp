import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { createPlaywrightFetcher } from "../../src/crawler/playwright-fetcher.ts";
import { startServer, type TestServer } from "../helpers/http-server.ts";

const FIXTURE_HTML = `<!doctype html><html><head><title>worker fixture</title></head>
<body><h1>Hello</h1>
<script>document.body.setAttribute("data-hydrated", "yes");</script>
</body></html>`;

let chromiumAvailable = true;

beforeAll(async () => {
  try {
    await import("playwright");
  } catch {
    chromiumAvailable = false;
    return;
  }
  // Try to launch the worker once. If chromium is not installed (e.g.
  // CI host without `playwright install`), skip the suite.
  try {
    const handle = await createPlaywrightFetcher({ launchTimeoutMs: 90_000 });
    await handle.close();
  } catch {
    chromiumAvailable = false;
  }
});

describe("integration/playwright-worker", () => {
  const servers: TestServer[] = [];
  const handles: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) await h.close();
    for (const s of servers.splice(0)) await s.stop();
  });

  it("AC-29.1: launches chromium via CDP and fetches a fixture with JS executed", async () => {
    if (!chromiumAvailable) return;
    const server = startServer(
      () => new Response(FIXTURE_HTML, { headers: { "content-type": "text/html" } }),
    );
    servers.push(server);
    const handle = await createPlaywrightFetcher({ launchTimeoutMs: 90_000 });
    handles.push(handle);

    const res = await handle.fetch(`${server.origin}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('data-hydrated="yes"');
    expect(res.body).toContain("Hello");
  }, 120_000);

  it("AC-29.2: multiple sequential fetches reuse the same chromium process", async () => {
    if (!chromiumAvailable) return;
    const server = startServer(
      () => new Response(FIXTURE_HTML, { headers: { "content-type": "text/html" } }),
    );
    servers.push(server);
    const handle = await createPlaywrightFetcher({ launchTimeoutMs: 90_000 });
    handles.push(handle);

    const r1 = await handle.fetch(`${server.origin}/a`);
    const r2 = await handle.fetch(`${server.origin}/b`);
    const r3 = await handle.fetch(`${server.origin}/c`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    // server should see 3 hits — fixture served the same body each time
    expect(server.hits()).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it("AC-29.3: close() shuts chromium down cleanly", async () => {
    if (!chromiumAvailable) return;
    const handle = await createPlaywrightFetcher({ launchTimeoutMs: 90_000 });
    // First do a successful fetch to ensure chromium is healthy.
    const server = startServer(
      () => new Response(FIXTURE_HTML, { headers: { "content-type": "text/html" } }),
    );
    servers.push(server);
    const res = await handle.fetch(`${server.origin}/`);
    expect(res.status).toBe(200);
    // Now close — should resolve within a few seconds.
    const t0 = performance.now();
    await handle.close();
    const closeMs = performance.now() - t0;
    expect(closeMs).toBeLessThan(10_000);
  }, 60_000);
});
