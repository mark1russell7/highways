// The screen times of two commits on one runner (ROUTE-SCALE): `node scripts/scale-screen.ts <base.jsonl,...> -- <head.jsonl,...>`.
// Each file is the `screen.jsonl` of one round of the router screen. The job `screen` of the workflow `Scale` runs the rounds of the two commits in turn.
// The script prints two parts:
// - The parity: the records of the first round of each commit must be equal, except the fields `ms` and `commit`.
// - The times: for each router, the median `ms` of its records in each round, then the median of the rounds, for each commit.
// The `ms` of a record is the median of the runs of `benchRun`. The script imports no package.
import { readFileSync } from "node:fs";

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
const median = (values: readonly number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0 ? NaN : s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const args = process.argv.slice(2);
const cut = args.indexOf("--");
if (cut < 1 || cut === args.length - 1) {
  console.error("Usage: node scripts/scale-screen.ts <base.jsonl,...> -- <head.jsonl,...>");
  process.exit(2);
}
const base = args.slice(0, cut).flatMap((a) => a.split(",")).map(read);
const head = args.slice(cut + 1).flatMap((a) => a.split(",")).map(read);

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

/** This function gives the median time of each router over the rounds: the median of the medians of its records in each round. */
const times = (rounds: readonly (readonly ScreenRecord[])[]): Map<string, number> => {
  const per = new Map<string, number[]>();
  for (const round of rounds) {
    const by = new Map<string, number[]>();
    for (const r of round) by.set(r.strategy, [...(by.get(r.strategy) ?? []), r.ms]);
    for (const [s, list] of by) per.set(s, [...(per.get(s) ?? []), median(list)]);
  }
  return new Map([...per].map(([s, list]) => [s, median(list)]));
};
const tb = times(base);
const th = times(head);
console.log(`\nThe times in ms: ${base.length} rounds of the base and ${head.length} rounds of the head, in turn on one runner.\n`);
console.log("| router | base | head | change |");
console.log("|---|---:|---:|---:|");
for (const [s, b] of tb) {
  const h = th.get(s) ?? NaN;
  console.log(`| ${s} | ${b.toFixed(2)} | ${h.toFixed(2)} | ${((100 * (h - b)) / b).toFixed(1)}% |`);
}
