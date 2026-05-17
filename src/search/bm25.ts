import type { Database } from "bun:sqlite";

export type Bm25Hit = {
  chunkId: number;
  pageUrl: string;
  pageTitle: string | null;
  headingPath: string;
  snippet: string;
  text: string;
  bm25Score: number;
};

export type Bm25Options = {
  topK?: number;
  siteId?: number;
};

type Row = {
  chunk_id: number;
  url: string;
  title: string | null;
  heading_path: string;
  snippet: string;
  text: string;
  bm25_score: number;
};

function isBlank(s: string): boolean {
  return s == null || s.trim() === "";
}

export function searchBm25(db: Database, query: string, opts: Bm25Options = {}): Bm25Hit[] {
  if (isBlank(query)) return [];
  const topK = opts.topK ?? 10;

  const where: string[] = ["chunks_fts MATCH ?"];
  const params: Array<string | number> = [query];
  if (typeof opts.siteId === "number") {
    where.push("p.site_id = ?");
    params.push(opts.siteId);
  }
  params.push(topK);

  const sql = `
    SELECT
      c.id AS chunk_id,
      p.url AS url,
      p.title AS title,
      c.heading_path AS heading_path,
      snippet(chunks_fts, 0, '<<', '>>', '...', 32) AS snippet,
      c.text AS text,
      bm25(chunks_fts) AS bm25_score
    FROM chunks_fts
    JOIN chunks c ON c.id = chunks_fts.rowid
    JOIN pages p ON p.id = c.page_id
    WHERE ${where.join(" AND ")}
    ORDER BY bm25_score
    LIMIT ?
  `;

  try {
    const rows = db.query<Row, Array<string | number>>(sql).all(...params);
    return rows.map((r) => ({
      chunkId: r.chunk_id,
      pageUrl: r.url,
      pageTitle: r.title,
      headingPath: r.heading_path,
      snippet: r.snippet,
      text: r.text,
      bm25Score: r.bm25_score,
    }));
  } catch {
    return [];
  }
}
