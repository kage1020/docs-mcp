import { afterEach, describe, expect, it } from "bun:test";
import { type DbHandle, ensureVecTable, openDb } from "../../../src/storage/db.ts";
import { migrate } from "../../../src/storage/migrate.ts";

describe("storage/db", () => {
  const handles: DbHandle[] = [];

  afterEach(() => {
    for (const h of handles.splice(0)) h.close();
  });

  function fresh(): DbHandle {
    const h = openDb({ dbPath: ":memory:" });
    handles.push(h);
    return h;
  }

  it("opens an in-memory db and reports vecAvailable when sqlite-vec loads", () => {
    const h = fresh();
    expect(h.db).toBeDefined();
    expect(h.vecAvailable).toBe(true);
  });

  it("openDb tolerates an invalid customSqlitePath and continues with bundled sqlite", () => {
    const h = openDb({ dbPath: ":memory:", customSqlitePath: "/definitely/not/a/real/lib" });
    handles.push(h);
    expect(h.db).toBeDefined();
  });

  it("enforces PRAGMA foreign_keys = ON", () => {
    const h = fresh();
    const row = h.db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get();
    expect(row?.foreign_keys).toBe(1);
  });

  it("ensureVecTable creates chunks_vec with the requested dimension", () => {
    const h = fresh();
    migrate(h.db);
    expect(ensureVecTable(h.db, 8)).toBe(true);
    const t = h.db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_vec'",
      )
      .get();
    expect(t?.name).toBe("chunks_vec");
    const meta = h.db
      .query<{ value: string }, []>("SELECT value FROM embeddings_meta WHERE key = 'dim'")
      .get();
    expect(meta?.value).toBe("8");
  });

  it("ensureVecTable is a no-op when called twice with the same dim", () => {
    const h = fresh();
    migrate(h.db);
    expect(ensureVecTable(h.db, 16)).toBe(true);
    expect(ensureVecTable(h.db, 16)).toBe(false);
  });

  it("ensureVecTable rebuilds the table when dim changes", () => {
    const h = fresh();
    migrate(h.db);
    ensureVecTable(h.db, 8);
    expect(ensureVecTable(h.db, 32)).toBe(true);
    const meta = h.db
      .query<{ value: string }, []>("SELECT value FROM embeddings_meta WHERE key = 'dim'")
      .get();
    expect(meta?.value).toBe("32");
  });

  it("ensureVecTable rejects non-positive dimensions", () => {
    const h = fresh();
    migrate(h.db);
    expect(() => ensureVecTable(h.db, 0)).toThrow(/positive integer/);
    expect(() => ensureVecTable(h.db, -1)).toThrow(/positive integer/);
    expect(() => ensureVecTable(h.db, 1.5)).toThrow(/positive integer/);
  });
});
