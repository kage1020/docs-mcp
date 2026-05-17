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
const TABLE_LOSS_MIN_SOURCE = 3;
const TABLE_LOSS_MAX_KEPT_RATIO = 0.3;

function textLengthOf(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function countTables(html: string): number {
  return (html.match(/<table[\s>]/gi) ?? []).length;
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

/**
 * Wrap consecutive orphan <tr> elements (rows whose nearest ancestor is
 * NOT a <table>) into a synthetic <table><tbody>. Readability sometimes
 * strips the <table> wrapper while leaving the row text in place — the
 * resulting orphans flatten into "cellAcellBcellC" under turndown.
 * Re-wrapping them lets the GFM table plugin produce a proper
 * `| cellA | cellB | cellC |` row.
 */
function rewrapOrphanRows(html: string): string {
  if (!html.includes("<tr")) return html;
  // Match runs of one-or-more sibling <tr>...</tr> blocks at the top of
  // the input (not already inside a <table>).
  return html.replace(/(?:<tr\b[\s\S]*?<\/tr>\s*)+/gi, (run) => {
    return `<table><tbody>${run}</tbody></table>`;
  });
}

const IDENT_RE = /^[\w.[\]-]+$/;

function moveChildren(from: Element, to: Element): void {
  // Move (clone, then attach) children of `from` to `to`. We clone so the
  // original DOM is untouched and the structural transform stays pure.
  for (const child of Array.from(from.childNodes)) {
    to.appendChild(child.cloneNode(true));
  }
}

/**
 * Detect spec-style tables (a field-definition list shaped as a table)
 * and rewrite each row into <h4>name</h4> + <p>meta · cells</p> +
 * <div>description children</div>. GFM markdown tables can't carry
 * multi-paragraph cells, so when turndown sees a Yahoo Ads / OpenAPI
 * cell with nested <div lang="ja">…</div> blocks it leaks the cell
 * content out of the row. Splitting each row into its own heading +
 * description block gives turndown something it can render cleanly and
 * gives the chunker a per-field heading anchor that BM25 can match.
 */
function transformSpecTables(doc: Document): void {
  for (const table of Array.from(doc.querySelectorAll("table")) as Element[]) {
    const rows = Array.from(table.querySelectorAll("tr")) as Element[];
    if (rows.length < 3) continue;

    const bodyRows = rows.slice(1);
    if (bodyRows.length < 2) continue;

    let identifierLike = 0;
    let columns = 0;
    for (const tr of bodyRows) {
      const tds = Array.from(tr.querySelectorAll("td")) as Element[];
      if (tds.length < 3) continue;
      columns = Math.max(columns, tds.length);
      const first = (tds[0]?.textContent ?? "").trim();
      if (first.length > 0 && first.length <= 80 && IDENT_RE.test(first)) {
        identifierLike++;
      }
    }
    if (columns < 3 || identifierLike < Math.max(2, Math.floor(bodyRows.length * 0.5))) {
      continue;
    }

    const replacement = doc.createElement("div");
    replacement.setAttribute("data-spec-table", "true");

    for (const tr of bodyRows) {
      const tds = Array.from(tr.querySelectorAll("td")) as Element[];
      if (tds.length === 0) continue;
      const name = (tds[0]?.textContent ?? "").trim();
      if (!name) continue;

      const h = doc.createElement("h4");
      h.textContent = name;
      replacement.appendChild(h);

      const meta: string[] = [];
      for (let i = 1; i < tds.length - 1; i++) {
        const t = (tds[i]?.textContent ?? "").trim().replace(/\s+/g, " ");
        if (t) meta.push(t);
      }
      if (meta.length > 0) {
        const p = doc.createElement("p");
        p.textContent = meta.join(" · ");
        replacement.appendChild(p);
      }

      const lastTd = tds[tds.length - 1];
      if (lastTd && (lastTd.textContent ?? "").trim() !== "") {
        const desc = doc.createElement("div");
        moveChildren(lastTd, desc);
        replacement.appendChild(desc);
      }
    }

    table.replaceWith(replacement);
  }
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

  // Detect that Readability dropped <table> wrappers it shouldn't have.
  // Spec-style docs (Yahoo Ads, OpenAPI generators) carry their entire
  // field/type/required information inside <table>s; when those go,
  // turndown flattens the orphan <tr> cells into "fooStringTrue".
  const tablesInSource = countTables(html);
  const tablesInArticle = articleHtml ? countTables(articleHtml) : 0;
  const tableLoss =
    tablesInSource >= TABLE_LOSS_MIN_SOURCE &&
    tablesInArticle <= Math.floor(tablesInSource * TABLE_LOSS_MAX_KEPT_RATIO);

  if (!articleHtml || suspectShort || tableLoss) {
    const candidate = pickLargestFallback(document as unknown as Document);
    if (
      candidate &&
      candidate.length > 0 &&
      (!articleHtml ||
        candidate.length >= readabilityLen * FALLBACK_GAIN_MIN ||
        (tableLoss && countTables(candidate.html) > tablesInArticle))
    ) {
      articleHtml = candidate.html;
    } else if (!articleHtml) {
      articleHtml = document.body?.innerHTML ?? null;
    }
  }

  // If after all that we still have orphan <tr> rows (Readability stripped
  // <table> but left the row text in place), re-wrap them so turndown
  // produces real markdown tables instead of concatenated cell text.
  if (articleHtml?.includes("<tr") && !/<table[\s>]/i.test(articleHtml)) {
    articleHtml = rewrapOrphanRows(articleHtml);
  }

  // Spec-style tables (field-definition lists in <table> form) need
  // restructuring so turndown can render them as heading + paragraph
  // chunks. The chunker then turns each field into its own searchable
  // unit with the field name in the heading_path.
  if (articleHtml && /<table[\s>]/i.test(articleHtml)) {
    const { document: tdoc } = parseHTML(`<!doctype html><html><body>${articleHtml}</body></html>`);
    transformSpecTables(tdoc as unknown as Document);
    articleHtml = tdoc.body?.innerHTML ?? articleHtml;
  }

  if (!articleHtml || articleHtml.trim() === "") return null;

  return {
    url: pageUrl,
    title: articleTitle ?? titleFromDoc,
    contentHtml: articleHtml,
  };
}
