import type { Database } from "bun:sqlite";
import { searchBm25 } from "./bm25.ts";
import { type FusedHit, rrf } from "./hybrid.ts";
import { searchVector } from "./vector.ts";

export type SearchMode = "bm25" | "vector" | "hybrid" | "auto";

export type SearchOptions = {
  db: Database;
  query: string;
  mode?: SearchMode;
  topK?: number;
  siteId?: number;
  embeddingsAvailable?: boolean;
  embedQuery?: (query: string) => Promise<number[]>;
};

export type SearchResult = {
  hits: FusedHit[];
  mode: Exclude<SearchMode, "auto">;
};

const FETCH_MULTIPLIER = 3;

function bm25ToFused(hits: ReturnType<typeof searchBm25>): FusedHit[] {
  const max = hits.length === 0 ? 1 : Math.abs(hits[0]?.bm25Score ?? 1);
  return hits.map((h) => ({
    chunkId: h.chunkId,
    pageUrl: h.pageUrl,
    pageTitle: h.pageTitle,
    headingPath: h.headingPath,
    snippet: h.snippet,
    score: max > 0 ? Math.abs(h.bm25Score) / max : 0,
    source: "bm25",
  }));
}

function vecToFused(hits: ReturnType<typeof searchVector>): FusedHit[] {
  return hits.map((h) => ({
    chunkId: h.chunkId,
    pageUrl: h.pageUrl,
    pageTitle: h.pageTitle,
    headingPath: h.headingPath,
    snippet: h.text.slice(0, 200),
    score: 1 - Math.min(1, h.distance),
    source: "vector",
  }));
}

export async function search(opts: SearchOptions): Promise<SearchResult> {
  const topK = opts.topK ?? 10;
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

  const bm25Opts: { topK: number; siteId?: number } = {
    topK: mode === "bm25" ? topK : Math.max(topK * FETCH_MULTIPLIER, 50),
  };
  if (typeof opts.siteId === "number") bm25Opts.siteId = opts.siteId;

  if (mode === "bm25") {
    const bm25Hits = searchBm25(opts.db, opts.query, bm25Opts);
    return { hits: bm25ToFused(bm25Hits).slice(0, topK), mode };
  }

  const vectorOpts: { topK: number; siteId?: number } = {
    topK: mode === "vector" ? topK : Math.max(topK * FETCH_MULTIPLIER, 50),
  };
  if (typeof opts.siteId === "number") vectorOpts.siteId = opts.siteId;

  if (mode === "vector") {
    if (!opts.embedQuery) throw new Error("unreachable");
    const queryVec = await opts.embedQuery(opts.query);
    const vecHits = searchVector(opts.db, queryVec, vectorOpts);
    return { hits: vecToFused(vecHits).slice(0, topK), mode };
  }

  if (!opts.embedQuery) throw new Error("unreachable");
  const [bm25Hits, queryVec] = await Promise.all([
    Promise.resolve(searchBm25(opts.db, opts.query, bm25Opts)),
    opts.embedQuery(opts.query),
  ]);
  const vecHits = searchVector(opts.db, queryVec, vectorOpts);
  return {
    hits: rrf(bm25Hits, vecHits, { topK }),
    mode: "hybrid",
  };
}
