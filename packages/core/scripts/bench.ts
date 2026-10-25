// The command line of the benchmark: `pnpm bench [--max <nodes>] [--json <file>]`.
import { writeFileSync } from "node:fs";
import { FIXTURES } from "../src/fixtures.ts";
import { ROUTERS } from "../src/routers/index.ts";
import { formatTable, runBenchmark } from "../src/bench/run.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const max = Number(opt("--max") ?? 1000);
const rows = runBenchmark(
  ROUTERS,
  FIXTURES.filter((f) => f.nodes <= max),
  { repeat: Number(opt("--repeat") ?? 3) },
);
console.log(formatTable(rows));
const json = opt("--json");
if (json) writeFileSync(json, JSON.stringify(rows, null, 2) + "\n");
if (rows.some((r) => !r.deterministic)) process.exitCode = 1;
