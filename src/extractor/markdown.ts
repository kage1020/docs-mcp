import TurndownService from "turndown";
import * as turndownPluginGfm from "turndown-plugin-gfm";

function recoverCodeLanguage(node: HTMLElement): string {
  const code = node.firstChild as HTMLElement | null;
  if (!code || code.nodeName !== "CODE") return "";
  const cls = code.getAttribute("class") ?? "";
  const m = cls.match(/(?:^|\s)language-([A-Za-z0-9_+-]+)(?:\s|$)/);
  return m?.[1] ?? "";
}

function createService(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    fence: "```",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  type GfmPlugin = (s: TurndownService) => void;
  type GfmModule = { gfm: GfmPlugin };
  const gfm = (turndownPluginGfm as unknown as GfmModule).gfm;
  service.use(gfm);

  service.addRule("fenced-code-with-language", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      !!node.firstChild &&
      (node.firstChild as ChildNode).nodeName === "CODE",
    replacement: (_content, node) => {
      const el = node as unknown as HTMLElement;
      const lang = recoverCodeLanguage(el);
      const codeEl = el.firstChild as HTMLElement;
      const text = (codeEl.textContent ?? "").replace(/\n$/, "");
      return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
    },
  });

  return service;
}

let cached: TurndownService | null = null;

export function htmlToMarkdown(html: string): string {
  if (typeof html !== "string" || html === "") return "";
  if (!cached) cached = createService();
  try {
    return cached.turndown(html).trim();
  } catch {
    return "";
  }
}
