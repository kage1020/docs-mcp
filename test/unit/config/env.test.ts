import { describe, expect, it } from "bun:test";
import { parseEnv } from "../../../src/config/env.ts";

describe("config/env", () => {
  it("parses DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT as an integer", () => {
    const env = parseEnv({ DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT: "120000" });
    expect(env.DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT).toBe(120000);
  });

  it("defaults DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT to 60000 when unset", () => {
    const env = parseEnv({});
    expect(env.DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT).toBe(60000);
  });

  it("rejects a non-positive launch timeout", () => {
    expect(() => parseEnv({ DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT: "0" })).toThrow();
    expect(() => parseEnv({ DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT: "-1" })).toThrow();
    expect(() => parseEnv({ DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT: "abc" })).toThrow();
  });

  it("DOCS_MCP_RENDER defaults to 'fetch'", () => {
    const env = parseEnv({});
    expect(env.DOCS_MCP_RENDER).toBe("fetch");
  });
});
