import { afterEach, describe, expect, it } from "bun:test";
import { createEmbeddingClient } from "../../../src/embedding/client.ts";
import { embedAndStoreChunks } from "../../../src/indexer/embed-chunks.ts";
import { type DbHandle, ensureVecTable, openDb } from "../../../src/storage/db.ts";
import { migrate } from "../../../src/storage/migrate.ts";
import {
  type FakeEmbeddingServer,
  startFakeEmbeddingServer,
} from "../../helpers/embedding-server.ts";

describe("indexer/embed-chunks", () => {
  const handles: DbHandle[] = [];
  const servers: FakeEmbeddingServer[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) h.close();
    for (const s of servers.splice(0)) await s.stop();
  });

  function setup(dim = 8): { h: DbHandle; pageId: number; chunkIds: number[] } {
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    migrate(h.db);
    ensureVecTable(h.db, dim);
    h.db
      .prepare(
        "INSERT INTO sites(id, base_url, name, crawl_options_json, created_at, updated_at) VALUES (1, 'https://x/', 'x', '{}', 0, 0)",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO pages(id, site_id, url, content_hash, markdown, markdown_size, fetched_at) VALUES (1, 1, 'https://x/p', 'h', 'm', 1, 0)",
      )
      .run();
    const ins = h.db.prepare(
      "INSERT INTO chunks(id, page_id, ord, heading_path, text, token_count) VALUES (?, 1, ?, 'H', ?, 5)",
    );
    ins.run(10, 0, "alpha");
    ins.run(11, 1, "beta");
    ins.run(12, 2, "gamma");
    return { h, pageId: 1, chunkIds: [10, 11, 12] };
  }

  it("embeds every chunk of the page and inserts into chunks_vec", async () => {
    const server = startFakeEmbeddingServer({ dim: 8 });
    servers.push(server);
    const client = createEmbeddingClient({ baseUrl: `${server.origin}/v1`, model: "m" });
    const { h, pageId, chunkIds } = setup(8);
    const r = await embedAndStoreChunks(h.db, pageId, client);
    expect(r.embedded).toBe(3);
    const rows = h.db
      .query<{ chunk_id: number }, []>("SELECT chunk_id FROM chunks_vec ORDER BY chunk_id")
      .all();
    expect(rows.map((r) => r.chunk_id)).toEqual(chunkIds);
  });

  it("is a no-op when chunks_vec doesn't exist", async () => {
    const server = startFakeEmbeddingServer({ dim: 8 });
    servers.push(server);
    const client = createEmbeddingClient({ baseUrl: `${server.origin}/v1`, model: "m" });
    // skip ensureVecTable
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    migrate(h.db);
    h.db
      .prepare(
        "INSERT INTO sites(id, base_url, name, crawl_options_json, created_at, updated_at) VALUES (1, 'https://x/', 'x', '{}', 0, 0)",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO pages(id, site_id, url, content_hash, markdown, markdown_size, fetched_at) VALUES (1, 1, 'https://x/p', 'h', 'm', 1, 0)",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO chunks(page_id, ord, heading_path, text, token_count) VALUES (1, 0, 'H', 'x', 1)",
      )
      .run();
    const r = await embedAndStoreChunks(h.db, 1, client);
    expect(r.embedded).toBe(0);
  });

  it("replaces existing vectors (re-index after content change)", async () => {
    const server = startFakeEmbeddingServer({ dim: 8 });
    servers.push(server);
    const client = createEmbeddingClient({ baseUrl: `${server.origin}/v1`, model: "m" });
    const { h, pageId } = setup(8);
    await embedAndStoreChunks(h.db, pageId, client);
    const before = server.embeddingsCalls();
    await embedAndStoreChunks(h.db, pageId, client);
    expect(server.embeddingsCalls()).toBeGreaterThan(before);
    const count = h.db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM chunks_vec").get()?.c;
    expect(count).toBe(3); // not 6 — old rows were deleted
  });

  it("swallows endpoint errors and reports embedded=0", async () => {
    const server = startFakeEmbeddingServer({ failEmbeddings: true });
    servers.push(server);
    const client = createEmbeddingClient({ baseUrl: `${server.origin}/v1`, model: "m" });
    const { h, pageId } = setup(8);
    let captured: unknown = null;
    const r = await embedAndStoreChunks(h.db, pageId, client, {
      onError: (e) => {
        captured = e;
      },
    });
    expect(r.embedded).toBe(0);
    expect(captured).toBeDefined();
  });
});
