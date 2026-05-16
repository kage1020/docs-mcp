import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../../../src/cli/index.ts";

describe("cli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints version on --version", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await run(["bun", "bin/docs-mcp", "--version"]);
    expect(result.exitCode).toBe(0);
    const written = out.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toMatch(/^docs-mcp \d+\.\d+\.\d+\n$/);
  });

  it("prints version on -v", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await run(["bun", "bin/docs-mcp", "-v"]);
    const written = out.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toMatch(/^docs-mcp /);
  });

  it("prints help on --help", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await run(["bun", "bin/docs-mcp", "--help"]);
    expect(result.exitCode).toBe(0);
    const written = out.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("USAGE");
    expect(written).toContain("SUBCOMMANDS");
  });

  it("prints help on no args", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const result = await run(["bun", "bin/docs-mcp"]);
    expect(result.exitCode).toBe(0);
    const written = out.mock.calls.map((c) => String(c[0])).join("");
    expect(written).toContain("USAGE");
  });

  it("returns exit code 2 for unknown subcommand", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = await run(["bun", "bin/docs-mcp", "unknown-cmd"]);
    expect(result.exitCode).toBe(2);
  });
});
