export type CodeBlock = {
  language: string | null;
  code: string;
};

export type Table = {
  headers: string[];
  rows: string[][];
};

export type SnippetParts = {
  description: string;
  codeBlocks: CodeBlock[];
  tables: Table[];
};

const DESCRIPTION_MAX = 400;
const FENCE_RE = /^```([^\n]*)\n([\s\S]*?)\n?```$/gm;
const HEADING_RE = /^#{1,6}\s+.*$/;
const TABLE_ROW_RE = /^\|.*\|\s*$/;
const TABLE_SEPARATOR_RE = /^\|(?:\s*:?-+:?\s*\|)+\s*$/;

function splitCells(row: string): string[] {
  return row
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

function extractTableFromBlock(block: string): Table | null {
  const lines = block.split("\n").map((l) => l.trim());
  if (lines.length < 3) return null;
  const [headerLine, separatorLine, ...bodyLines] = lines;
  if (!headerLine || !separatorLine) return null;
  if (!TABLE_ROW_RE.test(headerLine) || !TABLE_SEPARATOR_RE.test(separatorLine)) return null;
  const headers = splitCells(headerLine);
  const rows: string[][] = [];
  for (const line of bodyLines) {
    if (!TABLE_ROW_RE.test(line)) continue;
    rows.push(splitCells(line));
  }
  return { headers, rows };
}

function clipDescription(s: string): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > DESCRIPTION_MAX ? `${trimmed.slice(0, DESCRIPTION_MAX)}...` : trimmed;
}

export function extractSnippetParts(markdown: string): SnippetParts {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    return { description: "", codeBlocks: [], tables: [] };
  }

  // Fast path: plain prose with no code fences, no table pipes, and no
  // leading-line heading markers. Covers the vast majority of chunks
  // including the synthetic placeholders used in benches. Saves the
  // regex+split work in the full extraction path.
  if (
    !markdown.includes("```") &&
    !markdown.includes("|") &&
    markdown[0] !== "#" &&
    !markdown.includes("\n#")
  ) {
    return { description: clipDescription(markdown), codeBlocks: [], tables: [] };
  }

  const codeBlocks: CodeBlock[] = [];
  const withoutCode = markdown.replace(FENCE_RE, (_m, lang: string, body: string) => {
    const language = lang.trim() || null;
    codeBlocks.push({ language, code: body.trim() });
    return "CODE";
  });

  const tables: Table[] = [];
  const paragraphs = withoutCode
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const nonTableParagraphs: string[] = [];
  for (const p of paragraphs) {
    if (p === "CODE") continue;
    const table = extractTableFromBlock(p);
    if (table) tables.push(table);
    else nonTableParagraphs.push(p);
  }

  let description = "";
  for (const p of nonTableParagraphs) {
    const lines = p
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !HEADING_RE.test(line));
    if (lines.length === 0) continue;
    description = lines.join(" ").replace(/\s+/g, " ").trim();
    if (description) break;
  }

  description = clipDescription(description);

  return { description, codeBlocks, tables };
}
