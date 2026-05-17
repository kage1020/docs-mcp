import { z } from "zod";

export const EnvSchema = z.object({
  DOCS_MCP_DATA_DIR: z.string().optional(),
  DOCS_MCP_CACHE_DIR: z.string().optional(),
  DOCS_MCP_EMBEDDING_BASE_URL: z.string().url().optional(),
  DOCS_MCP_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  DOCS_MCP_EMBEDDING_API_KEY: z.string().optional(),
  DOCS_MCP_USER_AGENT: z.string().optional(),
  DOCS_MCP_RENDER: z.enum(["fetch", "playwright"]).default("fetch"),
  DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT: z
    .string()
    .default("60000")
    .transform((s, ctx) => {
      const n = Number(s);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT must be a positive integer (milliseconds)",
        });
        return Number.NaN;
      }
      return n;
    }),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type DocsMcpEnv = z.infer<typeof EnvSchema>;

export function parseEnv(env: NodeJS.ProcessEnv = process.env): DocsMcpEnv {
  return EnvSchema.parse(env);
}
