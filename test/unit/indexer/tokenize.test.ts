import { describe, expect, it } from "bun:test";
import { tokenCount } from "../../../src/indexer/tokenize.ts";

describe("indexer/tokenize", () => {
  it("returns 0 for empty input", () => {
    expect(tokenCount("")).toBe(0);
  });

  it("returns at least 1 for non-empty input", () => {
    expect(tokenCount("hello world")).toBeGreaterThanOrEqual(1);
  });

  it("approximates ASCII as bytes / 4", () => {
    const ascii = "a".repeat(100);
    expect(tokenCount(ascii)).toBe(Math.ceil(100 / 4));
  });

  it("CJK rescue: 100 Japanese chars yields >= 100 tokens", () => {
    const cjk = "あ".repeat(100);
    expect(tokenCount(cjk)).toBeGreaterThanOrEqual(100);
  });

  it("emoji do not under-count via the byte path", () => {
    expect(tokenCount("🐶".repeat(50))).toBeGreaterThan(20);
  });
});
