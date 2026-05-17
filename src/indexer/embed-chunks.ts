import type { Database } from "bun:sqlite";
import { embedBatch } from "../embedding/batch.ts";
import type { EmbeddingClient } from "../embedding/client.ts";

function asBlob(embedding: readonly number[]): Buffer {
  const f32 = Float32Array.from(embedding);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

function vecTableExists(db: Database): boolean {
  return !!db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_vec'",
    )
    .get();
}

export async function embedAndStoreChunks(
  db: Database,
  pageId: number,
  client: EmbeddingClient,
  opts: { batchSize?: number; onError?: (err: unknown) => void } = {},
): Promise<{ embedded: number }> {
  if (!vecTableExists(db)) return { embedded: 0 };

  const rows = db
    .query<{ id: number; text: string }, [number]>(
      "SELECT id, text FROM chunks WHERE page_id = ? ORDER BY ord",
    )
    .all(pageId);
  if (rows.length === 0) return { embedded: 0 };

  let vectors: number[][];
  try {
    vectors = await embedBatch(
      rows.map((r) => r.text),
      { client, batchSize: opts.batchSize ?? 16 },
    );
  } catch (err) {
    opts.onError?.(err);
    return { embedded: 0 };
  }

  const del = db.prepare("DELETE FROM chunks_vec WHERE chunk_id = ?");
  const ins = db.prepare("INSERT INTO chunks_vec(chunk_id, embedding) VALUES (?, ?)");
  let embedded = 0;
  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const vec = vectors[i];
      if (!row || !vec || vec.length === 0) continue;
      del.run(row.id);
      ins.run(row.id, asBlob(vec));
      embedded++;
    }
  });
  tx();
  return { embedded };
}
