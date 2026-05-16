import { bench, describe } from "vitest";
import type { Bm25Hit } from "../../src/search/bm25.ts";
import { rrf } from "../../src/search/hybrid.ts";
import type { VectorHit } from "../../src/search/vector.ts";

function bm25Hits(n: number): Bm25Hit[] {
  return Array.from({ length: n }, (_, i) => ({
    chunkId: i,
    pageUrl: `https://x/${i}`,
    pageTitle: `T${i}`,
    headingPath: "H",
    snippet: "s",
    bm25Score: -(n - i),
  }));
}
function vecHits(n: number): VectorHit[] {
  return Array.from({ length: n }, (_, i) => ({
    chunkId: i + 25,
    pageUrl: `https://x/${i + 25}`,
    pageTitle: `T${i + 25}`,
    headingPath: "H",
    text: "t",
    distance: i / n,
  }));
}

const BM = bm25Hits(50);
const VC = vecHits(50);

describe("search/hybrid.rrf", () => {
  bench("merge two top-50 lists", () => {
    rrf(BM, VC, { topK: 10 });
  });
});
