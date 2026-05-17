#!/usr/bin/env node
/**
 * Node-only: BFS-crawl a SPA documentation site through chromium and
 * report how many same-origin in-scope URLs we can reach + the body
 * text size per page. Compares to a native-fetch run on the same seed
 * to quantify the JS-rendering uplift.
 *
 * Run with:
 *   node scripts/measure-playwright-bfs.mjs <base_url> [max_pages]
 *
 * Default base_url:
 *   https://developers.facebook.com/documentation/ads-commerce/marketing-api
 */
import { chromium } from "playwright";

const baseUrl =
  process.argv[2] ?? "https://developers.facebook.com/documentation/ads-commerce/marketing-api";
const maxPages = Number(process.argv[3] ?? "20");

console.log(`[node] runtime = ${process.version}`);
console.log(`[node] base    = ${baseUrl}`);
console.log(`[node] max     = ${maxPages}`);

function isUnderBase(url, base) {
  try {
    const u = new URL(url);
    const b = new URL(base);
    if (u.protocol !== b.protocol || u.host !== b.host) return false;
    const basePath = b.pathname.endsWith("/") ? b.pathname : `${b.pathname}/`;
    const targetPath = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
    return targetPath.startsWith(basePath);
  } catch {
    return false;
  }
}

function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function extractLinks(html, pageUrl) {
  const out = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/g)) {
    try {
      out.push(new URL(m[1], pageUrl).toString());
    } catch {
      // skip
    }
  }
  return out;
}

// --- Pass 1: native-fetch BFS baseline ---------------------------------
async function nativePass() {
  const visited = new Set();
  const queue = [baseUrl];
  let totalBodyChars = 0;
  let totalFetchMs = 0;

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    const t0 = performance.now();
    let html = "";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "docs-mcp/0.0.1" },
      });
      if (res.ok) html = await res.text();
    } catch {
      continue;
    }
    totalFetchMs += performance.now() - t0;
    totalBodyChars += html.length;

    for (const abs of extractLinks(html, url)) {
      const norm = normalize(abs);
      if (norm && !visited.has(norm) && isUnderBase(norm, baseUrl)) {
        queue.push(norm);
      }
    }
  }

  return {
    visited,
    totalBodyChars,
    fetchMsAvg: visited.size > 0 ? Math.round(totalFetchMs / visited.size) : 0,
  };
}

// --- Pass 2: playwright BFS --------------------------------------------
async function playwrightPass() {
  const browser = await chromium.launch({
    headless: true,
    timeout: 60_000,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    userAgent: "docs-mcp/0.0.1 (+playwright)",
  });

  const visited = new Set();
  const queue = [baseUrl];
  let totalBodyChars = 0;
  let totalRenderMs = 0;

  try {
    while (queue.length > 0 && visited.size < maxPages) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);

      const page = await ctx.newPage();
      const t0 = performance.now();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        try {
          await page.waitForLoadState("networkidle", { timeout: 5_000 });
        } catch {
          // long-poll connections are fine
        }
        totalRenderMs += performance.now() - t0;
        const html = await page.content();
        totalBodyChars += html.length;

        for (const abs of extractLinks(html, url)) {
          const norm = normalize(abs);
          if (norm && !visited.has(norm) && isUnderBase(norm, baseUrl)) {
            queue.push(norm);
          }
        }
      } catch {
        // skip page
      } finally {
        if (!page.isClosed()) await page.close();
      }
    }
  } finally {
    await ctx.close();
    await browser.close();
  }

  return {
    visited,
    totalBodyChars,
    renderMsAvg: visited.size > 0 ? Math.round(totalRenderMs / visited.size) : 0,
  };
}

console.log("\n--- native fetch BFS ---");
const nat = await nativePass();
console.log(`pages visited:    ${nat.visited.size}`);
console.log(`avg fetch ms:     ${nat.fetchMsAvg}`);
console.log(`total html chars: ${nat.totalBodyChars.toLocaleString()}`);
console.log("first 5 URLs:");
for (const u of [...nat.visited].slice(0, 5)) console.log(`  ${u}`);

console.log("\n--- playwright BFS ---");
const pw = await playwrightPass();
console.log(`pages visited:    ${pw.visited.size}`);
console.log(`avg render ms:    ${pw.renderMsAvg}`);
console.log(`total html chars: ${pw.totalBodyChars.toLocaleString()}`);
console.log("first 5 URLs:");
for (const u of [...pw.visited].slice(0, 5)) console.log(`  ${u}`);

const onlyInPlaywright = [...pw.visited].filter((u) => !nat.visited.has(u));
console.log(`\nURLs reachable only via playwright BFS: ${onlyInPlaywright.length}`);
for (const u of onlyInPlaywright.slice(0, 10)) console.log(`  ${u}`);
