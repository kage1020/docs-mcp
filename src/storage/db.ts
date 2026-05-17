import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";

export type OpenDbOptions = {
  dbPath: string;
  customSqlitePath?: string;
  enableVec?: boolean;
};

export type DbHandle = {
  db: Database;
  vecAvailable: boolean;
  close(): void;
};

let customSqliteApplied: string | null = null;

function tryApplyCustomSqlite(path: string): void {
  if (customSqliteApplied === path) return;
  try {
    Database.setCustomSQLite(path);
    customSqliteApplied = path;
  } catch {
    // Path is invalid or process already opened a Database with the
    // default sqlite. Fall back silently to the bundled sqlite — a missing
    // extension-capable sqlite must not crash the whole server; embedding
    // features simply stay disabled.
  }
}

export function openDb(opts: OpenDbOptions): DbHandle {
  if (opts.customSqlitePath) tryApplyCustomSqlite(opts.customSqlitePath);

  const db = new Database(opts.dbPath, { create: true });
  db.run("PRAGMA foreign_keys = ON");
  if (opts.dbPath !== ":memory:") {
    db.run("PRAGMA journal_mode = WAL");
  }

  let vecAvailable = false;
  if (opts.enableVec !== false) {
    try {
      sqliteVec.load(db);
      // sqliteVec.load() returns silently on some hosts (notably macOS
      // CI runners with Bun's bundled sqlite) even when the extension
      // didn't actually register. `vec_version()` may pass while the
      // vec0 *virtual table* module is still missing. The only reliable
      // canary is to actually create + drop a vec0 table.
      db.run(
        "CREATE VIRTUAL TABLE _vec_canary USING vec0(id INTEGER PRIMARY KEY, embedding FLOAT[4])",
      );
      db.run("DROP TABLE _vec_canary");
      vecAvailable = true;
    } catch {
      vecAvailable = false;
    }
  }

  return {
    db,
    vecAvailable,
    close() {
      db.close();
    },
  };
}

export function ensureVecTable(db: Database, dim: number): boolean {
  if (!Number.isInteger(dim) || dim < 1) {
    throw new Error(`ensureVecTable: dim must be a positive integer (got ${dim})`);
  }
  const row = db
    .query<{ value: string }, []>("SELECT value FROM embeddings_meta WHERE key = 'dim'")
    .get();
  const tableExists = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_vec'",
    )
    .get();
  if (row?.value === String(dim) && tableExists) return false;

  const tx = db.transaction(() => {
    db.run("DROP TABLE IF EXISTS chunks_vec");
    db.run(
      `CREATE VIRTUAL TABLE chunks_vec USING vec0(chunk_id INTEGER PRIMARY KEY, embedding FLOAT[${dim}])`,
    );
    db.prepare(
      "INSERT INTO embeddings_meta(key, value) VALUES ('dim', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(String(dim));
  });
  tx();
  return true;
}
