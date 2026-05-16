import { startServer, type TestServer } from "./http-server.ts";

export type SitePage = { path: string; title: string; body: string };

const DEFAULT_PAGES: SitePage[] = [
  {
    path: "/",
    title: "Home",
    body: 'Welcome to the documentation. This intro paragraph is long enough for the Readability heuristic to classify the article as readable content with a healthy score. <a href="/a">A</a> <a href="/b">B</a>',
  },
  {
    path: "/a",
    title: "Topic A",
    body: 'Topic A explains the routing model. The same paragraph is repeated several times to satisfy the readability heuristic with content of sufficient length. The same paragraph is repeated several times to satisfy the readability heuristic. <a href="/c">C</a>',
  },
  {
    path: "/b",
    title: "Topic B",
    body: 'Topic B describes the rendering pipeline in extensive detail with multiple paragraphs and a few code examples that make the content substantial enough for the readability extractor to keep it. <pre><code class="language-ts">const x = 1;</code></pre>',
  },
  {
    path: "/c",
    title: "Topic C",
    body: "Topic C focuses on deployment and operations practices. The text covers the recommended workflows and a handful of edge cases that the operator should be aware of during a release.",
  },
  {
    path: "/private/secret",
    title: "Secret",
    body: "Should never be indexed. Should never be indexed. Should never be indexed. Should never be indexed.",
  },
];

function renderPage(p: SitePage, base: string): string {
  return `<!DOCTYPE html><html><head><title>${p.title}</title></head>
<body>
  <header><nav><a href="${base}/">Home</a></nav></header>
  <main>
    <article>
      <h1>${p.title}</h1>
      <p>${p.body}</p>
      <p>This second paragraph adds further bulk content to ensure that Readability treats the article as the primary body of the page. Without it the heuristic may fall back to other heuristics that we do not want to rely on in tests.</p>
    </article>
  </main>
  <footer>Copyright</footer>
</body></html>`;
}

function renderSitemap(base: string, urls: string[]): string {
  const items = urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}

export type DocsSite = {
  server: TestServer;
  pages: Map<string, SitePage>;
  setPage(path: string, page: SitePage): void;
  baseUrl: string;
};

export function startDocsSite(initial?: SitePage[]): DocsSite {
  const pages = new Map<string, SitePage>();
  for (const p of initial ?? DEFAULT_PAGES) pages.set(p.path, p);

  let baseRef = "";
  const server = startServer((req) => {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /private\n", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    if (path === "/sitemap.xml") {
      const list = Array.from(pages.values())
        .filter((p) => !p.path.startsWith("/private"))
        .map((p) => p.path);
      return new Response(renderSitemap(baseRef, list), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
    const trimmed = path === "/" ? "/" : path.replace(/\/$/, "");
    const page = pages.get(trimmed);
    if (!page) {
      return new Response("not found", { status: 404 });
    }
    return new Response(renderPage(page, baseRef), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });
  baseRef = server.origin;
  return {
    server,
    pages,
    setPage(path, p) {
      pages.set(path, p);
    },
    baseUrl: `${server.origin}/`,
  };
}
