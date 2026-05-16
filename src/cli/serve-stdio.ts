import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer } from "../mcp/server.ts";
import { bootstrapContext } from "./bootstrap.ts";

export async function serveStdio(): Promise<void> {
  const { ctx, shutdown } = await bootstrapContext();
  const server = buildMcpServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("SIGINT", async () => {
    await server.close();
    shutdown();
    process.exit(0);
  });
}
