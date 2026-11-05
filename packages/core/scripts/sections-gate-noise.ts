// One read of the A/A spread of the sections gate (GATE-NOISE). The cap stays: this script only reports where the runs sit against it.
// The first argument is a folder. Its file `runs.txt` has a run id and a date on each line, and `<run id>/**/sections-gate.json` holds the artifacts of that run.
// The second argument is the output file. The record states each count with its denominator.
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { aaSpread } from "@mark1russell7/rigor-bench";
import { aaRatios } from "./gates/pair-confirm.ts";
import { NOISE_CAP, SPREAD_LEVEL, ratioTimes } from "./sections-gate-verdict.ts";

/** One gate record of a run. */
export interface NoiseRow {
  readonly run: string;
  readonly date: string;
  readonly attempt: number;
  /** The p90 of |log r| over the A/A ratios of the rounds. */
  readonly spread: number;
  readonly cpu: string;
}

/** The counts of a read: each count is a share of its denominator. */
export function noiseCounts(rows: readonly NoiseRow[], cap: number = NOISE_CAP): { records: { over: number; of: number }; firstAttempts: { over: number; of: number }; runsOverTwice: { over: number; of: number } } {
  const over = (row: NoiseRow): boolean => row.spread > cap;
  const first = rows.filter((row) => row.attempt === 1);
  const second = rows.filter((row) => row.attempt === 2);
  return {
    records: { over: rows.filter(over).length, of: rows.length },
    firstAttempts: { over: first.filter(over).length, of: first.length },
    runsOverTwice: { over: second.filter(over).length, of: first.length },
  };
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [root, out] = process.argv.slice(2);
  if (root === undefined || out === undefined) throw new RangeError("Give the folder of the records and the output file.");
  const dates = new Map(readFileSync(`${root}/runs.txt`, "utf8").trim().split("\n").map((line) => line.trim().split(" ") as [string, string]));
  const rows: NoiseRow[] = [];
  for (const entry of readdirSync(root, { recursive: true }) as string[]) {
    if (!entry.endsWith("sections-gate.json")) continue;
    const record = JSON.parse(readFileSync(`${root}/${entry}`, "utf8"));
    const run = entry.split(/[\\/]/)[0]!;
    rows.push({ run, date: dates.get(run) ?? "", attempt: record.attempt, spread: aaSpread(ratioTimes(aaRatios(record.report, record.router), "run"), SPREAD_LEVEL), cpu: record.report.env.cpu });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.attempt - b.attempt);
  const spreads = rows.map((row) => row.spread).sort((a, b) => a - b);
  const record = { schema: "sections-gate-noise/1", note: "One read of the gate runs that have a record. It is not a rate for later runs.", cap: NOISE_CAP, level: SPREAD_LEVEL, median: spreads[spreads.length >> 1], max: spreads.at(-1), counts: noiseCounts(rows), rows };
  writeFileSync(out, `${JSON.stringify({ ...record, rows: [] }, null, 2).replace('"rows": []', `"rows": [\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(",\n")}\n]`)}\n`);
  console.log(JSON.stringify(record.counts), record.median, record.max);
}
