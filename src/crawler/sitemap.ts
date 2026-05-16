import { XMLParser } from "fast-xml-parser";

export type SitemapParseResult = {
  urls: string[];
  sitemaps: string[];
};

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

function pickLocs(node: unknown): string[] {
  if (node === null || node === undefined) return [];
  const entries = Array.isArray(node) ? node : [node];
  const out: string[] = [];
  for (const e of entries) {
    if (typeof e !== "object" || e === null) continue;
    const loc = (e as { loc?: unknown }).loc;
    if (typeof loc === "string") {
      const v = loc.trim();
      if (v) out.push(v);
    }
  }
  return out;
}

function isHttpUrl(v: string): boolean {
  return v.startsWith("http://") || v.startsWith("https://");
}

function uniq(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function parseSitemap(xml: string): SitemapParseResult {
  const empty: SitemapParseResult = { urls: [], sitemaps: [] };
  if (typeof xml !== "string" || xml.trim() === "") return empty;

  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;

  const root = parsed as Record<string, unknown>;
  const urlset = root.urlset as { url?: unknown } | undefined;
  const sitemapindex = root.sitemapindex as { sitemap?: unknown } | undefined;

  const urls = uniq(pickLocs(urlset?.url).filter(isHttpUrl));
  const sitemaps = uniq(pickLocs(sitemapindex?.sitemap).filter(isHttpUrl));
  return { urls, sitemaps };
}
