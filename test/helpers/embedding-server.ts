import { startServer, type TestServer } from "./http-server.ts";

export type FakeEmbeddingOptions = {
  dim?: number;
  models?: string[];
  // make /embeddings reject — used to simulate a non-functional endpoint
  failEmbeddings?: boolean;
};

function fakeVector(text: string, dim: number): number[] {
  const v = new Array<number>(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % dim] = (v[i % dim] ?? 0) + text.charCodeAt(i) / 1024;
  }
  return v;
}

export type FakeEmbeddingServer = TestServer & {
  embeddingsCalls: () => number;
};

export function startFakeEmbeddingServer(opts: FakeEmbeddingOptions = {}): FakeEmbeddingServer {
  const dim = opts.dim ?? 8;
  const models = opts.models ?? ["nomic-embed-text"];
  let embeddingsCalls = 0;

  const server = startServer(async (req) => {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/models")) {
      return Response.json({
        data: models.map((id) => ({ id, object: "model" })),
      });
    }
    if (url.pathname.endsWith("/embeddings")) {
      embeddingsCalls++;
      if (opts.failEmbeddings) {
        return new Response("nope", { status: 500 });
      }
      const body = (await req.json()) as { input?: string | string[] };
      const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
      return Response.json({
        data: inputs.map((text, i) => ({
          embedding: fakeVector(text, dim),
          index: i,
        })),
      });
    }
    return new Response("not found", { status: 404 });
  });

  return Object.assign(server, { embeddingsCalls: () => embeddingsCalls });
}
