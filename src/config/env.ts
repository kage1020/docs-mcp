import { z } from "zod";

export const EnvSchema = z.object({
  DOCS_MCP_DATA_DIR: z.string().optional(),
  DOCS_MCP_CACHE_DIR: z.string().optional(),
  DOCS_MCP_EMBEDDING_BASE_URL: z.string().url().optional(),
  DOCS_MCP_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  DOCS_MCP_EMBEDDING_API_KEY: z.string().optional(),
  DOCS_MCP_USER_AGENT: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type DocsMcpEnv = z.infer<typeof EnvSchema>;

export function parseEnv(env: NodeJS.ProcessEnv = process.env): DocsMcpEnv {
  return EnvSchema.parse(env);
}
