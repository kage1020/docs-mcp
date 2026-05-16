import { afterEach, describe, expect, it } from "bun:test";
import { probeEmbedding } from "../../../src/embedding/probe.ts";
import {
  type FakeEmbeddingServer,
  startFakeEmbeddingServer,
} from "../../helpers/embedding-server.ts";

describe("embedding/probe", () => {
  let server: FakeEmbeddingServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it("returns available + dim when /embeddings responds", async () => {
    server = startFakeEmbeddingServer({ dim: 12 });
    const r = await probeEmbedding({
      baseUrl: `${server.origin}/v1`,
      model: "nomic-embed-text",
    });
    expect(r.available).toBe(true);
    if (r.available) {
      expect(r.dim).toBe(12);
      expect(r.model).toBe("nomic-embed-text");
    }
  });

  it("returns available even when the requested model is missing from /models", async () => {
    server = startFakeEmbeddingServer({ models: ["other-model"], dim: 6 });
    const r = await probeEmbedding({
      baseUrl: `${server.origin}/v1`,
      model: "nomic-embed-text",
    });
    expect(r.available).toBe(true);
  });

  it("returns unavailable when the embeddings endpoint fails", async () => {
    server = startFakeEmbeddingServer({ failEmbeddings: true });
    const r = await probeEmbedding({
      baseUrl: `${server.origin}/v1`,
      model: "any",
    });
    expect(r.available).toBe(false);
    if (!r.available) expect(typeof r.reason).toBe("string");
  });

  it("returns unavailable when the host is unreachable", async () => {
    const r = await probeEmbedding({
      baseUrl: "http://127.0.0.1:1/v1",
      model: "any",
      timeoutMs: 500,
    });
    expect(r.available).toBe(false);
  });
});
