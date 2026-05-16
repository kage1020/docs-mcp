import type { EmbeddingClient } from "./client.ts";

export type EmbedBatchOptions = {
  client: EmbeddingClient;
  batchSize?: number;
  parallelism?: number;
  signal?: AbortSignal;
};

function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function embedBatch(
  texts: readonly string[],
  opts: EmbedBatchOptions,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const batchSize = Math.max(1, opts.batchSize ?? 16);
  const parallelism = Math.max(1, opts.parallelism ?? 4);
  const signal = opts.signal;

  const batches = chunkArray(texts, batchSize);
  const result: number[][] = new Array(texts.length);
  let nextBatch = 0;
  let aborted = false;

  const onAbort = () => {
    aborted = true;
  };
  if (signal) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const workers = Array.from({ length: Math.min(parallelism, batches.length) }, async () => {
      while (true) {
        if (aborted) throw new DOMException("Aborted", "AbortError");
        const batchIdx = nextBatch++;
        if (batchIdx >= batches.length) return;
        const batch = batches[batchIdx];
        if (!batch) return;
        const offset = batchIdx * batchSize;
        const vecs = await opts.client.embed(batch, signal);
        for (let i = 0; i < batch.length; i++) {
          const v = vecs[i];
          if (v) result[offset + i] = v;
        }
      }
    });
    await Promise.all(workers);
    return result;
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
