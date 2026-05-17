import { createCdpClient } from "./cdp-client.ts";
import { launchChromium } from "./chromium-launcher.ts";
import { DEFAULT_USER_AGENT, type FetchOptions, type FetchResult } from "./fetcher.ts";

export type PlaywrightFetcherOptions = {
  userAgent?: string;
  defaultTimeoutMs?: number;
  defaultMaxBodyBytes?: number;
  launchTimeoutMs?: number;
  executablePath?: string;
};

export type PlaywrightFetcherHandle = {
  fetch: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  close: () => Promise<void>;
};

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_BODY = 5 * 1024 * 1024;
const DEFAULT_LAUNCH_TIMEOUT = 60_000;

export async function createPlaywrightFetcher(
  opts: PlaywrightFetcherOptions = {},
): Promise<PlaywrightFetcherHandle> {
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT;
  const defaultMaxBodyBytes = opts.defaultMaxBodyBytes ?? DEFAULT_MAX_BODY;
  const launchTimeoutMs = opts.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT;

  const launcher = await launchChromium({
    launchTimeoutMs,
    ...(opts.executablePath ? { executablePath: opts.executablePath } : {}),
  });

  const client = await createCdpClient(launcher.wsEndpoint, {
    userAgent,
    defaultTimeoutMs,
    defaultMaxBodyBytes,
    connectTimeoutMs: launchTimeoutMs,
  }).catch(async (err) => {
    await launcher.close();
    throw err;
  });

  return {
    async fetch(url, fetchOpts = {}) {
      if (fetchOpts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const timeoutMs = fetchOpts.timeoutMs ?? defaultTimeoutMs;
      const ceiling = timeoutMs * 2 + 5_000;

      let timer: ReturnType<typeof setTimeout> | null = null;
      const ceilingPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`playwright fetch ${url} timed out after ${ceiling}ms`)),
          ceiling,
        );
        timer.unref?.();
      });

      try {
        return await Promise.race([client.fetch(url, fetchOpts), ceilingPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    async close() {
      await client.close();
      await launcher.close();
    },
  };
}
