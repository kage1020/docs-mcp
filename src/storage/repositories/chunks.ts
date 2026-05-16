import type { Database } from "bun:sqlite";
import type { Chunk } from "../../indexer/chunk.ts";

export type ChunkRow = {
  id: number;
  page_id: number;
  ord: number;
  heading_path: string;
  text: string;
  token_count: number;
};

export function replaceChunks(db: Database, pageId: number, chunks: readonly Chunk[]): number {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM chunks WHERE page_id = ?").run(pageId);
    if (chunks.length === 0) return 0;
    const ins = db.prepare(
      "INSERT INTO chunks(page_id, ord, heading_path, text, token_count) VALUES (?, ?, ?, ?, ?)",
    );
    for (const c of chunks) {
      ins.run(pageId, c.ord, c.headingPath, c.text, c.tokenCount);
    }
    return chunks.length;
  });
  return tx();
}

export function listChunksByPage(db: Database, pageId: number): ChunkRow[] {
  return db
    .query<ChunkRow, [number]>("SELECT * FROM chunks WHERE page_id = ? ORDER BY ord")
    .all(pageId);
}

export function countChunks(db: Database, siteId: number): number {
  return (
    db
      .query<{ c: number }, [number]>(
        "SELECT COUNT(*) AS c FROM chunks JOIN pages ON chunks.page_id = pages.id WHERE pages.site_id = ?",
      )
      .get(siteId)?.c ?? 0
  );
}
