export type CodeBlock = {
  language: string | null;
  code: string;
};

export type SnippetParts = {
  description: string;
  codeBlocks: CodeBlock[];
};

const DESCRIPTION_MAX = 400;
const FENCE_RE = /^```([^\n]*)\n([\s\S]*?)\n?```$/gm;
const HEADING_RE = /^#{1,6}\s+.*$/;

export function extractSnippetParts(markdown: string): SnippetParts {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    return { description: "", codeBlocks: [] };
  }

  const codeBlocks: CodeBlock[] = [];
  // Collect code blocks first, replacing each with a sentinel so the
  // remaining text can be scanned for prose without false positives.
  const withoutCode = markdown.replace(FENCE_RE, (_m, lang: string, body: string) => {
    const language = lang.trim() || null;
    codeBlocks.push({ language, code: body.trim() });
    return "CODE";
  });

  // First non-empty, non-heading, non-sentinel paragraph.
  const paragraphs = withoutCode
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== "CODE");

  let description = "";
  for (const p of paragraphs) {
    const lines = p
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !HEADING_RE.test(line));
    if (lines.length === 0) continue;
    description = lines.join(" ").replace(/\s+/g, " ").trim();
    if (description) break;
  }

  if (description.length > DESCRIPTION_MAX) {
    description = `${description.slice(0, DESCRIPTION_MAX)}...`;
  }

  return { description, codeBlocks };
}
