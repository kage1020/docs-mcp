import type { Database } from "bun:sqlite";
import { LATEST_VERSION, MIGRATIONS } from "./migrations/index.ts";

export type MigrationResult = {
  fromVersion: number;
  toVersion: number;
  applied: number;
};

function currentVersion(db: Database): number {
  const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
  return row?.user_version ?? 0;
}

export function migrate(db: Database): MigrationResult {
  const from = currentVersion(db);
  if (from >= LATEST_VERSION) {
    return { fromVersion: from, toVersion: from, applied: 0 };
  }

  let applied = 0;
  for (let i = from; i < LATEST_VERSION; i++) {
    const statements = MIGRATIONS[i];
    if (statements === undefined) {
      throw new Error(`Missing migration at index ${i}`);
    }
    const targetVersion = i + 1;
    const tx = db.transaction(() => {
      for (const stmt of statements) db.run(stmt);
      db.run(`PRAGMA user_version = ${targetVersion}`);
    });
    tx();
    applied += 1;
  }

  return { fromVersion: from, toVersion: LATEST_VERSION, applied };
}
