export type EmbeddingClientOptions = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type EmbeddingClient = {
  embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]>;
  baseUrl: string;
  model: string;
};

type EmbeddingResponse = {
  data?: Array<{ embedding: number[]; index?: number }>;
};

function trimTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

export function createEmbeddingClient(opts: EmbeddingClientOptions): EmbeddingClient {
  const baseUrl = trimTrailingSlash(opts.baseUrl);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  return {
    baseUrl,
    model: opts.model,
    async embed(texts, signal) {
      const url = `${baseUrl}/embeddings`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: opts.model, input: texts }),
        signal: combined,
      });
      if (!res.ok) {
        throw new Error(`embeddings request failed: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as EmbeddingResponse;
      const data = json.data ?? [];
      const out: number[][] = new Array(texts.length);
      for (let i = 0; i < data.length; i++) {
        const entry = data[i];
        if (!entry) continue;
        const idx = typeof entry.index === "number" ? entry.index : i;
        out[idx] = entry.embedding;
      }
      return out;
    },
  };
}
