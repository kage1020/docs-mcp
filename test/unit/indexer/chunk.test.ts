import { describe, expect, it } from "bun:test";
import { chunk } from "../../../src/indexer/chunk.ts";

describe("indexer/chunk", () => {
  it("returns [] for empty / whitespace markdown", () => {
    expect(chunk("")).toEqual([]);
    expect(chunk("   \n\n  ")).toEqual([]);
  });

  it("splits on h1/h2/h3/h4 boundaries and builds heading_path with >", () => {
    const md = [
      "# A",
      "",
      "alpha",
      "",
      "## B",
      "",
      "beta",
      "",
      "### C",
      "",
      "gamma",
      "",
      "#### D",
      "",
      "delta",
    ].join("\n");
    const chunks = chunk(md);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(chunks[0]?.headingPath).toBe("A");
    expect(chunks[1]?.headingPath).toBe("A > B");
    expect(chunks[2]?.headingPath).toBe("A > B > C");
    expect(chunks[3]?.headingPath).toBe("A > B > C > D");
  });

  it("AC-35.1: keeps h5/h6 inside the current chunk (h4 is the deepest split)", () => {
    const md = [
      "# A",
      "",
      "alpha",
      "",
      "##### sub",
      "",
      "beta",
      "",
      "###### subsub",
      "",
      "gamma",
    ].join("\n");
    const chunks = chunk(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.headingPath).toBe("A");
    expect(chunks[0]?.text).toContain("##### sub");
    expect(chunks[0]?.text).toContain("###### subsub");
  });

  it("does not split inside a fenced code block", () => {
    const fence = ["```ts", "long code", "with multiple", "lines that would exceed maxTokens"].join(
      "\n",
    );
    const md = ["# A", "", "intro", "", fence, "```", "", "outro"].join("\n");
    const chunks = chunk(md, { maxTokens: 5 });
    const joined = chunks.map((c) => c.text).join("\n---\n");
    expect(joined).toContain("```ts");
    expect(joined).toContain("with multiple");
    // every chunk that opens a fence must close it
    for (const c of chunks) {
      const opens = (c.text.match(/^```/gm) ?? []).length;
      expect(opens % 2).toBe(0);
    }
  });

  it("splits oversize sections on paragraph boundaries", () => {
    const para = "word ".repeat(120).trim();
    const md = ["# A", "", para, "", para, "", para, "", para].join("\n");
    const chunks = chunk(md, { maxTokens: 80, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.headingPath).toBe("A");
  });

  it("adds overlap from the previous chunk for adjacent same-path chunks", () => {
    const md = ["# A", "", "intro paragraph here", "", "second paragraph more", "", "third"].join(
      "\n",
    );
    const chunks = chunk(md, { maxTokens: 10, overlapTokens: 30 });
    expect(chunks.length).toBeGreaterThan(1);
    const second = chunks[1];
    expect(second).toBeDefined();
    expect(second?.text).toMatch(/intro|second/);
  });

  it("does not add overlap across different heading_paths", () => {
    const md = ["# A", "", "alpha", "", "## B", "", "beta"].join("\n");
    const chunks = chunk(md, { overlapTokens: 30 });
    const b = chunks.find((c) => c.headingPath === "A > B");
    expect(b).toBeDefined();
    expect(b?.text.includes("alpha")).toBe(false);
  });

  it("assigns sequential ord starting at 0 and non-zero tokenCount", () => {
    const md = ["# A", "", "x", "", "## B", "", "y"].join("\n");
    const chunks = chunk(md);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.ord).toBe(i);
      expect(chunks[i]?.tokenCount).toBeGreaterThan(0);
    }
  });
});
