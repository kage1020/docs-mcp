import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { run } from "../../../src/cli/index.ts";

describe("cli", () => {
  const spies: Array<{ mockRestore: () => void }> = [];

  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore();
  });

  function spyStdout() {
    const s = spyOn(process.stdout, "write").mockImplementation(() => true);
    spies.push(s);
    return s;
  }

  function spyStderr() {
    const s = spyOn(process.stderr, "write").mockImplementation(() => true);
    spies.push(s);
    return s;
  }

  function capture(s: ReturnType<typeof spyStdout>): string {
    return s.mock.calls.map((c) => String(c[0])).join("");
  }

  it("prints version on --version", async () => {
    const out = spyStdout();
    const result = await run(["bun", "bin/docs-mcp", "--version"]);
    expect(result.exitCode).toBe(0);
    expect(capture(out)).toMatch(/^docs-mcp \d+\.\d+\.\d+\n$/);
  });

  it("prints version on -v", async () => {
    const out = spyStdout();
    await run(["bun", "bin/docs-mcp", "-v"]);
    expect(capture(out)).toMatch(/^docs-mcp /);
  });

  it("prints help on --help", async () => {
    const out = spyStdout();
    const result = await run(["bun", "bin/docs-mcp", "--help"]);
    expect(result.exitCode).toBe(0);
    const written = capture(out);
    expect(written).toContain("USAGE");
    expect(written).toContain("SUBCOMMANDS");
  });

  it("prints help on no args", async () => {
    const out = spyStdout();
    const result = await run(["bun", "bin/docs-mcp"]);
    expect(result.exitCode).toBe(0);
    expect(capture(out)).toContain("USAGE");
  });

  it("returns exit code 2 for unknown subcommand", async () => {
    spyStderr();
    const result = await run(["bun", "bin/docs-mcp", "unknown-cmd"]);
    expect(result.exitCode).toBe(2);
  });
});
