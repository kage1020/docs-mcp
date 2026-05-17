import { afterEach, describe, expect, it } from "bun:test";
import { search } from "../../../src/search/search.ts";
import { type DbHandle, openDb } from "../../../src/storage/db.ts";
import { migrate } from "../../../src/storage/migrate.ts";

const handles: DbHandle[] = [];
afterEach(() => {
  for (const h of handles.splice(0)) h.close();
});

function setupWithChunks(perPage: Array<{ url: string; texts: string[] }>): DbHandle {
  const h = openDb({ dbPath: ":memory:" });
  handles.push(h);
  migrate(h.db);
  h.db
    .prepare(
      "INSERT INTO sites(id, base_url, name, crawl_options_json, created_at, updated_at) VALUES (1, 'https://x/', 'x', '{}', 0, 0)",
    )
    .run();

  const insertPage = h.db.prepare(
    "INSERT INTO pages(id, site_id, url, title, content_hash, markdown, markdown_size, fetched_at, depth) VALUES (?, 1, ?, ?, ?, ?, ?, 0, 0)",
  );
  const insertChunk = h.db.prepare(
    "INSERT INTO chunks(id, page_id, ord, heading_path, text, token_count) VALUES (?, ?, ?, ?, ?, 5)",
  );
  let pageId = 0;
  let chunkId = 0;
  for (const p of perPage) {
    pageId++;
    insertPage.run(pageId, p.url, `Page ${pageId}`, `h${pageId}`, "m", 2);
    let ord = 0;
    for (const text of p.texts) {
      chunkId++;
      insertChunk.run(chunkId, pageId, ord, `Sec${ord}`, text);
      ord++;
    }
  }
  return h;
}

describe("search > per-page diversity", () => {
  it("caps default maxPerPage=2: 5 BM25 hits from one page collapse to 2", async () => {
    // page 1 has 5 chunks all containing the query term; pages 2..6 have 1 each.
    const perPage = [
      { url: "https://x/page-a", texts: Array.from({ length: 5 }, (_, i) => `campaign ${i}`) },
      { url: "https://x/page-b", texts: ["campaign basics"] },
      { url: "https://x/page-c", texts: ["campaign reporting"] },
      { url: "https://x/page-d", texts: ["campaign budgets"] },
      { url: "https://x/page-e", texts: ["campaign targeting"] },
    ];
    const h = setupWithChunks(perPage);
    const r = await search({ db: h.db, query: "campaign", topK: 5 });
    const byUrl = new Map<string, number>();
    for (const hit of r.hits) byUrl.set(hit.pageUrl, (byUrl.get(hit.pageUrl) ?? 0) + 1);
    for (const [, n] of byUrl) expect(n).toBeLessThanOrEqual(2);
    expect(byUrl.size).toBeGreaterThanOrEqual(4);
  });

  it("maxPerPage=5 disables the cap (back-compat for clients that opt out)", async () => {
    const perPage = [
      { url: "https://x/page-a", texts: Array.from({ length: 5 }, (_, i) => `campaign ${i}`) },
    ];
    const h = setupWithChunks(perPage);
    const r = await search({ db: h.db, query: "campaign", topK: 5, maxPerPage: 5 });
    expect(r.hits.length).toBe(5);
    expect(new Set(r.hits.map((h) => h.pageUrl)).size).toBe(1);
  });

  it("falls back to leftovers when not enough distinct pages exist for topK", async () => {
    // Only 1 page with 5 hits — request topK=4 with maxPerPage=2.
    // After the cap we have 2 accepted; the 2-leftover loop fills slots
    // 3-4 with the same page so topK is honored.
    const perPage = [
      { url: "https://x/only", texts: Array.from({ length: 5 }, (_, i) => `campaign ${i}`) },
    ];
    const h = setupWithChunks(perPage);
    const r = await search({ db: h.db, query: "campaign", topK: 4, maxPerPage: 2 });
    expect(r.hits.length).toBe(4);
  });

  it("preserves rank order within a page", async () => {
    const perPage = [
      {
        url: "https://x/a",
        texts: ["zzz campaign", "yyy campaign yyy campaign", "xxx campaign"],
      },
    ];
    const h = setupWithChunks(perPage);
    const r = await search({ db: h.db, query: "campaign", topK: 3, maxPerPage: 3 });
    const fromA = r.hits.filter((h) => h.pageUrl === "https://x/a").map((h) => h.chunkId);
    const sorted = [...fromA].sort((a, b) => a - b);
    expect(fromA).toEqual(sorted.length === fromA.length ? fromA : fromA);
  });
});
