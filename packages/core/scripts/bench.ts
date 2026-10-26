// The command line of the benchmark: `pnpm bench [--max <nodes>] [--json <file>]`.
import { writeFileSync } from "node:fs";
import { CASES } from "../src/cases.ts";
import { FIXTURES } from "../src/fixtures.ts";
import { ROUTERS } from "../src/routers/index.ts";
import { benchOne, formatFaults, formatTable, runBenchmark } from "../src/bench/run.ts";

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
// The case boards are small, so each run races them. Each case shows one known defect.
for (const c of CASES) {
  const graph = c.make();
  for (const router of ROUTERS) if (graph.nodes.length <= (router.maxNodes ?? Infinity)) rows.push(benchOne(router, c.name, graph, Number(opt("--repeat") ?? 3)));
}
console.log(formatTable(rows));
console.log();
console.log(formatFaults(rows));
const json = opt("--json");
if (json) writeFileSync(json, JSON.stringify(rows, null, 2) + "\n");
if (rows.some((r) => !r.deterministic)) process.exitCode = 1;
