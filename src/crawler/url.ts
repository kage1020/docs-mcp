import micromatch from "micromatch";

export type NormalizeOptions = {
  baseUrl?: string;
  stripTrackingParams?: boolean;
  stripPaginationParams?: readonly string[];
};

const DEFAULT_TRACKERS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
]);

const FILE_LIKE_TAIL = /\.[A-Za-z0-9]{1,6}$/;

function baseHasTrailingSlash(baseUrl: string | undefined): boolean | null {
  if (!baseUrl) return null;
  try {
    const u = new URL(baseUrl);
    return u.pathname.endsWith("/");
  } catch {
    return null;
  }
}

export function normalize(input: string | URL, opts: NormalizeOptions = {}): string {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);

  url.hash = "";

  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  if (url.pathname.endsWith("/index.html")) {
    url.pathname = url.pathname.slice(0, -"index.html".length);
  } else if (url.pathname.endsWith("/index.htm")) {
    url.pathname = url.pathname.slice(0, -"index.htm".length);
  }

  const baseSlash = baseHasTrailingSlash(opts.baseUrl);
  if (baseSlash !== null && url.pathname !== "/") {
    const isFileLike = FILE_LIKE_TAIL.test(url.pathname.split("/").pop() ?? "");
    if (baseSlash && !url.pathname.endsWith("/") && !isFileLike) {
      url.pathname = `${url.pathname}/`;
    } else if (!baseSlash && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
  }

  const stripTrackers = opts.stripTrackingParams !== false;
  const paginationSet = new Set(opts.stripPaginationParams ?? []);
  const entries: [string, string][] = [];
  for (const [k, v] of url.searchParams) {
    if (stripTrackers && DEFAULT_TRACKERS.has(k)) continue;
    if (paginationSet.has(k)) continue;
    entries.push([k, v]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [k, v] of entries) url.searchParams.append(k, v);

  return url.toString();
}

export function isSameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.protocol === ub.protocol && ua.host === ub.host;
  } catch {
    return false;
  }
}

export function isUnderBase(url: string, baseUrl: string): boolean {
  try {
    const u = new URL(url);
    const b = new URL(baseUrl);
    if (u.protocol !== b.protocol || u.host !== b.host) return false;
    const basePath = b.pathname.endsWith("/") ? b.pathname : `${b.pathname}/`;
    const targetPath = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
    return targetPath.startsWith(basePath);
  } catch {
    return false;
  }
}

export function matchPatterns(path: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;
  const positive: string[] = [];
  const negative: string[] = [];
  for (const p of patterns) {
    if (p.startsWith("!")) negative.push(p.slice(1));
    else positive.push(p);
  }
  const positiveOk = positive.length === 0 || micromatch.isMatch(path, positive);
  if (!positiveOk) return false;
  if (negative.length > 0 && micromatch.isMatch(path, negative)) return false;
  return true;
}
