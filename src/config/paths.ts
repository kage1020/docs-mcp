import { homedir, platform } from "node:os";
import { join } from "node:path";

export type Env = Readonly<Record<string, string | undefined>>;

const isWin = (p = platform()) => p === "win32";
const isMac = (p = platform()) => p === "darwin";

function localAppDataWin(env: Env): string {
  return env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
}

export function resolveDataDir(env: Env, platformOverride?: NodeJS.Platform): string {
  if (env.DOCS_MCP_DATA_DIR) return env.DOCS_MCP_DATA_DIR;
  const p = platformOverride ?? platform();
  if (isWin(p)) return join(localAppDataWin(env), "docs-mcp");
  if (isMac(p)) return join(homedir(), "Library", "Application Support", "docs-mcp");
  const xdg = env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(xdg, "docs-mcp");
}

export function resolveCacheDir(env: Env, platformOverride?: NodeJS.Platform): string {
  if (env.DOCS_MCP_CACHE_DIR) return env.DOCS_MCP_CACHE_DIR;
  const p = platformOverride ?? platform();
  if (isWin(p)) return join(localAppDataWin(env), "docs-mcp", "cache");
  if (isMac(p)) return join(homedir(), "Library", "Caches", "docs-mcp");
  const xdg = env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(xdg, "docs-mcp");
}

export function resolveDbPath(env: Env, platformOverride?: NodeJS.Platform): string {
  return join(resolveDataDir(env, platformOverride), "docs.sqlite");
}
