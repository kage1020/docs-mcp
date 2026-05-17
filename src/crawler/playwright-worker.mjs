#!/usr/bin/env node
// Long-running playwright worker.
// Owns a single chromium browser/context. Reads NDJSON requests from
// stdin and writes NDJSON responses to stdout. stderr is reserved for
// human-readable logs.
//
// Protocol:
//   ready          ← worker: {"type":"ready"}
//   launch error   ← worker: {"type":"launch_error","message":...}; exits 1
//   fetch          → parent: {"id":N,"op":"fetch","url":...,"timeoutMs":N,"maxBodyBytes":N}
//                  ← worker: {"id":N,"ok":true,"status":N,"headers":{...},
//                             "body":"...","url":"...","bodyTruncated":bool}
//                            or {"id":N,"ok":false,"error":"..."}
//   close          → parent: {"op":"close"}; worker drains, closes, exits 0
//
// This file is a .mjs (not .ts) because it has to run under Node directly.

import { chromium } from "playwright";

const launchTimeoutMs = Number(process.env.DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT ?? "60000");
const userAgent = process.env.DOCS_MCP_USER_AGENT ?? "docs-mcp";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BODY = 5 * 1024 * 1024;

const send = (obj) => {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
};

function truncate(s, max) {
  if (Buffer.byteLength(s, "utf8") <= max) return { body: s, truncated: false };
  let bytes = 0;
  let cutoff = s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] ?? "";
    const inc = Buffer.byteLength(ch, "utf8");
    if (bytes + inc > max) {
      cutoff = i;
      break;
    }
    bytes += inc;
  }
  return { body: s.slice(0, cutoff), truncated: true };
}

let browser;
let context;
try {
  browser = await chromium.launch({
    headless: true,
    timeout: launchTimeoutMs,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  context = await browser.newContext({
    userAgent,
    javaScriptEnabled: true,
    bypassCSP: true,
  });
} catch (err) {
  send({ type: "launch_error", message: err?.message ?? String(err) });
  process.exit(1);
}

send({ type: "ready" });

async function handleFetch(req) {
  const timeoutMs = Number(req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxBodyBytes = Number(req.maxBodyBytes ?? DEFAULT_MAX_BODY);
  const page = await context.newPage();
  try {
    const response = await page.goto(req.url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    try {
      await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 8_000) });
    } catch {
      // some sites keep long-poll connections open — ignore
    }
    const status = response?.status() ?? 0;
    const headers = response?.headers() ?? {};
    const rawBody = await page.content();
    const { body, truncated } = truncate(rawBody, maxBodyBytes);
    send({
      id: req.id,
      ok: true,
      status,
      headers,
      body,
      url: page.url() || req.url,
      bodyTruncated: truncated,
    });
  } catch (err) {
    send({ id: req.id, ok: false, error: err?.message ?? String(err) });
  } finally {
    if (!page.isClosed()) await page.close().catch(() => undefined);
  }
}

async function shutdown() {
  try {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
  } finally {
    process.exit(0);
  }
}

let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const nl = buffer.indexOf("\n");
    if (nl < 0) break;
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      process.stderr.write(`[playwright-worker] parse error: ${err}\n`);
      continue;
    }
    if (msg.op === "close") {
      shutdown();
      return;
    }
    if (msg.op === "fetch") {
      // Fire-and-forget; responses are correlated by id.
      handleFetch(msg).catch((err) => {
        send({ id: msg.id, ok: false, error: err?.message ?? String(err) });
      });
    }
  }
});

process.stdin.on("end", () => {
  shutdown();
});
