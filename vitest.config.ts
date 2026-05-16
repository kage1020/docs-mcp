import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["test/**/*.test.ts"],
    benchmark: {
      include: ["test/**/*.bench.ts"],
      reporters: ["default"],
      outputJson: "bench-result.json",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli/**", "src/**/*.bench.ts", "src/**/types.ts"],
    },
  },
});
