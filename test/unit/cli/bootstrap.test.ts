import { afterEach, describe, expect, it } from "bun:test";
import { bootstrapContext } from "../../../src/cli/bootstrap.ts";

describe("cli/bootstrap", () => {
  const handles: Array<{ shutdown: () => void }> = [];

  afterEach(() => {
    for (const h of handles.splice(0)) h.shutdown();
  });

  it("returns embeddingsAvailable=false when no embedding base url is configured", async () => {
    const r = await bootstrapContext(
      { LOG_LEVEL: "silent", DOCS_MCP_EMBEDDING_MODEL: "x" },
      { dbPath: ":memory:" },
    );
    handles.push(r);
    expect(r.ctx.embeddingsAvailable).toBe(false);
    expect(r.ctx.db).toBeDefined();
  });

  it("returns embeddingsAvailable=false when the endpoint is unreachable", async () => {
    const r = await bootstrapContext(
      {
        LOG_LEVEL: "silent",
        DOCS_MCP_EMBEDDING_BASE_URL: "http://127.0.0.1:1/v1",
        DOCS_MCP_EMBEDDING_MODEL: "x",
      },
      { dbPath: ":memory:" },
    );
    handles.push(r);
    expect(r.ctx.embeddingsAvailable).toBe(false);
  });
});
