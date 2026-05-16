import { afterEach, describe, expect, it } from "bun:test";
import { createEmbeddingClient } from "../../../src/embedding/client.ts";
import {
  type FakeEmbeddingServer,
  startFakeEmbeddingServer,
} from "../../helpers/embedding-server.ts";

describe("embedding/client", () => {
  let server: FakeEmbeddingServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it("posts to <baseUrl>/embeddings with model + input", async () => {
    server = startFakeEmbeddingServer({ dim: 4 });
    const client = createEmbeddingClient({
      baseUrl: `${server.origin}/v1`,
      model: "nomic-embed-text",
    });
    const out = await client.embed(["hello", "world"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(4);
    expect(out[1]).toHaveLength(4);
    expect(server.embeddingsCalls()).toBe(1);
  });

  it("includes Authorization header when apiKey is set", async () => {
    server = startFakeEmbeddingServer();
    const client = createEmbeddingClient({
      baseUrl: `${server.origin}/v1`,
      model: "m",
      apiKey: "sk-test",
    });
    await client.embed(["x"]);
    expect(server.capturedRequests[0]?.headers.get("authorization")).toBe("Bearer sk-test");
  });

  it("throws on non-2xx with the status in the message", async () => {
    server = startFakeEmbeddingServer({ failEmbeddings: true });
    const client = createEmbeddingClient({
      baseUrl: `${server.origin}/v1`,
      model: "m",
    });
    await expect(client.embed(["x"])).rejects.toThrow(/500/);
  });
});
