import { gunzipSync } from "node:zlib";
import { DEFAULT_USER_AGENT, type FetchOptions, type FetchResult, fetchUrl } from "./fetcher.ts";
import { createRobots, type RobotsAdvisor } from "./robots.ts";
import { parseSitemap } from "./sitemap.ts";

export type Fetcher = (url: string, opts?: FetchOptions) => Promise<FetchResult>;

export async function loadRobots(
  baseUrl: string,
  fetcher: Fetcher = fetchUrl,
  opts: FetchOptions = {},
): Promise<{ advisor: RobotsAdvisor; raw: string }> {
  let raw = "";
  try {
    const u = new URL(baseUrl);
    const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
    const res = await fetcher(robotsUrl, { ...opts, maxRetries: 0 });
    if (res.status === 200) raw = res.body;
  } catch {
    // ignore — empty robots.txt = allow all
  }
  return { advisor: createRobots(raw, baseUrl), raw };
}

function isGzipUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".gz");
  } catch {
    return false;
  }
}

async function fetchSitemapBody(
  url: string,
  fetcher: Fetcher,
  opts: FetchOptions,
  userAgent?: string,
): Promise<string> {
  if (!isGzipUrl(url)) {
    try {
      const res = await fetcher(url, { ...opts, maxRetries: 0 });
      return res.status === 200 && res.body ? res.body : "";
    } catch {
      return "";
    }
  }
  // gzip path: native fetch with raw bytes + manual gunzip. The custom
  // fetcher returns UTF-8-decoded body, which mangles raw gzip bytes.
  try {
    const ua = userAgent ?? opts.userAgent ?? DEFAULT_USER_AGENT;
    const res = await fetch(url, {
      headers: { "User-Agent": ua, "Accept-Encoding": "identity" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    return gunzipSync(buf).toString("utf-8");
  } catch {
    return "";
  }
}

export async function loadSitemap(
  baseUrl: string,
  fetcher: Fetcher = fetchUrl,
  opts: FetchOptions = {},
  fromAdvisor?: readonly string[],
  maxFollow = 8,
): Promise<string[]> {
  const u = new URL(baseUrl);
  const candidates = new Set<string>();
  if (fromAdvisor) for (const s of fromAdvisor) candidates.add(s);
  candidates.add(`${u.protocol}//${u.host}/sitemap.xml`);
  candidates.add(`${u.protocol}//${u.host}/sitemap_index.xml`);

  const seen = new Set<string>();
  const queue = [...candidates];
  const out: string[] = [];
  let followed = 0;

  while (queue.length > 0 && followed < maxFollow) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    followed++;
    const body = await fetchSitemapBody(next, fetcher, opts);
    if (!body) continue;
    const parsed = parseSitemap(body);
    for (const url of parsed.urls) out.push(url);
    for (const sub of parsed.sitemaps) {
      if (!seen.has(sub)) queue.push(sub);
    }
  }

  return Array.from(new Set(out));
}
