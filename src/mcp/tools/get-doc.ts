import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUrl } from "../../crawler/fetcher.ts";
import { type Fetcher, loadRobots } from "../../crawler/site-setup.ts";
import { isUnderBase, normalize } from "../../crawler/url.ts";
import { extract } from "../../extractor/extract.ts";
import { htmlToMarkdown } from "../../extractor/markdown.ts";
import { chunk } from "../../indexer/chunk.ts";
import { embedAndStoreChunks } from "../../indexer/embed-chunks.ts";
import { indexPage } from "../../indexer/index-page.ts";
import { listSites } from "../../storage/repositories/sites.ts";
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

async function getOrLoadRobots(ctx: ServerContext, url: string, fetcher: Fetcher) {
  const origin = new URL(url).origin;
  let advisor = ctx.robotsCache.get(origin);
  if (advisor) return advisor;
  const { advisor: a } = await loadRobots(`${origin}/`, fetcher);
  ctx.robotsCache.set(origin, a);
  advisor = a;
  return advisor;
}

export function registerGetDoc(server: McpServer, ctx: ServerContext): void {
  const fetcher = ctx.fetcher ?? fetchUrl;
  server.registerTool(
    "get_doc",
    {
      title: "Get a documentation page as Markdown",
      description:
        "Returns the markdown body of a documentation page. Pulls from the local index when available, otherwise fetches and converts on the fly. Pass persist:true to index the fetched page into a registered site.",
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
            persisted: false,
          },
        };
      }

      const mem = memoryCache.get(url);
      if (mem && !input.persist) {
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
            persisted: false,
          },
        };
      }

      // Cold path: robots check first, then fetch + extract.
      const advisor = await getOrLoadRobots(ctx, url, fetcher);
      const userAgent = ctx.userAgent ?? "docs-mcp";
      if (!advisor.isAllowed(url, userAgent)) {
        return {
          isError: true,
          content: [{ type: "text", text: `URL is disallowed by robots.txt: ${url}` }],
        };
      }

      // If persist requested, also resolve which registered site this URL belongs to.
      let persistSiteId: number | null = null;
      const persistDepth = 0;
      if (input.persist) {
        const sites = listSites(ctx.db);
        const matching = sites.find((s) => isUnderBase(url, s.base_url));
        if (!matching) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Cannot persist ${url}: no registered site whose base_url covers it. Call add_site first.`,
              },
            ],
          };
        }
        persistSiteId = matching.id;
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

      let persisted = false;
      if (persistSiteId !== null) {
        const chunks = chunk(md, { leafLabel: true });
        const indexed = indexPage(
          ctx.db,
          {
            siteId: persistSiteId,
            url,
            title: extracted.title,
            etag: res.headers.get("etag"),
            lastModified: res.headers.get("last-modified"),
            markdown: md,
            fetchedAt,
            depth: persistDepth,
          },
          chunks,
        );
        if (ctx.embedClient && indexed.chunkCount > 0) {
          await embedAndStoreChunks(ctx.db, indexed.pageId, ctx.embedClient);
        }
        persisted = true;
      } else {
        memoryCache.set(url, { markdown: md, title: extracted.title, fetchedAt });
        cleanCache();
      }

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
          persisted,
          ...(persistSiteId !== null ? { siteId: persistSiteId } : {}),
        },
      };
    },
  );
}
