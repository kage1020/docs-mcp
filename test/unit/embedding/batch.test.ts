import { afterEach, describe, expect, it } from "bun:test";
import { embedBatch } from "../../../src/embedding/batch.ts";
import { createEmbeddingClient } from "../../../src/embedding/client.ts";
import {
  type FakeEmbeddingServer,
  startFakeEmbeddingServer,
} from "../../helpers/embedding-server.ts";

describe("embedding/batch", () => {
  let server: FakeEmbeddingServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it("returns vectors in input order across batches", async () => {
    server = startFakeEmbeddingServer({ dim: 4 });
    const client = createEmbeddingClient({
      baseUrl: `${server.origin}/v1`,
      model: "m",
    });
    const texts = Array.from({ length: 35 }, (_, i) => `doc-${i}`);
    const result = await embedBatch(texts, { client, batchSize: 16, parallelism: 2 });
    expect(result).toHaveLength(35);
    for (let i = 0; i < 35; i++) {
      expect(result[i]).toHaveLength(4);
    }
    expect(server.embeddingsCalls()).toBe(Math.ceil(35 / 16));
  });

  it("issues at least ceil(N/batchSize) embed calls", async () => {
    server = startFakeEmbeddingServer({ dim: 4 });
    const client = createEmbeddingClient({
      baseUrl: `${server.origin}/v1`,
      model: "m",
    });
    const texts = Array.from({ length: 100 }, (_, i) => `t${i}`);
    await embedBatch(texts, { client, batchSize: 16 });
    expect(server.embeddingsCalls()).toBeGreaterThanOrEqual(Math.ceil(100 / 16));
  });

  it("rejects with AbortError when signal aborts", async () => {
    server = startFakeEmbeddingServer({ dim: 4 });
    const client = createEmbeddingClient({
      baseUrl: `${server.origin}/v1`,
      model: "m",
    });
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 5);
    const texts = Array.from({ length: 200 }, (_, i) => `t${i}`);
    await expect(embedBatch(texts, { client, batchSize: 4, signal: ctl.signal })).rejects.toThrow();
  });

  it("returns [] for empty input", async () => {
    server = startFakeEmbeddingServer();
    const client = createEmbeddingClient({
      baseUrl: `${server.origin}/v1`,
      model: "m",
    });
    expect(await embedBatch([], { client })).toEqual([]);
  });
});
