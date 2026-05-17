#!/usr/bin/env bun
// One-shot smoke test for the CDP-backed playwright fetcher.
// Spins up a tiny Bun.serve fixture, launches chromium, fetches one
// page, and prints whether the round-trip succeeded.
//
//   bun run scripts/smoke-playwright-fetcher.ts

import { createPlaywrightFetcher } from "../src/crawler/playwright-fetcher.ts";

const FIXTURE_HTML = `<!doctype html><html><head><title>Smoke</title></head>
<body><h1>hello</h1><p>via playwright worker</p>
<script>document.body.dataset.hydrated = "yes";</script>
</body></html>`;

const server = Bun.serve({
  port: 0,
  fetch: () => new Response(FIXTURE_HTML, { headers: { "content-type": "text/html" } }),
});
const url = `http://127.0.0.1:${server.port}/`;
console.log(`[smoke] fixture at ${url}`);

const t0 = performance.now();
const handle = await createPlaywrightFetcher({ launchTimeoutMs: 90_000 });
const launchMs = Math.round(performance.now() - t0);
console.log(`[smoke] chromium ready in ${launchMs}ms`);

const t1 = performance.now();
const res = await handle.fetch(url, { timeoutMs: 30_000 });
const fetchMs = Math.round(performance.now() - t1);
console.log(
  `[smoke] fetch ${fetchMs}ms — status=${res.status} bodyBytes=${res.body.length} truncated=${res.bodyTruncated}`,
);
console.log(`[smoke] body snippet: ${res.body.slice(0, 200).replace(/\s+/g, " ")}`);

await handle.close();
server.stop(true);
console.log("[smoke] done");
