import type { Browser, BrowserContext } from "playwright";
import { DEFAULT_USER_AGENT, type FetchOptions, type FetchResult } from "./fetcher.ts";

export type PlaywrightFetcherOptions = {
  userAgent?: string;
  defaultTimeoutMs?: number;
  defaultMaxBodyBytes?: number;
};

export type PlaywrightFetcherHandle = {
  fetch: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  close: () => Promise<void>;
};

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_BODY = 5 * 1024 * 1024;

function truncate(s: string, max: number): { body: string; truncated: boolean } {
  if (Buffer.byteLength(s, "utf8") <= max) return { body: s, truncated: false };
  // Walk the string until adding the next codepoint would exceed max bytes.
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

export async function createPlaywrightFetcher(
  opts: PlaywrightFetcherOptions = {},
): Promise<PlaywrightFetcherHandle> {
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT;
  const defaultMaxBodyBytes = opts.defaultMaxBodyBytes ?? DEFAULT_MAX_BODY;

  const { chromium } = await import("playwright");
  const browser: Browser = await chromium.launch({
    headless: true,
    timeout: 60_000,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context: BrowserContext = await browser.newContext({
    userAgent,
    javaScriptEnabled: true,
    bypassCSP: true,
  });

  return {
    async fetch(url, fetchOpts = {}): Promise<FetchResult> {
      const timeoutMs = fetchOpts.timeoutMs ?? defaultTimeoutMs;
      const maxBodyBytes = fetchOpts.maxBodyBytes ?? defaultMaxBodyBytes;
      const signal = fetchOpts.signal;

      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const page = await context.newPage();
      const onAbort = () => {
        // best-effort: close the page to unblock goto
        page.close({ runBeforeUnload: false }).catch(() => undefined);
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });
        try {
          await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 8_000) });
        } catch {
          // ignore — some sites keep long-poll connections open
        }
        const status = response?.status() ?? 0;
        const headerRecord = response?.headers() ?? {};
        const headers = new Headers();
        for (const [k, v] of Object.entries(headerRecord)) headers.set(k, v);
        const rawBody = await page.content();
        const { body, truncated } = truncate(rawBody, maxBodyBytes);
        return {
          status,
          headers,
          body,
          url: page.url() || url,
          bodyTruncated: truncated,
        };
      } finally {
        signal?.removeEventListener("abort", onAbort);
        if (!page.isClosed()) await page.close();
      }
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
