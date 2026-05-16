import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../../package.json" with { type: "json" };
import type { ServerContext } from "./context.ts";
import { registerAddSite } from "./tools/add-site.ts";
import { registerGetDoc } from "./tools/get-doc.ts";
import { registerListSites } from "./tools/list-sites.ts";
import { registerRefreshSite } from "./tools/refresh-site.ts";
import { registerRemoveSite } from "./tools/remove-site.ts";
import { registerSearchDocs } from "./tools/search-docs.ts";

export function buildMcpServer(ctx: ServerContext): McpServer {
  const server = new McpServer({
    name: "docs-mcp",
    version: packageJson.version,
  });
  registerSearchDocs(server, ctx);
  registerGetDoc(server, ctx);
  registerAddSite(server, ctx);
  registerRemoveSite(server, ctx);
  registerListSites(server, ctx);
  registerRefreshSite(server, ctx);
  return server;
}
