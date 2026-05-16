import { type FetchOptions, type FetchResult, fetchUrl } from "./fetcher.ts";
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
    let res: FetchResult;
    try {
      res = await fetcher(next, { ...opts, maxRetries: 0 });
    } catch {
      continue;
    }
    if (res.status !== 200 || !res.body) continue;
    const parsed = parseSitemap(res.body);
    for (const url of parsed.urls) out.push(url);
    for (const sub of parsed.sitemaps) {
      if (!seen.has(sub)) queue.push(sub);
    }
  }

  return Array.from(new Set(out));
}
