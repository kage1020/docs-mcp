import { z } from "zod";

export const SearchModeEnum = z.enum(["bm25", "vector", "hybrid", "auto"]);

export const SearchDocsShape = {
  query: z.string().min(1).describe("Search query string"),
  site_id: z.number().int().optional().describe("Restrict search to a single site"),
  top_k: z.number().int().min(1).max(50).default(10).describe("Number of hits to return"),
  mode: SearchModeEnum.default("auto").describe("Search mode"),
};

export const GetDocShape = {
  url: z.string().url().describe("Page URL to retrieve as markdown"),
  max_chars: z
    .number()
    .int()
    .min(100)
    .max(500_000)
    .default(60_000)
    .describe("Truncate output to at most this many characters"),
};

export const AddSiteShape = {
  base_url: z.string().url().describe("Base URL of the documentation site"),
  name: z.string().optional().describe("Friendly name (defaults to host + path)"),
  include_patterns: z
    .array(z.string())
    .optional()
    .describe("Micromatch patterns the URL path must match"),
  exclude_patterns: z
    .array(z.string())
    .optional()
    .describe("Micromatch patterns to exclude (negated)"),
  max_depth: z.number().int().min(0).max(20).default(5),
  max_pages: z.number().int().min(1).max(20_000).default(2_000),
};

export const RemoveSiteShape = {
  site_id: z.number().int().describe("Site to delete (cascades to pages + chunks)"),
};

export const ListSitesShape = {} as const;

export const RefreshSiteShape = {
  site_id: z.number().int(),
  mode: z.enum(["diff", "full"]).default("diff"),
};
