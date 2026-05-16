import { bench, describe } from "vitest";
import { openDb } from "../../src/storage/db.ts";
import { migrate } from "../../src/storage/migrate.ts";

describe("storage/migrate.migrate", () => {
  bench("empty DB -> latest", () => {
    const h = openDb({ dbPath: ":memory:" });
    migrate(h.db);
    h.close();
  });
});
