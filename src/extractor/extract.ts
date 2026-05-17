import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type ExtractInput = {
  url: string;
  html: string;
};

export type Extracted = {
  url: string;
  title: string | null;
  contentHtml: string;
};

const CHROME_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
];

function resolveRelativeUrls(root: Element, pageUrl: string): void {
  const aList = root.querySelectorAll("a[href]");
  for (const a of Array.from(aList) as Element[]) {
    const href = a.getAttribute("href");
    if (!href) continue;
    try {
      a.setAttribute("href", new URL(href, pageUrl).toString());
    } catch {
      // leave as-is
    }
  }
  const imgList = root.querySelectorAll("img[src]");
  for (const img of Array.from(imgList) as Element[]) {
    const src = img.getAttribute("src");
    if (src) {
      try {
        img.setAttribute("src", new URL(src, pageUrl).toString());
      } catch {
        // leave as-is
      }
    }
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
  }
}

function stripChrome(doc: Document): void {
  for (const sel of CHROME_SELECTORS) {
    for (const el of Array.from(doc.querySelectorAll(sel)) as Element[]) {
      el.remove();
    }
  }
}

function basePageUrl(doc: Document, fallback: string): string {
  const base = doc.querySelector("base[href]");
  const href = base?.getAttribute("href");
  if (!href) return fallback;
  try {
    return new URL(href, fallback).toString();
  } catch {
    return fallback;
  }
}

function extractTitle(doc: Document): string | null {
  const t = doc.querySelector("title")?.textContent?.trim();
  if (t) return t;
  const h1 = doc.querySelector("h1")?.textContent?.trim();
  return h1 ?? null;
}

const FALLBACK_SELECTORS = ["main", "article", '[role="main"]'];
const LOW_SCORE_RATIO = 0.05;
const FALLBACK_GAIN_MIN = 2;

function textLengthOf(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function pickLargestFallback(doc: Document): { html: string; length: number } | null {
  let best: { html: string; length: number } | null = null;
  for (const sel of FALLBACK_SELECTORS) {
    for (const el of Array.from(doc.querySelectorAll(sel)) as Element[]) {
      const html = el.innerHTML;
      const len = textLengthOf(html);
      if (!best || len > best.length) best = { html, length: len };
    }
  }
  return best;
}

export function extract({ url, html }: ExtractInput): Extracted | null {
  if (typeof html !== "string" || html.trim() === "") return null;

  const { document } = parseHTML(html);
  stripChrome(document as unknown as Document);
  const pageUrl = basePageUrl(document as unknown as Document, url);
  if (document.documentElement) {
    resolveRelativeUrls(document.documentElement as unknown as Element, pageUrl);
  }

  const titleFromDoc = extractTitle(document as unknown as Document);

  let articleHtml: string | null = null;
  let articleTitle: string | null = null;
  try {
    // Readability mutates the document; clone first by re-parsing.
    const { document: cloneDoc } = parseHTML(
      (document as unknown as Document).documentElement?.outerHTML ?? "",
    );
    const reader = new Readability(cloneDoc as unknown as Document, { keepClasses: true });
    const result = reader.parse();
    if (result) {
      articleHtml = result.content ?? null;
      articleTitle = result.title?.trim() || null;
    }
  } catch {
    // fall back below
  }

  const bodyLen = textLengthOf(document.body?.innerHTML ?? "");
  const readabilityLen = articleHtml ? textLengthOf(articleHtml) : 0;
  const suspectShort =
    articleHtml !== null && bodyLen > 0 && readabilityLen < bodyLen * LOW_SCORE_RATIO;

  if (!articleHtml || suspectShort) {
    const candidate = pickLargestFallback(document as unknown as Document);
    if (
      candidate &&
      candidate.length > 0 &&
      (!articleHtml || candidate.length >= readabilityLen * FALLBACK_GAIN_MIN)
    ) {
      articleHtml = candidate.html;
    } else if (!articleHtml) {
      articleHtml = document.body?.innerHTML ?? null;
    }
  }

  if (!articleHtml || articleHtml.trim() === "") return null;

  return {
    url: pageUrl,
    title: articleTitle ?? titleFromDoc,
    contentHtml: articleHtml,
  };
}
