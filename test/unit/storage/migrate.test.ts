import { afterEach, describe, expect, it } from "bun:test";
import { type DbHandle, openDb } from "../../../src/storage/db.ts";
import { migrate } from "../../../src/storage/migrate.ts";
import { LATEST_VERSION } from "../../../src/storage/migrations/index.ts";

describe("storage/migrate", () => {
  const handles: DbHandle[] = [];

  afterEach(() => {
    for (const h of handles.splice(0)) h.close();
  });

  function fresh(): DbHandle {
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    return h;
  }

  function userVersion(h: DbHandle): number {
    return h.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
  }

  it("applies all migrations on a fresh DB and bumps user_version", () => {
    const h = fresh();
    expect(userVersion(h)).toBe(0);
    const r = migrate(h.db);
    expect(r.fromVersion).toBe(0);
    expect(r.toVersion).toBe(LATEST_VERSION);
    expect(r.applied).toBe(LATEST_VERSION);
    expect(userVersion(h)).toBe(LATEST_VERSION);
  });

  it("creates the expected schema objects", () => {
    const h = fresh();
    migrate(h.db);
    const tables = h.db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
      )
      .all()
      .map((r) => r.name);
    for (const expected of ["sites", "pages", "chunks", "embeddings_meta", "chunks_fts"]) {
      expect(tables).toContain(expected);
    }
  });

  it("is idempotent on an already-migrated DB", () => {
    const h = fresh();
    migrate(h.db);
    const r = migrate(h.db);
    expect(r.applied).toBe(0);
    expect(r.fromVersion).toBe(LATEST_VERSION);
    expect(r.toVersion).toBe(LATEST_VERSION);
  });

  it("enforces sites.base_url UNIQUE", () => {
    const h = fresh();
    migrate(h.db);
    const ins = h.db.prepare(
      "INSERT INTO sites(base_url, name, crawl_options_json, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?)",
    );
    ins.run("https://x/", "x", "{}", 1, 1);
    expect(() => ins.run("https://x/", "x2", "{}", 2, 2)).toThrow();
  });

  it("cascades deletes from sites → pages → chunks", () => {
    const h = fresh();
    migrate(h.db);
    h.db
      .prepare(
        "INSERT INTO sites(id, base_url, name, crawl_options_json, created_at, updated_at) " +
          "VALUES (1, 'https://x/', 'x', '{}', 0, 0)",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO pages(id, site_id, url, content_hash, markdown, markdown_size, fetched_at) " +
          "VALUES (1, 1, 'https://x/a', 'h', 'm', 1, 0)",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO chunks(id, page_id, ord, heading_path, text, token_count) " +
          "VALUES (1, 1, 0, 'A', 't', 1)",
      )
      .run();

    h.db.prepare("DELETE FROM sites WHERE id = 1").run();

    const pages = h.db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM pages").get();
    const chunks = h.db.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM chunks").get();
    expect(pages?.c).toBe(0);
    expect(chunks?.c).toBe(0);
  });

  it("keeps chunks_fts in sync with chunks via triggers (INSERT, UPDATE, DELETE)", () => {
    const h = fresh();
    migrate(h.db);
    h.db
      .prepare(
        "INSERT INTO sites(id, base_url, name, crawl_options_json, created_at, updated_at) " +
          "VALUES (1, 'https://x/', 'x', '{}', 0, 0)",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO pages(id, site_id, url, content_hash, markdown, markdown_size, fetched_at) " +
          "VALUES (1, 1, 'https://x/a', 'h', 'm', 1, 0)",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO chunks(id, page_id, ord, heading_path, text, token_count) " +
          "VALUES (10, 1, 0, 'Guide > Routing', 'dynamic routes in nextjs', 5)",
      )
      .run();

    const hits = h.db
      .query<{ rowid: number }, []>(
        "SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'dynamic routes'",
      )
      .all();
    expect(hits.map((r) => r.rowid)).toContain(10);

    h.db.prepare("UPDATE chunks SET text = 'static routes only' WHERE id = 10").run();
    const stale = h.db
      .query<{ rowid: number }, []>("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'dynamic'")
      .all();
    expect(stale).toHaveLength(0);
    const fresh2 = h.db
      .query<{ rowid: number }, []>("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'static'")
      .all();
    expect(fresh2.map((r) => r.rowid)).toContain(10);

    h.db.prepare("DELETE FROM chunks WHERE id = 10").run();
    const afterDelete = h.db
      .query<{ rowid: number }, []>("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'static'")
      .all();
    expect(afterDelete).toHaveLength(0);
  });
});
