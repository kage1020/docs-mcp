import { describe, expect, it } from "bun:test";
import { extractSnippetParts } from "../../../src/search/snippet.ts";

describe("search/snippet", () => {
  it("AC-31.1: extracts the first non-code paragraph as description", () => {
    const md = `# Heading

Some prose explaining the section.
Multiple sentences are fine.

\`\`\`ts
function noop() {}
\`\`\`

More prose.`;
    const out = extractSnippetParts(md);
    expect(out.description).toContain("Some prose");
    expect(out.description).not.toContain("function noop");
  });

  it("AC-31.2: collects all fenced code blocks with language", () => {
    const md = `Intro paragraph.

\`\`\`ts
const a = 1;
\`\`\`

Between blocks.

\`\`\`bash
echo hi
\`\`\``;
    const out = extractSnippetParts(md);
    expect(out.codeBlocks).toHaveLength(2);
    expect(out.codeBlocks[0]).toEqual({ language: "ts", code: "const a = 1;" });
    expect(out.codeBlocks[1]).toEqual({ language: "bash", code: "echo hi" });
  });

  it("AC-31.3: a code block with no language gets language=null", () => {
    const md = `\`\`\`
plain code
\`\`\``;
    const out = extractSnippetParts(md);
    expect(out.codeBlocks).toHaveLength(1);
    expect(out.codeBlocks[0]).toEqual({ language: null, code: "plain code" });
  });

  it("AC-31.4: chunk that is all code → empty description, code blocks populated", () => {
    const md = `\`\`\`python
print("hi")
\`\`\``;
    const out = extractSnippetParts(md);
    expect(out.description).toBe("");
    expect(out.codeBlocks).toHaveLength(1);
  });

  it("AC-31.5: chunk that is all prose → description set, codeBlocks empty", () => {
    const md = `Just a paragraph of text.\nWith two lines.`;
    const out = extractSnippetParts(md);
    expect(out.description).toContain("Just a paragraph");
    expect(out.codeBlocks).toEqual([]);
  });

  it("AC-31.6: strips leading heading lines from the description", () => {
    const md = `## Some Heading\n\nThe body paragraph.`;
    const out = extractSnippetParts(md);
    expect(out.description.startsWith("##")).toBe(false);
    expect(out.description).toContain("The body paragraph");
  });

  it("AC-31.7: description is capped at ~400 chars", () => {
    const long = "a".repeat(1000);
    const out = extractSnippetParts(long);
    expect(out.description.length).toBeLessThanOrEqual(403); // 400 + "..." tail
  });

  it("AC-31.8: tolerates indented code fences and table rows in description", () => {
    const md = `Description text.

| col | val |
|---|---|
| x | 1 |

    indented snippet (not a fence)`;
    const out = extractSnippetParts(md);
    expect(out.description).toContain("Description text");
    expect(out.codeBlocks).toEqual([]);
  });
});
