#!/usr/bin/env node
/**
 * Standalone Node check: confirms playwright + chromium can fetch a SPA
 * documentation page end-to-end on this machine.
 *
 * Run with:
 *   node scripts/check-playwright-node.mjs [url]
 *
 * Default URL is a Google Ads REST v22 service detail page — pure SPA
 * that returns only a shell HTML to native fetch.
 */
import { chromium } from "playwright";

const url =
  process.argv[2] ??
  "https://developers.google.com/google-ads/api/reference/rest/v22/services/CampaignService";

console.log(`[node] runtime = ${process.version}`);
console.log(`[node] target  = ${url}\n`);

const launchStart = performance.now();
const browser = await chromium.launch({
  headless: true,
  timeout: 60_000,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const launchMs = Math.round(performance.now() - launchStart);
console.log(`[browser] launched in ${launchMs}ms`);

const ctx = await browser.newContext({
  userAgent: "docs-mcp/0.0.1 (+https://github.com/kage1020/docs-mcp)",
});

const page = await ctx.newPage();

const gotoStart = performance.now();
const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
try {
  await page.waitForLoadState("networkidle", { timeout: 8_000 });
} catch {
  // ignore long-poll keep-alives
}
const gotoMs = Math.round(performance.now() - gotoStart);

const status = response?.status();
const html = await page.content();
const title = await page.title();
const visibleText = (await page.evaluate(() => document.body?.innerText ?? "")).trim();

console.log(`[fetch ] status=${status} ${gotoMs}ms`);
console.log(`[fetch ] title  = ${title}`);
console.log(`[fetch ] html   = ${html.length.toLocaleString()} chars`);
console.log(`[fetch ] body text = ${visibleText.length.toLocaleString()} chars`);
console.log("\n[body text — first 400 chars]");
console.log(visibleText.slice(0, 400));

// Native fetch comparison
const fetchStart = performance.now();
const nativeRes = await fetch(url, {
  headers: { "user-agent": "docs-mcp/0.0.1 (+https://github.com/kage1020/docs-mcp)" },
});
const nativeBody = await nativeRes.text();
const fetchMs = Math.round(performance.now() - fetchStart);

console.log(`\n[native fetch] status=${nativeRes.status} ${fetchMs}ms`);
console.log(`[native fetch] html = ${nativeBody.length.toLocaleString()} chars`);

await ctx.close();
await browser.close();
console.log("\n[done]");
