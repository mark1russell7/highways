// The time gates of the comparisons of highways over paired time reports (MEASURE-ISOLATE).
// Each comparison times its arms in one job with `measureIsolated`. These functions read its report: the ratios, the A/A noise floor and the verdicts.
// - The verdict of an arm in a table: a median ratio inside the noise floor (p10 to p90 of the A/A ratios) is not a gain and not a loss.
// - The verdict of an arm on one input in `roundsTable`: the band is 1 ± the A/A spread of the rounds of the input (the confirm rule), so one input has a band too.
// - The promotion time test of `win-time.ts` reads the reports of several jobs, with the verdict of rigor-bench (WIN-TEST-HOME).
import { armRows } from "./pair-confirm.ts";
import { aaId, pairedReport, quantileOf, type Arm, type Input, type PairedEnv, type PairedRatio, type PairedReport, type RawTimes } from "./paired.ts";

/** The band of the A/A ratios: p10 to p90. */
export interface NoiseBand {
  readonly p10: number;
  readonly p90: number;
}

/** This function tells if a ratio is inside the noise floor, from p10 to p90 of the A/A ratios. */
export const insideFloor = (ratio: number, band: NoiseBand): boolean => ratio >= band.p10 && ratio <= band.p90;

const fmt = (x: number, d = 2): string => (Number.isFinite(x) ? x.toFixed(d) : String(x));

/** The verdict of the median ratio of one arm against the noise floor. */
export type ArmVerdict = "inside the noise floor" | "faster" | "slower" | "no noise floor";

/** This function gives the verdict of the median ratio of one arm against the noise floor of a report. */
export function armVerdict(r: PairedRatio, band: NoiseBand | null): ArmVerdict {
  if (band === null) return "no noise floor";
  if (insideFloor(r.median, band)) return "inside the noise floor";
  return r.median < band.p10 ? "faster" : "slower";
}

/** This function gives the sentence of the computer, the mode and the noise floor of a report. */
export function reportText(report: PairedReport): string {
  const e = report.env;
  const floor = report.noiseFloor === null ? "The report has no A/A arm, so it has no noise floor." : `The noise floor (the A/A arm) is ${fmt(report.noiseFloor.median, 3)}, from ${fmt(report.noiseFloor.p10, 3)} to ${fmt(report.noiseFloor.p90, 3)}.`;
  return `The paired times come from ${e.cores} x ${e.cpu} (${e.os} ${e.arch}, Node.js ${e.node}), mode \`${report.mode}\`${report.context ? `, context \`${report.context}\`` : ""}. ${floor}`;
}

/**
 * This function gives the Markdown table of a paired time report: one row for each arm that is not the base or the A/A arm.
 * Each row has the median ratio over the base, p10, p90, the share of the inputs that moved, and the verdict against the noise floor.
 */
export function pairedTable(report: PairedReport): string[] {
  const aa = aaId(report.base);
  const lines = [reportText(report), "", `| arm | inputs | median ratio over \`${report.base}\` | p10 | p90 | moved | verdict |`, "|---|---:|---:|---:|---:|---:|---|"];
  for (const arm of report.arms) {
    if (arm === report.base || arm === aa) continue;
    const r = report.ratios[arm]!;
    const moved = r.moved === null ? "-" : `${Math.round(100 * r.moved)}%`;
    lines.push(`| \`${arm}\` | ${r.inputs} | ${fmt(r.median, 3)} | ${fmt(r.p10, 3)} | ${fmt(r.p90, 3)} | ${moved} | ${armVerdict(r, report.noiseFloor)} |`);
  }
  return lines;
}

/**
 * This function gives the Markdown table of a paired time report with the band of the rounds: one row for each arm and input.
 *
 * - The arms are the arms that are not the base or the A/A arm. The ratio of a row is the median of the arm over the median of the base.
 * - The band of a row is 1 ± the A/A spread of its input: p90 of |r - 1| over the A/A ratios of the rounds (the confirm rule).
 * - The verdict of a row compares its ratio with that band. So a report with one input has a verdict that the noise of its rounds decides.
 */
export function roundsTable(report: PairedReport): string[] {
  const aa = aaId(report.base);
  const lines = [
    reportText(report),
    "",
    "The band of a row is 1 ± the A/A spread of its input: p90 of |r - 1| over the A/A ratios of its rounds. A ratio outside the band is slower or faster.",
    "",
    `| arm | input | ratio over \`${report.base}\` | A/A rounds | A/A band of the rounds | verdict |`,
    "|---|---|---:|---:|---|---|",
  ];
  for (const arm of report.arms) {
    if (arm === report.base || arm === aa) continue;
    for (const r of armRows(report, arm))
      lines.push(`| \`${arm}\` | ${r.input} | ${r.ratio === null ? "-" : fmt(r.ratio, 3)} | ${r.aa.length} | ${r.band === null ? "-" : `${fmt(r.band.lo, 3)} to ${fmt(r.band.hi, 3)}`} | ${r.verdict} |`);
  }
  return lines;
}

/** One arm of `roundsReport`: its id and its rounds. Each round is a list of records of one fresh process. */
export interface RoundsArm<R> {
  readonly id: string;
  readonly rounds: readonly (readonly R[])[];
}

/**
 * This function gives a paired time report from the records of rounds, one fresh process for each arm in each round (mode `fresh`).
 * The arm 0 is the base. An arm with the id `${base}~aa` is the A/A arm.
 * The inputs are the keys of the records of the first round of the base. The time of a key in one round is the median of its records in that round.
 */
export function roundsReport<R>(arms: readonly RoundsArm<R>[], keyOf: (r: R) => string, msOf: (r: R) => number, env: PairedEnv, context?: string): PairedReport {
  const base = arms[0];
  if (base === undefined || arms.length < 2) throw new RangeError("A paired time report needs 2 arms or more.");
  const keys = [...new Set((base.rounds[0] ?? []).map(keyOf))];
  if (keys.length === 0) throw new RangeError(`The first round of the base ${base.id} has no records.`);
  const raw: RawTimes = { ms: new Map(keys.map((k) => [k, new Map(arms.map((a) => [a.id, [] as number[]]))])), peak: new Map(keys.map((k) => [k, new Map<string, number>()])) };
  for (const arm of arms)
    for (const round of arm.rounds) {
      const by = new Map<string, number[]>();
      for (const r of round) by.set(keyOf(r), [...(by.get(keyOf(r)) ?? []), msOf(r)]);
      for (const [k, list] of by) raw.ms.get(k)?.get(arm.id)!.push(quantileOf(list, 0.5));
    }
  const ids: Arm<never>[] = arms.map((a) => ({ id: a.id }));
  const inputs: Input<never>[] = keys.map((id) => ({ id }));
  return pairedReport("fresh", env, context, ids, inputs, raw);
}

/** This function reads paired time reports from a text: one JSON report, a JSON list of reports, or one report on each line. A value that is not a report is an error. */
export function parseReports(text: string): PairedReport[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  let values: unknown[];
  try {
    const one = JSON.parse(trimmed) as unknown;
    values = Array.isArray(one) ? one : [one];
  } catch {
    values = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as unknown);
  }
  for (const v of values) if ((v as { schema?: unknown })?.schema !== "paired-time/1") throw new Error("A value of the file is not a report of schema paired-time/1.");
  return values as PairedReport[];
}
