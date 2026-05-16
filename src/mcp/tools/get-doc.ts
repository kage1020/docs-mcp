import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUrl } from "../../crawler/fetcher.ts";
import { normalize } from "../../crawler/url.ts";
import { extract } from "../../extractor/extract.ts";
import { htmlToMarkdown } from "../../extractor/markdown.ts";
import type { ServerContext } from "../context.ts";
import { GetDocShape } from "../schemas.ts";

type CacheEntry = { markdown: string; title: string | null; fetchedAt: number };
const memoryCache = new Map<string, CacheEntry>();
const MEMORY_CACHE_TTL = 30 * 60 * 1000;
const MEMORY_CACHE_MAX = 50;

function cleanCache(): void {
  const now = Date.now();
  for (const [k, v] of memoryCache) {
    if (now - v.fetchedAt > MEMORY_CACHE_TTL) memoryCache.delete(k);
  }
  while (memoryCache.size > MEMORY_CACHE_MAX) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
    else break;
  }
}

export function registerGetDoc(server: McpServer, ctx: ServerContext): void {
  const fetcher = ctx.fetcher ?? fetchUrl;
  server.registerTool(
    "get_doc",
    {
      title: "Get a documentation page as Markdown",
      description:
        "Returns the markdown body of a documentation page. Pulls from the local index when available, otherwise fetches and converts on the fly.",
      inputSchema: GetDocShape,
    },
    async (input) => {
      const url = normalize(input.url);
      const maxChars = input.max_chars;

      type Row = { url: string; title: string | null; markdown: string; fetched_at: number };
      const cached = ctx.db
        .query<Row, [string]>(
          "SELECT url, title, markdown, fetched_at FROM pages WHERE url = ? LIMIT 1",
        )
        .get(url);
      if (cached) {
        const md = cached.markdown.slice(0, maxChars);
        return {
          content: [{ type: "text", text: md }],
          structuredContent: {
            url: cached.url,
            title: cached.title,
            markdown: md,
            source: "cache",
            fetchedAt: cached.fetched_at,
            truncated: cached.markdown.length > maxChars,
          },
        };
      }

      const mem = memoryCache.get(url);
      if (mem) {
        const md = mem.markdown.slice(0, maxChars);
        return {
          content: [{ type: "text", text: md }],
          structuredContent: {
            url,
            title: mem.title,
            markdown: md,
            source: "memory-cache",
            fetchedAt: mem.fetchedAt,
            truncated: mem.markdown.length > maxChars,
          },
        };
      }

      const fetchOpts: Parameters<typeof fetcher>[1] = {};
      if (ctx.userAgent) fetchOpts.userAgent = ctx.userAgent;
      const res = await fetcher(url, fetchOpts);
      if (res.status !== 200) {
        return {
          isError: true,
          content: [{ type: "text", text: `Fetch failed: HTTP ${res.status}` }],
        };
      }
      const extracted = extract({ url, html: res.body });
      if (!extracted) {
        return {
          isError: true,
          content: [{ type: "text", text: "Could not extract article content." }],
        };
      }
      const md = htmlToMarkdown(extracted.contentHtml);
      const fetchedAt = Date.now();
      memoryCache.set(url, { markdown: md, title: extracted.title, fetchedAt });
      cleanCache();
      const truncated = md.length > maxChars;
      const sliced = md.slice(0, maxChars);
      return {
        content: [{ type: "text", text: sliced }],
        structuredContent: {
          url,
          title: extracted.title,
          markdown: sliced,
          source: "fetched",
          fetchedAt,
          truncated,
        },
      };
    },
  );
}
