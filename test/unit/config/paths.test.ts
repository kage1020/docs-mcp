import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveCacheDir, resolveDataDir, resolveDbPath } from "../../../src/config/paths.ts";

describe("config/paths", () => {
  describe("resolveDataDir", () => {
    it("honors DOCS_MCP_DATA_DIR override on every platform", () => {
      expect(resolveDataDir({ DOCS_MCP_DATA_DIR: "/custom/path" }, "linux")).toBe("/custom/path");
      expect(resolveDataDir({ DOCS_MCP_DATA_DIR: "/x" }, "darwin")).toBe("/x");
      expect(resolveDataDir({ DOCS_MCP_DATA_DIR: "/x" }, "win32")).toBe("/x");
    });

    it("uses XDG_DATA_HOME on Linux", () => {
      expect(resolveDataDir({ XDG_DATA_HOME: "/xdg/data" }, "linux")).toBe(
        join("/xdg/data", "docs-mcp"),
      );
    });

    it("falls back to ~/.local/share on Linux without XDG_DATA_HOME", () => {
      expect(resolveDataDir({}, "linux")).toBe(join(homedir(), ".local", "share", "docs-mcp"));
    });

    it("uses ~/Library/Application Support on macOS", () => {
      expect(resolveDataDir({}, "darwin")).toBe(
        join(homedir(), "Library", "Application Support", "docs-mcp"),
      );
    });

    it("uses LOCALAPPDATA on Windows", () => {
      expect(resolveDataDir({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "win32")).toBe(
        join("C:\\Users\\u\\AppData\\Local", "docs-mcp"),
      );
    });
  });

  describe("resolveCacheDir", () => {
    it("uses XDG_CACHE_HOME on Linux", () => {
      expect(resolveCacheDir({ XDG_CACHE_HOME: "/xdg/cache" }, "linux")).toBe(
        join("/xdg/cache", "docs-mcp"),
      );
    });

    it("uses ~/Library/Caches on macOS", () => {
      expect(resolveCacheDir({}, "darwin")).toBe(join(homedir(), "Library", "Caches", "docs-mcp"));
    });

    it("uses LOCALAPPDATA\\docs-mcp\\cache on Windows", () => {
      expect(resolveCacheDir({ LOCALAPPDATA: "C:\\appdata\\local" }, "win32")).toBe(
        join("C:\\appdata\\local", "docs-mcp", "cache"),
      );
    });
  });

  describe("resolveDbPath", () => {
    it("joins data dir + docs.sqlite", () => {
      expect(resolveDbPath({ DOCS_MCP_DATA_DIR: "/d" }, "linux")).toBe(join("/d", "docs.sqlite"));
    });
  });
});
