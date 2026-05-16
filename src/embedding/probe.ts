import { createEmbeddingClient } from "./client.ts";

export type ProbeOptions = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type ProbeResult =
  | { available: true; model: string; dim: number }
  | { available: false; reason: string };

function trimTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

export async function probeEmbedding(opts: ProbeOptions): Promise<ProbeResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const baseUrl = trimTrailingSlash(opts.baseUrl);

  // /models is informational — failure here is a soft signal.
  try {
    const headers: Record<string, string> = {};
    if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
    await fetchImpl(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // ignore; some endpoints don't expose /models
  }

  const clientOpts: Parameters<typeof createEmbeddingClient>[0] = {
    baseUrl,
    model: opts.model,
    fetchImpl,
    timeoutMs,
  };
  if (opts.apiKey) clientOpts.apiKey = opts.apiKey;
  const client = createEmbeddingClient(clientOpts);
  try {
    const out = await client.embed(["probe"]);
    const vec = out[0];
    if (!vec || !Array.isArray(vec) || vec.length === 0) {
      return { available: false, reason: "embeddings response missing vector" };
    }
    return { available: true, model: opts.model, dim: vec.length };
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
