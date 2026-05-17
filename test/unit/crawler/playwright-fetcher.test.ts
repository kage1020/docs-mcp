import { describe, expect, it } from "bun:test";

// Reading the module is the contract: it should expose a factory function
// that returns a Fetcher-compatible handle. Actually launching chromium
// requires a Node runtime (Bun on Windows currently can't speak playwright's
// stdio pipe — verified manually; tracked in README).
describe("crawler/playwright-fetcher", () => {
  it("exports createPlaywrightFetcher", async () => {
    const mod = await import("../../../src/crawler/playwright-fetcher.ts");
    expect(typeof mod.createPlaywrightFetcher).toBe("function");
  });

  it("the factory has the documented option shape", async () => {
    const mod = await import("../../../src/crawler/playwright-fetcher.ts");
    // The function should accept zero args (all options optional).
    expect(mod.createPlaywrightFetcher.length).toBe(0);
  });
});
