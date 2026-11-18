// The noise table of the sections gate: the A/A noise of each run of the gate by the CPU model and the rounds, and the outcome of each flip.
// `gate:pool` adds the rows of new runs from their artifacts and keeps each old row, because an artifact expires.
// The flip of the sections gate reads the table to choose the rounds of its first run, and a test counts the no reads of the flip in it.
import { wilson } from "@mark1russell7/rigor-statistics";
import { InputError } from "./gates/inputs.ts";
import type { GateRun } from "./sections-gate-verdict.ts";

/** The file of the noise table, from the folder of the package. */
export const NOISE_FILE = "scripts/data/sections-gate/noise.json";
/** The schema of the noise table. */
export const NOISE_SCHEMA = "sections-noise/1";
/** The clean arm of the flip starts with 2 times the rounds on a CPU model with a noisy share above this share. */
export const START_NOISY_SHARE = 0.5;
/** The highest share of flips with no read that the rule of the flip keeps. */
export const FLIP_NO_READ_SHARE = 1 / 20;
/** The count of flips from which the test of the no reads decides. */
export const FLIP_CHECK_RUNS = 20;

/** The outcome of a flip. A no read is not a pass and not a fail: an arm ended on a run that cannot decide. */
export type FlipOutcome = "pass" | "fail" | "no read";

/** One run of the gate in the table. */
export interface NoiseRun {
  /** The workflow of the run: the gate, or the flip of the gate. */
  readonly source: "gate" | "flip";
  /** The id of the workflow run. */
  readonly run: number;
  /** The job of the run: `gate` or `retry`, or the arm of a flip and its run, for example `clean-2`. */
  readonly job: string;
  readonly date: string;
  readonly cpu: string;
  readonly rounds: number;
  /** The A/A spread of the run on the log scale. */
  readonly spread: number;
  /** This value is `true` when the spread is above the noise cap of the run. A noisy run cannot pass. */
  readonly noisy: boolean;
}

/** One flip of the sections gate in the table. The table keeps only the flips of the record `gate-flip/2`, which has the rule of no read. */
export interface NoiseFlip {
  readonly run: number;
  readonly date: string;
  readonly cpu: string;
  readonly outcome: FlipOutcome;
}

/** The noise table. */
export interface NoiseTable {
  readonly schema: typeof NOISE_SCHEMA;
  readonly runs: readonly NoiseRun[];
  readonly flips: readonly NoiseFlip[];
}

/** The share of noisy runs of some rounds on a CPU model, with its Wilson interval at 95 %. */
export interface NoisyShare {
  readonly cpu: string;
  readonly rounds: number;
  readonly runs: number;
  readonly noisy: number;
  /** The share of noisy runs. It is `null` when the table has no such run. */
  readonly share: number | null;
  readonly low: number;
  readonly high: number;
}

/** The rounds of the first run of the clean arm of the flip, and the reason. */
export interface StartChoice {
  /** The value of `--attempt` for the first run: 1 for the base rounds, 2 for 2 times the rounds. */
  readonly attempt: "1" | "2";
  readonly share: NoisyShare;
  readonly reason: string;
}

/** The count of the no reads of the flip in the table, with the Wilson interval at 95 % of their share. */
export interface FlipNoReads {
  readonly flips: number;
  readonly noReads: number;
  /** The share of flips with no read. It is `null` when the table has no flip. */
  readonly share: number | null;
  readonly low: number;
  readonly high: number;
  /** This value is `false` when the table has `FLIP_CHECK_RUNS` flips or more, and the share is above `FLIP_NO_READ_SHARE`. */
  readonly ok: boolean;
  readonly reason: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES: readonly string[] = ["pass", "fail", "no read"] satisfies FlipOutcome[];
const runKey = (r: Pick<NoiseRun, "source" | "run" | "job">): string => `${r.source} ${r.run} ${r.job}`;
const fmt = (x: number): string => x.toFixed(3);

/** This function gives a table with no row. */
export function emptyNoise(): NoiseTable {
  return { schema: NOISE_SCHEMA, runs: [], flips: [] };
}

/** This function reads the text of a noise table. A table that is not valid throws an `InputError`. */
export function parseNoise(text: string): NoiseTable {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new InputError(`${NOISE_FILE} is not JSON: ${String(error)}`);
  }
  const t = raw as Partial<NoiseTable> | null;
  if (t === null || typeof t !== "object" || t.schema !== NOISE_SCHEMA || !Array.isArray(t.runs) || !Array.isArray(t.flips)) {
    throw new InputError(`${NOISE_FILE} has the schema ${NOISE_SCHEMA} and the lists runs and flips.`);
  }
  const keys = new Set<string>();
  for (const r of t.runs) {
    const ok =
      (r.source === "gate" || r.source === "flip") &&
      Number.isInteger(r.run) &&
      typeof r.job === "string" &&
      typeof r.date === "string" &&
      DATE.test(r.date) &&
      typeof r.cpu === "string" &&
      Number.isInteger(r.rounds) &&
      r.rounds > 0 &&
      Number.isFinite(r.spread) &&
      typeof r.noisy === "boolean";
    if (!ok) throw new InputError(`A run of ${NOISE_FILE} is not valid: ${JSON.stringify(r)}`);
    if (keys.has(runKey(r))) throw new InputError(`${NOISE_FILE} has the run ${runKey(r)} two times.`);
    keys.add(runKey(r));
  }
  const flips = new Set<number>();
  for (const f of t.flips) {
    const ok = Number.isInteger(f.run) && typeof f.date === "string" && DATE.test(f.date) && typeof f.cpu === "string" && OUTCOMES.includes(f.outcome);
    if (!ok) throw new InputError(`A flip of ${NOISE_FILE} is not valid: ${JSON.stringify(f)}`);
    if (flips.has(f.run)) throw new InputError(`${NOISE_FILE} has the flip ${f.run} two times.`);
    flips.add(f.run);
  }
  return { schema: NOISE_SCHEMA, runs: t.runs, flips: t.flips };
}

/** This function gives the row of a record of the gate. It gives `null` when the record has no A/A spread, for example a job that timed no arm. */
export function noiseRow(record: Pick<GateRun, "rounds" | "env" | "home">, facts: Pick<NoiseRun, "source" | "run" | "job" | "date">): NoiseRun | null {
  const noise = record.home?.noise;
  if (noise === null || noise === undefined || noise.spread === null) return null;
  return { ...facts, cpu: record.env.cpu, rounds: record.rounds, spread: noise.spread, noisy: noise.noisy };
}

/** This function adds rows to a table. A row of the table stays, and a new row with the key of a row of the table does not go in. */
export function mergeNoise(table: NoiseTable, runs: readonly NoiseRun[], flips: readonly NoiseFlip[]): NoiseTable {
  const byRun = new Map(table.runs.map((r) => [runKey(r), r]));
  for (const r of runs) if (!byRun.has(runKey(r))) byRun.set(runKey(r), r);
  const byFlip = new Map(table.flips.map((f) => [f.run, f]));
  for (const f of flips) if (!byFlip.has(f.run)) byFlip.set(f.run, f);
  const order = (a: { run: number }, b: { run: number }): number => a.run - b.run;
  return {
    schema: NOISE_SCHEMA,
    runs: [...byRun.values()].sort((a, b) => order(a, b) || runKey(a).localeCompare(runKey(b))),
    flips: [...byFlip.values()].sort(order),
  };
}

/** This function gives the share of noisy runs of `rounds` rounds on the CPU model `cpu`. It reads the runs of the gate and of the flip. */
export function noisyShare(table: NoiseTable, cpu: string, rounds: number): NoisyShare {
  const rows = table.runs.filter((r) => r.cpu === cpu && r.rounds === rounds);
  const noisy = rows.filter((r) => r.noisy).length;
  const { low, high } = wilson(noisy, rows.length);
  return { cpu, rounds, runs: rows.length, noisy, share: rows.length === 0 ? null : noisy / rows.length, low, high };
}

/**
 * This function chooses the rounds of the first run of the clean arm of the flip from the table.
 * The arm starts with 2 times the rounds when the noisy share of the base rounds on its CPU model is above `START_NOISY_SHARE`.
 * A run of the base rounds on such a model is a sure no read, so it only costs time.
 */
export function startChoice(table: NoiseTable, cpu: string, rounds: number): StartChoice {
  const share = noisyShare(table, cpu, rounds);
  const of = `${share.noisy} of ${share.runs} runs of ${rounds} rounds on ${cpu} were noisy`;
  if (share.share === null) return { attempt: "1", share, reason: `The table has no run of ${rounds} rounds on ${cpu}, so the first run of the clean arm has ${rounds} rounds.` };
  if (share.share > START_NOISY_SHARE) {
    return { attempt: "2", share, reason: `${of} (Wilson 95 %: ${fmt(share.low)} to ${fmt(share.high)}), above 1/2. So the first run of the clean arm has 2 times the rounds.` };
  }
  return { attempt: "1", share, reason: `${of} (Wilson 95 %: ${fmt(share.low)} to ${fmt(share.high)}), not above 1/2. So the first run of the clean arm has ${rounds} rounds.` };
}

/**
 * This function counts the flips with no read. From `FLIP_CHECK_RUNS` flips, a share above `FLIP_NO_READ_SHARE` is a fail of the rule of the flip.
 * The fix of such a fail is more rounds in each run, not more runs.
 */
export function flipNoReads(table: NoiseTable): FlipNoReads {
  const flips = table.flips.length;
  const noReads = table.flips.filter((f) => f.outcome === "no read").length;
  const { low, high } = wilson(noReads, flips);
  const share = flips === 0 ? null : noReads / flips;
  const of = `${noReads} of ${flips} flips have no read (Wilson 95 %: ${fmt(low)} to ${fmt(high)})`;
  if (flips < FLIP_CHECK_RUNS) return { flips, noReads, share, low, high, ok: true, reason: `${of}. The test decides from ${FLIP_CHECK_RUNS} flips.` };
  if (noReads / flips > FLIP_NO_READ_SHARE) {
    return { flips, noReads, share, low, high, ok: false, reason: `${of}, above 1/20. Give each run of the flip more rounds, not more runs.` };
  }
  return { flips, noReads, share, low, high, ok: true, reason: `${of}, at or below 1/20.` };
}
