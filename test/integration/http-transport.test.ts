import { describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveHttp } from "../../src/cli/serve-http.ts";

describe("integration/http-transport", () => {
  it("listens on a random port and rejects GET /mcp with 405", async () => {
    const tmpDir = join(
      tmpdir(),
      `docs-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    process.env.DOCS_MCP_DATA_DIR = tmpDir;
    process.env.LOG_LEVEL = "silent";
    const handle = await serveHttp({ port: 0 });
    try {
      expect(handle.port).toBeGreaterThan(0);
      const res = await fetch(`http://127.0.0.1:${handle.port}/mcp`, { method: "GET" });
      expect(res.status).toBe(405);
    } finally {
      await handle.stop();
      delete process.env.DOCS_MCP_DATA_DIR;
      delete process.env.LOG_LEVEL;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
