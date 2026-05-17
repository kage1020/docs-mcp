import type { Database } from "bun:sqlite";
import { searchBm25 } from "./bm25.ts";
import { type FusedHit, rrf } from "./hybrid.ts";
import { extractSnippetParts } from "./snippet.ts";
import { searchVector } from "./vector.ts";

export type SearchMode = "bm25" | "vector" | "hybrid" | "auto";

export type SearchOptions = {
  db: Database;
  query: string;
  mode?: SearchMode;
  topK?: number;
  siteId?: number;
  maxPerPage?: number;
  embeddingsAvailable?: boolean;
  embedQuery?: (query: string) => Promise<number[]>;
};

export type SearchResult = {
  hits: FusedHit[];
  mode: Exclude<SearchMode, "auto">;
};

const FETCH_MULTIPLIER = 3;
const DEFAULT_MAX_PER_PAGE = 2;

function bm25ToFused(hits: ReturnType<typeof searchBm25>): FusedHit[] {
  const max = hits.length === 0 ? 1 : Math.abs(hits[0]?.bm25Score ?? 1);
  return hits.map((h) => {
    const parts = extractSnippetParts(h.text);
    return {
      chunkId: h.chunkId,
      pageUrl: h.pageUrl,
      pageTitle: h.pageTitle,
      headingPath: h.headingPath,
      snippet: h.snippet,
      description: parts.description,
      codeBlocks: parts.codeBlocks,
      tables: parts.tables,
      score: max > 0 ? Math.abs(h.bm25Score) / max : 0,
      source: "bm25",
    };
  });
}

function vecToFused(hits: ReturnType<typeof searchVector>): FusedHit[] {
  return hits.map((h) => {
    const parts = extractSnippetParts(h.text);
    return {
      chunkId: h.chunkId,
      pageUrl: h.pageUrl,
      pageTitle: h.pageTitle,
      headingPath: h.headingPath,
      snippet: h.text.slice(0, 200),
      description: parts.description,
      codeBlocks: parts.codeBlocks,
      tables: parts.tables,
      score: 1 - Math.min(1, h.distance),
      source: "vector",
    };
  });
}

/**
 * Two-pass cap: first take at most `maxPerPage` hits per pageUrl while we
 * still have room for `topK`. If we don't reach `topK` (fewer pages than
 * topK / maxPerPage), do a second pass that fills the remaining slots
 * with the leftover hits in original rank order. This preserves
 * AC-20.4: cap is a target distribution, not a hard ceiling.
 */
function diversifyByPage(hits: readonly FusedHit[], topK: number, maxPerPage: number): FusedHit[] {
  if (maxPerPage <= 0 || hits.length === 0) return hits.slice(0, topK);
  const perPage = new Map<string, number>();
  const accepted: FusedHit[] = [];
  const leftover: FusedHit[] = [];
  for (const h of hits) {
    const c = perPage.get(h.pageUrl) ?? 0;
    if (c < maxPerPage && accepted.length < topK) {
      perPage.set(h.pageUrl, c + 1);
      accepted.push(h);
    } else {
      leftover.push(h);
    }
  }
  for (const h of leftover) {
    if (accepted.length >= topK) break;
    accepted.push(h);
  }
  return accepted;
}

export async function search(opts: SearchOptions): Promise<SearchResult> {
  const topK = opts.topK ?? 10;
  const maxPerPage = opts.maxPerPage ?? DEFAULT_MAX_PER_PAGE;
  let mode: Exclude<SearchMode, "auto"> =
    opts.mode === "auto" || !opts.mode
      ? opts.embeddingsAvailable && opts.embedQuery
        ? "hybrid"
        : "bm25"
      : opts.mode;

  if (mode === "vector" && !opts.embedQuery) {
    throw new Error("search(mode=vector): embedQuery is required");
  }
  if (mode === "hybrid" && !opts.embedQuery) {
    mode = "bm25";
  }

  // Over-fetch so per-page cap still leaves enough candidates.
  const fetchK = Math.max(topK * FETCH_MULTIPLIER, 50);

  const bm25Opts: { topK: number; siteId?: number } = { topK: fetchK };
  if (typeof opts.siteId === "number") bm25Opts.siteId = opts.siteId;

  if (mode === "bm25") {
    const bm25Hits = searchBm25(opts.db, opts.query, bm25Opts);
    return { hits: diversifyByPage(bm25ToFused(bm25Hits), topK, maxPerPage), mode };
  }

  const vectorOpts: { topK: number; siteId?: number } = { topK: fetchK };
  if (typeof opts.siteId === "number") vectorOpts.siteId = opts.siteId;

  if (mode === "vector") {
    if (!opts.embedQuery) throw new Error("unreachable");
    const queryVec = await opts.embedQuery(opts.query);
    const vecHits = searchVector(opts.db, queryVec, vectorOpts);
    return { hits: diversifyByPage(vecToFused(vecHits), topK, maxPerPage), mode };
  }

  if (!opts.embedQuery) throw new Error("unreachable");
  const [bm25Hits, queryVec] = await Promise.all([
    Promise.resolve(searchBm25(opts.db, opts.query, bm25Opts)),
    opts.embedQuery(opts.query),
  ]);
  const vecHits = searchVector(opts.db, queryVec, vectorOpts);
  // Fuse with a generous topK so diversification has candidates to choose from.
  const fused = rrf(bm25Hits, vecHits, { topK: fetchK });
  return {
    hits: diversifyByPage(fused, topK, maxPerPage),
    mode: "hybrid",
  };
}
