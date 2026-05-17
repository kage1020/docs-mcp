import type { Bm25Hit } from "./bm25.ts";
import { type CodeBlock, extractSnippetParts } from "./snippet.ts";
import type { VectorHit } from "./vector.ts";

export type FusedHit = {
  chunkId: number;
  pageUrl: string;
  pageTitle: string | null;
  headingPath: string;
  snippet: string;
  description: string;
  codeBlocks: CodeBlock[];
  score: number;
  source: "bm25" | "vector" | "both";
};

export type RrfOptions = {
  k?: number;
  topK?: number;
};

const SNIPPET_FALLBACK_LEN = 200;

export function rrf(
  bm25Hits: readonly Bm25Hit[],
  vecHits: readonly VectorHit[],
  opts: RrfOptions = {},
): FusedHit[] {
  const k = opts.k ?? 60;
  const topK = opts.topK ?? 10;

  type Acc = Omit<FusedHit, "score" | "source" | "description" | "codeBlocks"> & {
    score: number;
    text: string;
    bm25Hit: boolean;
    vecHit: boolean;
  };
  const map = new Map<number, Acc>();

  for (let i = 0; i < bm25Hits.length; i++) {
    const h = bm25Hits[i];
    if (!h) continue;
    const rank = i + 1;
    const existing = map.get(h.chunkId);
    if (existing) {
      existing.score += 1 / (k + rank);
      existing.bm25Hit = true;
      if (!existing.text && h.text) existing.text = h.text;
    } else {
      map.set(h.chunkId, {
        chunkId: h.chunkId,
        pageUrl: h.pageUrl,
        pageTitle: h.pageTitle,
        headingPath: h.headingPath,
        snippet: h.snippet,
        text: h.text,
        score: 1 / (k + rank),
        bm25Hit: true,
        vecHit: false,
      });
    }
  }

  for (let i = 0; i < vecHits.length; i++) {
    const h = vecHits[i];
    if (!h) continue;
    const rank = i + 1;
    const existing = map.get(h.chunkId);
    if (existing) {
      existing.score += 1 / (k + rank);
      existing.vecHit = true;
      if (!existing.snippet) existing.snippet = h.text.slice(0, SNIPPET_FALLBACK_LEN);
      if (!existing.text) existing.text = h.text;
    } else {
      map.set(h.chunkId, {
        chunkId: h.chunkId,
        pageUrl: h.pageUrl,
        pageTitle: h.pageTitle,
        headingPath: h.headingPath,
        snippet: h.text.slice(0, SNIPPET_FALLBACK_LEN),
        text: h.text,
        score: 1 / (k + rank),
        bm25Hit: false,
        vecHit: true,
      });
    }
  }

  const entries = Array.from(map.values()).sort((a, b) => b.score - a.score);
  const max = entries[0]?.score ?? 1;
  return entries.slice(0, topK).map((e) => {
    const parts = extractSnippetParts(e.text);
    return {
      chunkId: e.chunkId,
      pageUrl: e.pageUrl,
      pageTitle: e.pageTitle,
      headingPath: e.headingPath,
      snippet: e.snippet,
      description: parts.description,
      codeBlocks: parts.codeBlocks,
      score: max > 0 ? e.score / max : 0,
      source: e.bm25Hit && e.vecHit ? "both" : e.bm25Hit ? "bm25" : "vector",
    };
  });
}
