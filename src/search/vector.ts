import type { Database } from "bun:sqlite";

export type VectorHit = {
  chunkId: number;
  pageUrl: string;
  pageTitle: string | null;
  headingPath: string;
  text: string;
  distance: number;
};

export type VectorOptions = {
  topK?: number;
  siteId?: number;
};

type Row = {
  chunk_id: number;
  url: string;
  title: string | null;
  heading_path: string;
  text: string;
  distance: number;
};

function vecTableExists(db: Database): boolean {
  return !!db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_vec'",
    )
    .get();
}

function asBlob(embedding: readonly number[]): Buffer {
  const f32 = Float32Array.from(embedding);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

export function searchVector(
  db: Database,
  embedding: readonly number[],
  opts: VectorOptions = {},
): VectorHit[] {
  if (!vecTableExists(db)) return [];
  const topK = opts.topK ?? 10;
  const blob = asBlob(embedding);

  const filter = typeof opts.siteId === "number" ? "AND p.site_id = ?" : "";
  const sql = `
    SELECT
      c.id AS chunk_id,
      p.url AS url,
      p.title AS title,
      c.heading_path AS heading_path,
      c.text AS text,
      v.distance AS distance
    FROM (
      SELECT chunk_id, distance FROM chunks_vec WHERE embedding MATCH ? AND k = ?
    ) v
    JOIN chunks c ON c.id = v.chunk_id
    JOIN pages p ON p.id = c.page_id
    ${filter}
    ORDER BY v.distance
  `;

  const params: Array<Buffer | number> = [blob, topK];
  if (typeof opts.siteId === "number") params.push(opts.siteId);

  try {
    const rows = db.query<Row, Array<Buffer | number>>(sql).all(...params);
    return rows.map((r) => ({
      chunkId: r.chunk_id,
      pageUrl: r.url,
      pageTitle: r.title,
      headingPath: r.heading_path,
      text: r.text,
      distance: r.distance,
    }));
  } catch {
    return [];
  }
}
