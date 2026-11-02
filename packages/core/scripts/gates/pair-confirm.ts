// The confirm of one commit against its parent, to the shared interface paired-time/1 (MEASURE-ISOLATE).
// The rule: the two arms and the A/A arm of the parent run in one job, in turn, with a fresh process for each route.
// This module imports only node modules and the paired gate, and knows no type of highways. The planned bench home takes it with no rewrite.
//
// - `confirmPair` times the arms `parent` and `commit` and the A/A arm `parent~aa` on each input, and gives the report.
// - `pairVerdicts` reads such a report. For each input, it gives the ratio of the commit over the parent, the A/A band and the verdict.
import { aaId, measureIsolated, quantileOf, type ChildResult, type PairedEnv, type PairedReport } from "./paired.ts";

/** The id of the arm of the parent. It is the base of the report: the denominator of each ratio. */
export const PARENT_ARM = "parent";
/** The id of the arm of the commit. */
export const COMMIT_ARM = "commit";

/** The options of `confirmPair`. Each value is plain data: the commands of the children and the ids of the inputs. */
export interface PairOptions {
  /** The argv of a child of the parent. The helper appends `--input <id> --warmup <n>`. */
  readonly parent: readonly string[];
  /** The argv of a child of the commit. */
  readonly commit: readonly string[];
  /** The ids of the inputs. Each id is its own group. */
  readonly inputs: readonly string[];
  /** The timed rounds of each arm on each input. */
  readonly rounds: number;
  /** The untimed runs of a child before its timed run. The default is 0. */
  readonly warmup?: number;
  /** The start of one child. The default starts a process. A test gives its own. */
  readonly startChild?: (command: readonly string[], input: string, warmup: number) => Promise<ChildResult>;
  /** The computer. The default is the computer of this process. */
  readonly env?: PairedEnv;
  /** The context of the run. The default is the context of this process. */
  readonly context?: string;
}

/**
 * This function times a commit against its parent in fresh processes, and gives the report of schema `paired-time/1`.
 *
 * - The arms are `parent`, `commit` and the A/A arm `parent~aa`. In each round, the order of the arms rotates.
 * - Each route has its own fresh process, and the children run one at a time.
 * - A bad option makes the promise reject with a `RangeError`.
 */
export function confirmPair(o: PairOptions): Promise<PairedReport> {
  return measureIsolated<never>({
    arms: [
      { id: PARENT_ARM, command: o.parent },
      { id: COMMIT_ARM, command: o.commit },
    ],
    inputs: o.inputs.map((id) => ({ id, group: id })),
    repeats: o.rounds,
    warmup: o.warmup ?? 0,
    mode: "fresh",
    ...(o.startChild === undefined ? {} : { startChild: o.startChild }),
    ...(o.env === undefined ? {} : { env: o.env }),
    ...(o.context === undefined ? {} : { context: o.context }),
  });
}

/**
 * This function gives the A/A ratios of one input of a report, one value for each round.
 * The ratio of a round is the time of the A/A arm over the time of the base in the same round. An unknown input gives an empty list.
 */
export function aaRatios(report: PairedReport, input: string): number[] {
  const row = report.inputs.find((i) => i.id === input);
  if (row === undefined) return [];
  const base = row.ms[report.base] ?? [];
  const aa = row.ms[aaId(report.base)] ?? [];
  const out: number[] = [];
  for (let k = 0; k < Math.min(base.length, aa.length); k++) if (base[k]! > 0 && Number.isFinite(aa[k]!)) out.push(aa[k]! / base[k]!);
  return out;
}

/** This function gives the A/A spread of a list of A/A ratios: p90 of |r - 1|. An empty list gives NaN. */
export const spreadOf = (ratios: readonly number[]): number => quantileOf(ratios.map((r) => Math.abs(r - 1)), 0.9);

/** The verdict of a ratio against the band of the base. */
export type PairVerdict = "slower" | "faster" | "inside" | "not measured";

/** This function compares a ratio with the band of the base, 1 - spread to 1 + spread. A ratio on an edge is inside. */
export function verdictOf(ratio: number | null, spread: number): PairVerdict {
  if (ratio === null || !Number.isFinite(ratio) || !Number.isFinite(spread)) return "not measured";
  if (ratio > 1 + spread) return "slower";
  if (ratio < 1 - spread) return "faster";
  return "inside";
}

/** The result of the commit against the parent on one input. */
export interface PairRow {
  readonly input: string;
  /** The median time of the commit over the median time of the parent. */
  readonly ratio: number | null;
  /** The median times of the parent and of the commit, in ms. */
  readonly parentMs: number | null;
  readonly commitMs: number | null;
  /** The A/A ratios of the rounds. */
  readonly aa: readonly number[];
  /** The A/A spread: p90 of |r - 1| over `aa`. */
  readonly spread: number;
  /** The band of the parent: 1 - spread to 1 + spread. It is `null` without A/A ratios. */
  readonly band: { readonly lo: number; readonly hi: number } | null;
  readonly verdict: PairVerdict;
}

/**
 * This function gives the result of each input of a confirm report, in the order of the inputs.
 *
 * - The report must have the base `parent`, the arm `commit` and the A/A arm `parent~aa`. Else the function throws a `RangeError`.
 * - The band uses only the A/A ratios of the same input in the same report, so the comparison stays in one job.
 */
export function pairVerdicts(report: PairedReport): PairRow[] {
  if (report.base !== PARENT_ARM || !report.arms.includes(COMMIT_ARM) || !report.arms.includes(aaId(PARENT_ARM)))
    throw new RangeError(`A confirm report has the base ${PARENT_ARM}, the arm ${COMMIT_ARM} and the A/A arm ${aaId(PARENT_ARM)}.`);
  return report.inputs.map((row): PairRow => {
    const aa = aaRatios(report, row.id);
    const spread = spreadOf(aa);
    const ratio = row.ratio[COMMIT_ARM] ?? null;
    return {
      input: row.id,
      ratio,
      parentMs: row.median[PARENT_ARM] ?? null,
      commitMs: row.median[COMMIT_ARM] ?? null,
      aa,
      spread,
      band: Number.isFinite(spread) ? { lo: 1 - spread, hi: 1 + spread } : null,
      verdict: verdictOf(ratio, spread),
    };
  });
}
