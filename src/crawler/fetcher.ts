import packageJson from "../../package.json" with { type: "json" };

export type FetchOptions = {
  userAgent?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type FetchResult = {
  status: number;
  headers: Headers;
  body: string;
  url: string;
  bodyTruncated: boolean;
};

const DEFAULT_TIMEOUT = 20_000;
const DEFAULT_MAX_BODY = 5 * 1024 * 1024;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE = 500;

export const DEFAULT_USER_AGENT = `docs-mcp/${packageJson.version} (+https://github.com/kage1020/docs-mcp)`;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function expBackoff(attempt: number, baseMs: number): number {
  const cap = baseMs * 2 ** attempt;
  return Math.floor(Math.random() * cap);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

async function readBoundedBody(
  res: Response,
  max: number,
): Promise<{ body: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { body: "", truncated: false };
  const decoder = new TextDecoder("utf-8");
  let total = 0;
  let truncated = false;
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      const overshoot = total - max;
      out += decoder.decode(value.slice(0, value.byteLength - overshoot), { stream: false });
      truncated = true;
      await reader.cancel();
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  if (!truncated) out += decoder.decode();
  return { body: out, truncated };
}

function mergeSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
  const real = signals.filter((s): s is AbortSignal => !!s);
  if (real.length === 0) return new AbortController().signal;
  if (real.length === 1 && real[0]) return real[0];
  const ctl = new AbortController();
  const onAbort = (reason: unknown) => ctl.abort(reason);
  for (const s of real) {
    if (s.aborted) {
      ctl.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => onAbort(s.reason), { once: true });
  }
  return ctl.signal;
}

export async function fetchUrl(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBase = opts.retryDelayMs ?? DEFAULT_RETRY_BASE;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown = null;
  let lastResult: FetchResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const perAttempt = AbortSignal.timeout(timeoutMs);
    const signal = mergeSignals([opts.signal, perAttempt]);
    const headers: Record<string, string> = {
      "User-Agent": userAgent,
      Accept: "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
    };
    if (opts.ifNoneMatch) headers["If-None-Match"] = opts.ifNoneMatch;
    if (opts.ifModifiedSince) headers["If-Modified-Since"] = opts.ifModifiedSince;

    try {
      const res = await fetch(url, { headers, signal });

      if (res.status === 304) {
        return {
          status: 304,
          headers: res.headers,
          body: "",
          url: res.url || url,
          bodyTruncated: false,
        };
      }

      if (res.status === 429) {
        const ra = parseRetryAfter(res.headers.get("Retry-After"));
        if (attempt < maxRetries) {
          await sleep(ra ?? expBackoff(attempt, retryBase));
          lastResult = {
            status: 429,
            headers: res.headers,
            body: "",
            url: res.url || url,
            bodyTruncated: false,
          };
          continue;
        }
        const body = await readBoundedBody(res, maxBodyBytes);
        return {
          status: 429,
          headers: res.headers,
          body: body.body,
          url: res.url || url,
          bodyTruncated: body.truncated,
        };
      }

      if (res.status >= 500 && res.status < 600 && attempt < maxRetries) {
        await sleep(expBackoff(attempt, retryBase));
        lastResult = {
          status: res.status,
          headers: res.headers,
          body: "",
          url: res.url || url,
          bodyTruncated: false,
        };
        continue;
      }

      const body = await readBoundedBody(res, maxBodyBytes);
      return {
        status: res.status,
        headers: res.headers,
        body: body.body,
        url: res.url || url,
        bodyTruncated: body.truncated,
      };
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(expBackoff(attempt, retryBase));
      }
    }
  }
  if (lastResult) return lastResult;
  throw lastErr ?? new Error(`fetchUrl: exhausted retries for ${url}`);
}
