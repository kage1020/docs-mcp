import { tokenCount } from "./tokenize.ts";

export type Chunk = {
  ord: number;
  headingPath: string;
  text: string;
  tokenCount: number;
};

export type ChunkOptions = {
  maxTokens?: number;
  overlapTokens?: number;
  leafLabel?: boolean;
};

const LEAF_LABEL_MAX = 80;

function deriveLeafLabel(text: string, parentPath: string): string | null {
  let sectionHeadingSeen = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("```") || line.startsWith("~~~")) return null;

    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading?.[1]) {
      const text = clip(heading[1]);
      if (!sectionHeadingSeen && (parentPath === text || parentPath.endsWith(`> ${text}`))) {
        sectionHeadingSeen = true;
        continue;
      }
      return text;
    }

    const linkLeading = line.match(/^[-*]?\s*\[`?([^`\]]+?)`?\]\(/);
    if (linkLeading?.[1]) return clip(linkLeading[1]);

    const inlineCode = line.match(/^[-*]?\s*`([^`]+)`/);
    if (inlineCode?.[1]) return clip(inlineCode[1]);

    // Plain prose lines are too noisy to make a useful identifier; give up.
    return null;
  }
  return null;
}

function clip(s: string): string {
  if (s.length <= LEAF_LABEL_MAX) return s;
  return `${s.slice(0, LEAF_LABEL_MAX - 1)}…`;
}

function joinPath(parent: string, leaf: string | null): string {
  if (!leaf) return parent;
  if (parent === "") return leaf;
  if (parent.endsWith(`> ${leaf}`) || parent === leaf) return parent;
  return `${parent} > ${leaf}`;
}

type Section = {
  headingPath: string;
  body: string;
};

const FENCE_RE = /^(```|~~~)/;
const HEADING_RE = /^(#{1,3})\s+(.+)$/;

type FenceState = { inFence: boolean; marker: string };

function updateFence(state: FenceState, line: string): void {
  const m = line.match(FENCE_RE);
  if (!m) return;
  if (!state.inFence) {
    state.inFence = true;
    state.marker = m[1] ?? "";
  } else if (line.startsWith(state.marker)) {
    state.inFence = false;
  }
}

function splitByHeadings(md: string): Section[] {
  const sections: Section[] = [];
  const stack: Array<{ level: number; title: string }> = [];
  let buffer: string[] = [];
  const fence: FenceState = { inFence: false, marker: "" };

  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text === "") return;
    sections.push({
      headingPath: stack.map((s) => s.title).join(" > "),
      body: text,
    });
  };

  for (const line of md.split("\n")) {
    const wasInFence = fence.inFence;
    updateFence(fence, line);
    if (wasInFence || fence.inFence) {
      buffer.push(line);
      continue;
    }

    const h = line.match(HEADING_RE);
    if (h) {
      flush();
      const level = (h[1] ?? "").length;
      const title = (h[2] ?? "").trim();
      while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= level) {
        stack.pop();
      }
      stack.push({ level, title });
      buffer.push(line);
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

function splitOversized(section: Section, maxTokens: number): string[] {
  if (tokenCount(section.body) <= maxTokens) return [section.body];

  const lines = section.body.split("\n");
  const out: string[] = [];
  let buf: string[] = [];
  const fence: FenceState = { inFence: false, marker: "" };

  const push = () => {
    const text = buf.join("\n").trim();
    buf = [];
    if (text !== "") out.push(text);
  };

  for (const line of lines) {
    const wasInFence = fence.inFence;
    updateFence(fence, line);
    if (wasInFence || fence.inFence) {
      buf.push(line);
      continue;
    }
    if (line.trim() === "") {
      const current = buf.join("\n");
      if (tokenCount(current) >= maxTokens) {
        push();
        continue;
      }
    }
    buf.push(line);
  }
  push();
  return out;
}

function tailWithinTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0 || text === "") return "";
  const paras = text.split(/\n\s*\n/);
  const tail: string[] = [];
  let total = 0;
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i] ?? "";
    const tc = tokenCount(p);
    if (total + tc > maxTokens) break;
    tail.unshift(p);
    total += tc;
  }
  return tail.join("\n\n");
}

export function chunk(md: string, opts: ChunkOptions = {}): Chunk[] {
  if (typeof md !== "string" || md.trim() === "") return [];
  const maxTokens = opts.maxTokens ?? 512;
  const overlapTokens = opts.overlapTokens ?? 80;

  const sections = splitByHeadings(md);
  const flat: Array<{ headingPath: string; text: string }> = [];
  for (const sec of sections) {
    for (const part of splitOversized(sec, maxTokens)) {
      flat.push({ headingPath: sec.headingPath, text: part });
    }
  }

  const wantLeaf = opts.leafLabel === true;
  const result: Chunk[] = [];
  let prevText = "";
  let prevPath: string | null = null;
  for (let i = 0; i < flat.length; i++) {
    const entry = flat[i];
    if (!entry) continue;
    let body = entry.text;
    if (overlapTokens > 0 && prevPath === entry.headingPath && prevText !== "") {
      const tail = tailWithinTokens(prevText, overlapTokens);
      if (tail) body = `${tail}\n\n${entry.text}`;
    }
    const headingPath = wantLeaf
      ? joinPath(entry.headingPath, deriveLeafLabel(entry.text, entry.headingPath))
      : entry.headingPath;
    result.push({
      ord: i,
      headingPath,
      text: body,
      tokenCount: tokenCount(body),
    });
    prevText = entry.text;
    prevPath = entry.headingPath;
  }
  return result;
}
