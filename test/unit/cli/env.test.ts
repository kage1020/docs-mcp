import { describe, expect, it } from "bun:test";
import { parseEnv } from "../../../src/config/env.ts";

describe("config/env", () => {
  it("DOCS_MCP_RENDER defaults to fetch", () => {
    const e = parseEnv({});
    expect(e.DOCS_MCP_RENDER).toBe("fetch");
  });

  it("DOCS_MCP_RENDER accepts playwright", () => {
    const e = parseEnv({ DOCS_MCP_RENDER: "playwright" });
    expect(e.DOCS_MCP_RENDER).toBe("playwright");
  });

  it("rejects unknown render modes", () => {
    expect(() => parseEnv({ DOCS_MCP_RENDER: "puppeteer" })).toThrow();
  });
});
