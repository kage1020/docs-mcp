import { defineConfig } from "vitest/config";

// Vitest is only used for `vitest bench` (perf measurement).
// Unit / integration tests run on Bun's native test runner (`bun test`),
// because the storage layer depends on `bun:sqlite` which is not importable
// from Node.
export default defineConfig({
  test: {
    include: [],
    benchmark: {
      include: ["test/**/*.bench.ts"],
      reporters: ["default"],
      outputJson: "bench-result.json",
    },
  },
});
