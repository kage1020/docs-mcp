#!/usr/bin/env bun
/**
 * Compare two vitest-bench JSON outputs and fail when any benchmark slowed
 * down by more than --threshold (default 20%).
 *
 * Usage:
 *   bun run scripts/bench-diff.ts <baseline.json> <current.json> [--threshold 0.2]
 */
import { readFileSync } from "node:fs";

type BenchEntry = {
  name?: string;
  fullName?: string;
  hz?: number;
  mean?: number;
  result?: { hz?: number; mean?: number };
};

type BenchFile = {
  files?: Array<{
    groups?: Array<{ benchmarks?: BenchEntry[] }>;
  }>;
};

function* iterEntries(file: BenchFile): Iterable<BenchEntry> {
  for (const f of file.files ?? []) {
    for (const g of f.groups ?? []) {
      for (const b of g.benchmarks ?? []) yield b;
    }
  }
}

function nameOf(entry: BenchEntry): string {
  return entry.fullName ?? entry.name ?? "(unnamed)";
}

function meanOf(entry: BenchEntry): number | undefined {
  return entry.mean ?? entry.result?.mean;
}

function main(): number {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const baselinePath = positional[0];
  const currentPath = positional[1];
  if (!baselinePath || !currentPath) {
    process.stderr.write("usage: bench-diff <baseline.json> <current.json> [--threshold N]\n");
    return 2;
  }
  const thresholdIdx = args.indexOf("--threshold");
  const threshold =
    thresholdIdx >= 0 && args[thresholdIdx + 1] ? Number(args[thresholdIdx + 1]) : 0.2;

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as BenchFile;
  const current = JSON.parse(readFileSync(currentPath, "utf8")) as BenchFile;

  const baseMap = new Map<string, number>();
  for (const e of iterEntries(baseline)) {
    const m = meanOf(e);
    if (typeof m === "number") baseMap.set(nameOf(e), m);
  }

  const regressions: string[] = [];
  for (const e of iterEntries(current)) {
    const name = nameOf(e);
    const baseMean = baseMap.get(name);
    const curMean = meanOf(e);
    if (baseMean === undefined || curMean === undefined || baseMean === 0) continue;
    const ratio = curMean / baseMean - 1;
    if (ratio > threshold) {
      regressions.push(
        `  ${name}: ${(baseMean * 1e6).toFixed(2)} -> ${(curMean * 1e6).toFixed(2)} us (+${(ratio * 100).toFixed(1)}%)`,
      );
    }
  }

  if (regressions.length > 0) {
    process.stderr.write(`bench regressions (>${(threshold * 100).toFixed(0)}%):\n`);
    for (const r of regressions) process.stderr.write(`${r}\n`);
    return 1;
  }
  process.stdout.write("bench-diff: no regressions detected\n");
  return 0;
}

process.exit(main());
