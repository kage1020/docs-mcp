import packageJson from "../../package.json" with { type: "json" };

const HELP_TEXT = `docs-mcp ${packageJson.version}

Fast local MCP server that indexes documentation sites by base URL and serves
Markdown content / keyword search / optional semantic search.

USAGE
  docs-mcp <subcommand> [options]

SUBCOMMANDS
  serve        Run the MCP server (--stdio | --http --port <n>)
  add          Add and crawl a documentation site by base URL
  list         List indexed sites
  remove       Remove an indexed site
  refresh      Re-crawl an indexed site (--mode diff|full)

OPTIONS
  --version, -v   Print version and exit
  --help,    -h   Show this help

Set DOCS_MCP_EMBEDDING_BASE_URL / _MODEL / _API_KEY to enable semantic search.
Data is stored under \`$XDG_DATA_HOME/docs-mcp\` (override with DOCS_MCP_DATA_DIR).
`;

export type RunResult = { exitCode: number };

export async function run(argv: readonly string[]): Promise<RunResult> {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP_TEXT);
    return { exitCode: 0 };
  }

  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`docs-mcp ${packageJson.version}\n`);
    return { exitCode: 0 };
  }

  process.stderr.write(`docs-mcp: subcommand not implemented yet: ${args[0]}\n`);
  return { exitCode: 2 };
}
