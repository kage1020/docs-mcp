import { bench, describe } from "vitest";
import { searchBm25 } from "../../src/search/bm25.ts";
import { openDb } from "../../src/storage/db.ts";
import { migrate } from "../../src/storage/migrate.ts";

function seed(n: number) {
  const h = openDb({ dbPath: ":memory:" });
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
  const ins = h.db.prepare(
    "INSERT INTO chunks(page_id, ord, heading_path, text, token_count) VALUES (1, ?, ?, ?, 10)",
  );
  const words = [
    "routing",
    "rendering",
    "deployment",
    "static",
    "dynamic",
    "server",
    "client",
    "cache",
    "fetch",
    "stream",
  ];
  for (let i = 0; i < n; i++) {
    const text = `${words[i % words.length]} ${words[(i + 3) % words.length]} ${words[(i + 7) % words.length]} document chunk ${i}`;
    ins.run(i, `H${i}`, text);
  }
  return h;
}

const handle10k = seed(10_000);

describe("search/bm25.searchBm25 (10k chunks)", () => {
  bench("single-term query", () => {
    searchBm25(handle10k.db, "routing", { topK: 10 });
  });
  bench("two-term query", () => {
    searchBm25(handle10k.db, "dynamic deployment", { topK: 10 });
  });
});
