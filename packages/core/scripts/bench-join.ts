// The join of the parts of the benchmark: `node scripts/bench-join.ts --parts <folder> [--json <file>]`.
// Each job of the workflow `Bench` writes the rows of its part to `bench-<part>.json` in the folder. One part also writes its side tables to `side-<part>.txt`.
// This script puts the rows in the order of one run, prints the tables as `pnpm bench` prints them, and writes one `bench.json`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "../src/cases.ts";
import { FIXTURES } from "../src/fixtures.ts";
import { formatFaults, formatLevels, formatTable, orderRows, type BenchRow } from "../src/bench/run.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";
import { routersOf } from "../src/strategies/model.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const folder = opt("--parts");
if (!folder) throw new Error("bench-join needs --parts <folder>");
const files = readdirSync(folder).sort();
const parts = files.filter((f) => /^bench-.+\.json$/.test(f));
const loaded: BenchRow[] = [];
for (const file of parts) loaded.push(...(JSON.parse(readFileSync(join(folder, file), "utf8")) as BenchRow[]));
const rows = orderRows(
  loaded,
  routersOf(STRATEGIES).map((r) => r.name),
  [...FIXTURES.map((f) => f.name), ...CASES.map((c) => c.name)],
);
console.log(formatTable(rows));
console.log();
console.log(formatFaults(rows));
console.log();
console.log(formatLevels(rows.filter((r) => r.levelFaults.length > 0)));
for (const file of files.filter((f) => /^side-.+\.txt$/.test(f))) {
  console.log();
  console.log(readFileSync(join(folder, file), "utf8").trimEnd());
}
const json = opt("--json");
if (json) writeFileSync(json, JSON.stringify(rows, null, 2) + "\n");
process.stderr.write(`bench-join: ${rows.length} rows from ${parts.length} parts\n`);
