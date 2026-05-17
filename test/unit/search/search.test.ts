import { afterEach, describe, expect, it } from "bun:test";
import { searchBm25 } from "../../../src/search/bm25.ts";
import { rrf } from "../../../src/search/hybrid.ts";
import { search } from "../../../src/search/search.ts";
import { searchVector } from "../../../src/search/vector.ts";
import { type DbHandle, ensureVecTable, openDb } from "../../../src/storage/db.ts";
import { migrate } from "../../../src/storage/migrate.ts";
import { skipIfNoVec } from "../../helpers/vec-availability.ts";

const handles: DbHandle[] = [];

function setup() {
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
      "INSERT INTO sites(id, base_url, name, crawl_options_json, created_at, updated_at) VALUES (2, 'https://y/', 'y', '{}', 0, 0)",
    )
    .run();
  const insertPage = h.db.prepare(
    "INSERT INTO pages(id, site_id, url, title, content_hash, markdown, markdown_size, fetched_at, depth) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)",
  );
  insertPage.run(1, 1, "https://x/a", "A", "h1", "m1", 2);
  insertPage.run(2, 1, "https://x/b", "B", "h2", "m2", 2);
  insertPage.run(3, 2, "https://y/c", "C", "h3", "m3", 2);
  const insertChunk = h.db.prepare(
    "INSERT INTO chunks(id, page_id, ord, heading_path, text, token_count) VALUES (?, ?, 0, ?, ?, ?)",
  );
  insertChunk.run(10, 1, "Routing", "dynamic routes work in next.js for blog posts", 8);
  insertChunk.run(11, 2, "Rendering", "server side rendering improves time to first byte", 8);
  insertChunk.run(12, 3, "Deployment", "deploy to cloudflare workers with wrangler", 6);
  return h;
}

afterEach(() => {
  for (const h of handles.splice(0)) h.close();
});

describe("search/bm25", () => {
  it("ranks chunks containing the query terms higher", () => {
    const h = setup();
    const hits = searchBm25(h.db, "dynamic routes");
    expect(hits[0]?.chunkId).toBe(10);
  });

  it("filters by site_id", () => {
    const h = setup();
    const hits = searchBm25(h.db, "deployment", { siteId: 1 });
    expect(hits.find((x) => x.chunkId === 12)).toBeUndefined();
    const hits2 = searchBm25(h.db, "deployment", { siteId: 2 });
    expect(hits2.find((x) => x.chunkId === 12)?.chunkId).toBe(12);
  });

  it("returns empty for blank query", () => {
    const h = setup();
    expect(searchBm25(h.db, "")).toEqual([]);
    expect(searchBm25(h.db, "    ")).toEqual([]);
  });
});

describe("search/vector", () => {
  it("returns [] when chunks_vec does not exist", () => {
    const h = setup();
    expect(searchVector(h.db, [0, 0, 0, 0])).toEqual([]);
  });

  it("returns nearest neighbors after seeding", () => {
    if (skipIfNoVec()) return;
    const h = setup();
    ensureVecTable(h.db, 4);
    const ins = h.db.prepare("INSERT INTO chunks_vec(chunk_id, embedding) VALUES (?, ?)");
    ins.run(10, Buffer.from(Float32Array.from([1, 0, 0, 0]).buffer));
    ins.run(11, Buffer.from(Float32Array.from([0, 1, 0, 0]).buffer));
    ins.run(12, Buffer.from(Float32Array.from([0, 0, 1, 0]).buffer));
    const hits = searchVector(h.db, [1, 0, 0, 0], { topK: 3 });
    expect(hits[0]?.chunkId).toBe(10);
  });
});

describe("search/hybrid > rrf", () => {
  it("merges by chunkId, sorts by fused score, normalizes max to 1.0", () => {
    const bm25 = [
      {
        chunkId: 10,
        pageUrl: "u",
        pageTitle: "t",
        headingPath: "h",
        snippet: "s",
        bm25Score: -2,
      },
      {
        chunkId: 11,
        pageUrl: "u",
        pageTitle: "t",
        headingPath: "h",
        snippet: "s",
        bm25Score: -1,
      },
    ];
    const vec = [
      { chunkId: 11, pageUrl: "u", pageTitle: "t", headingPath: "h", text: "tt", distance: 0.1 },
      { chunkId: 12, pageUrl: "u", pageTitle: "t", headingPath: "h", text: "tt", distance: 0.5 },
    ];
    const fused = rrf(bm25, vec);
    expect(fused[0]?.chunkId).toBe(11);
    expect(fused[0]?.source).toBe("both");
    expect(fused[0]?.score).toBe(1);
    expect(fused.find((x) => x.chunkId === 12)?.source).toBe("vector");
    expect(fused.find((x) => x.chunkId === 10)?.source).toBe("bm25");
  });
});

describe("search > dispatch", () => {
  it("auto -> bm25 when embeddings unavailable", async () => {
    const h = setup();
    const r = await search({ db: h.db, query: "dynamic", mode: "auto" });
    expect(r.mode).toBe("bm25");
  });

  it("auto -> hybrid when embeddings available + embedQuery provided", async () => {
    if (skipIfNoVec()) return;
    const h = setup();
    ensureVecTable(h.db, 4);
    h.db
      .prepare("INSERT INTO chunks_vec(chunk_id, embedding) VALUES (?, ?)")
      .run(10, Buffer.from(Float32Array.from([1, 0, 0, 0]).buffer));
    const r = await search({
      db: h.db,
      query: "dynamic",
      mode: "auto",
      embeddingsAvailable: true,
      embedQuery: async () => [1, 0, 0, 0],
    });
    expect(r.mode).toBe("hybrid");
  });

  it("vector mode requires embedQuery", async () => {
    const h = setup();
    await expect(search({ db: h.db, query: "x", mode: "vector" })).rejects.toThrow();
  });

  it("siteId filters across modes", async () => {
    const h = setup();
    const r = await search({ db: h.db, query: "deploy", mode: "bm25", siteId: 1 });
    expect(r.hits.find((x) => x.chunkId === 12)).toBeUndefined();
  });
});
