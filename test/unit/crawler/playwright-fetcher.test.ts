import { describe, expect, it } from "bun:test";

// Reading the module is the contract: it should expose a factory function
// that returns a Fetcher-compatible handle. The factory launches chromium
// directly and speaks CDP over WebSocket, so it works under both Bun and
// Node on Windows (no node subprocess required).
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
