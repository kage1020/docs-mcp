import { openDb } from "../../src/storage/db.ts";

/**
 * Probe once at module load whether sqlite-vec actually works on this
 * host. On some macOS CI runners, `sqliteVec.load()` succeeds silently
 * but `vec0` is never registered. Tests that require vec must call
 * `skipIfNoVec()` and return early so the suite still passes on those
 * hosts (production gracefully degrades to BM25-only).
 */
export const VEC_AVAILABLE = (() => {
  try {
    const h = openDb({ dbPath: ":memory:" });
    const ok = h.vecAvailable;
    h.close();
    return ok;
  } catch {
    return false;
  }
})();

let warned = false;
export function skipIfNoVec(): boolean {
  if (VEC_AVAILABLE) return false;
  if (!warned) {
    process.stderr.write(
      "[test] sqlite-vec not loadable on this host — vec-dependent tests will be skipped\n",
    );
    warned = true;
  }
  return true;
}
