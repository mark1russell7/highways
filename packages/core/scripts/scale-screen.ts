// The screen times of two commits on one runner (ROUTE-SCALE):
// `node scripts/scale-screen.ts <base.jsonl,...> -- <head.jsonl,...> [-- <aa.jsonl,...>] [--json <file>]`.
// Each file is the `screen.jsonl` of one round of the router screen. The job `screen` of the workflow `Scale` runs the rounds of the commits in turn.
// The third list is the A/A arm: more rounds of the base, each in its own process. The job turns the order of the three arms in each round (MEASURE-ISOLATE).
// The script prints two parts:
// - The parity: the records of the first round of each commit must be equal, except the fields `ms` and `commit`.
// - The times: a paired report `paired-time/1` in the mode `fresh`. For each router, the median `ms` of its records in each round gives one time.
//   The ratio of a router is the median time of the head over the median time of the base. The A/A ratios give the noise floor.
// The `ms` of a record is the median of the runs of `benchRun`. `--json` writes the report. The script imports no package.
import { readFileSync, writeFileSync } from "node:fs";
import { aaId, pairedEnv } from "./gates/paired.ts";
import { insideFloor, reportText, roundsReport } from "./gates/time-gate.ts";

interface ScreenRecord {
  readonly step: string;
  readonly strategy: string;
  readonly input: string;
  readonly options?: unknown;
  readonly ms: number;
  readonly [field: string]: unknown;
}

const TIME_FIELDS = new Set(["ms", "commit"]);
const read = (file: string): ScreenRecord[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as ScreenRecord);
const keyOf = (r: ScreenRecord): string => `${r.step}|${r.strategy}|${JSON.stringify(r.options ?? {})}|${r.input}`;
const body = (r: ScreenRecord): string => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !TIME_FIELDS.has(k))));

const all = process.argv.slice(2);
const at = all.indexOf("--json");
const jsonOut = at >= 0 ? all[at + 1] : undefined;
const args = at >= 0 ? [...all.slice(0, at), ...all.slice(at + 2)] : all;
// The lists of files between the separators `--`: the base, the head, and the A/A arm if the call gives it.
const groups: string[][] = [[]];
for (const a of args) {
  if (a === "--") groups.push([]);
  else groups[groups.length - 1]!.push(a);
}
if (groups.length < 2 || groups.length > 3 || groups.some((g) => g.length === 0)) {
  console.error("Usage: node scripts/scale-screen.ts <base.jsonl,...> -- <head.jsonl,...> [-- <aa.jsonl,...>] [--json <file>]");
  process.exit(2);
}
const [base, head, aa] = groups.map((g) => g.flatMap((a) => a.split(",")).map(read)) as [ScreenRecord[][], ScreenRecord[][], ScreenRecord[][] | undefined];

const heads = new Map(head[0]!.map((r) => [keyOf(r), r]));
let same = 0;
const differ: string[] = [];
for (const r of base[0]!) {
  const h = heads.get(keyOf(r));
  if (h !== undefined && body(h) === body(r)) same++;
  else differ.push(keyOf(r));
}
console.log("## The router screen of the two commits\n");
console.log(`The parity: ${same} of ${base[0]!.length} records are the same, except \`ms\` and \`commit\`. The head has ${head[0]!.length} records.`);
for (const k of differ.slice(0, 10)) console.log(`- differs: ${k}`);

// The paired report of the rounds (MEASURE-ISOLATE). Each router is one input, and its time in a round is the median of its records.
const arms = [
  { id: "base", rounds: base },
  { id: "head", rounds: head },
  ...(aa ? [{ id: aaId("base"), rounds: aa }] : []),
];
const report = roundsReport(arms, (r: ScreenRecord) => r.strategy, (r) => r.ms, pairedEnv(), "scale-screen");
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report) + "\n");
const band = report.noiseFloor;
const verdict = (ratio: number): string => (band === null ? "no noise floor" : insideFloor(ratio, band) ? "inside the noise floor" : ratio < band.p10 ? "faster" : "slower");
console.log(`\nThe times in ms: ${base.length} rounds of the base, ${head.length} rounds of the head${aa ? ` and ${aa.length} rounds of the A/A arm` : ""}, in turn on one runner.`);
console.log(`\n${reportText(report)}\n`);
console.log("| router | base | head | change | verdict |");
console.log("|---|---:|---:|---:|---|");
for (const i of report.inputs) {
  const b = i.median["base"] ?? NaN;
  const h = i.median["head"] ?? NaN;
  const r = i.ratio["head"] ?? NaN;
  console.log(`| ${i.id} | ${b.toFixed(2)} | ${h.toFixed(2)} | ${(100 * (r - 1)).toFixed(1)}% | ${verdict(r)} |`);
}
