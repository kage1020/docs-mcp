import { createServer, type Server } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "../mcp/server.ts";
import { bootstrapContext } from "./bootstrap.ts";

export type HttpServerHandle = {
  port: number;
  server: Server;
  stop: () => Promise<void>;
};

export async function serveHttp(opts: { port?: number } = {}): Promise<HttpServerHandle> {
  const { ctx, shutdown } = await bootstrapContext();
  const port = opts.port ?? 7777;

  const server = createServer(async (req, res) => {
    if (!req.url?.startsWith("/mcp")) {
      res
        .writeHead(404, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "not found" }));
      return;
    }
    if (req.method !== "POST" && req.method !== "DELETE") {
      res
        .writeHead(405, { "Content-Type": "application/json", Allow: "POST, DELETE" })
        .end(JSON.stringify({ error: "method not allowed" }));
      return;
    }
    try {
      const mcp = buildMcpServer(ctx);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });
      // SDK transport types omit `onclose` from required Transport surface;
      // cast through unknown to satisfy McpServer.connect's stricter expectation.
      await mcp.connect(transport as unknown as Parameters<typeof mcp.connect>[0]);
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res
          .writeHead(500, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: err instanceof Error ? err.message : "internal error" }));
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;

  return {
    port: actualPort,
    server,
    stop: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await shutdown();
    },
  };
}
