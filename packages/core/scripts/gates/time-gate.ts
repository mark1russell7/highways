// The time gates of the comparisons of highways over paired time reports (MEASURE-ISOLATE).
// Each comparison times its arms in one job with `measureIsolated`. These functions read its report: the ratios, the A/A noise floor and the verdicts.
// - The verdict of an arm in a table: a median ratio inside the noise floor (p10 to p90 of the A/A ratios) is not a gain and not a loss.
// - The promotion time test reads the reports of several jobs. A check that the A/A arm cannot resolve gives "cannot decide (noise)", and it does not pass.
import { aaId, pairedReport, quantileOf, type Arm, type Input, type Mode, type PairedEnv, type PairedRatio, type PairedReport, type RawTimes } from "./paired.ts";

/** The band of the A/A ratios: p10 to p90. */
export interface NoiseBand {
  readonly p10: number;
  readonly p90: number;
}

/** This function tells if a ratio is inside the noise floor, from p10 to p90 of the A/A ratios. */
export const insideFloor = (ratio: number, band: NoiseBand): boolean => ratio >= band.p10 && ratio <= band.p90;

/** The limits of the time test of `docs/PROMOTION.md`. */
export interface TimeLimits {
  /** The limit of the worst median ratio over the reports. */
  readonly timeRatio: number;
  /** The quantile of the tail. */
  readonly timeTailQ: number;
  /** The limit of the worst tail ratio over the reports. */
  readonly timeTail: number;
  /** The time floor, in ms. An input with the base median and the arm median both below it is not in the tail set. */
  readonly timeFloorMs: number;
}

/** The margin of the resolution: a limit must be above 1.1 times the A/A value of its check. */
export const RESOLUTION_MARGIN = 1.1;
/** The largest spread of the tails of the reports for a valid tail check. The spread is the largest tail over the smallest tail, minus 1. */
export const TAIL_SPREAD = 0.1;
/** The count of the reports (one for each job) of the policy of the promotion time test. */
export const POLICY_JOBS = 5;

/** The status of a time test: `noise` tells that a check cannot decide, and `void` tells that the test has no paired time report. Only `pass` passes. */
export type TimeStatus = "pass" | "fail" | "noise" | "void";

/** One check of the time test: the median or the tail. */
export interface TimeCheck {
  readonly check: "median" | "tail";
  /** The worst value over the reports: the highest median ratio, or the highest tail ratio. */
  readonly worst: number;
  readonly limit: number;
  /** The worst A/A value of the check: the highest p90 of the noise floor, or the highest tail of the A/A ratios. */
  readonly aa: number;
  /** For the tail: the spread of the tail values of the reports. */
  readonly spread?: number;
  /** This value is `false` when the A/A arm cannot resolve the limit. Then the check cannot decide. */
  readonly valid: boolean;
  /** The reason of a check that cannot decide or is not measured. */
  readonly why?: string;
  /** The verdict `not measured` is for a tail with an empty tail set in each job. It is not a pass, and it does not stop a promotion. */
  readonly verdict: "pass" | "fail" | "noise" | "not measured";
}

/** The line of the record for a tail with an empty tail set in each job. */
export const TAIL_NOT_MEASURED = "tail: not measured, no input above timeFloorMs";

/** The result of the time test of a promotion over paired time reports. */
export interface TimeTest {
  /** The worst median ratio of the candidate over the baseline, over the reports. */
  readonly median: number;
  /** The worst tail ratio over the reports: the quantile `timeTailQ` of the ratios of the tail set. */
  readonly tail: number;
  /** This value is `true` only for the status `pass`. A check that cannot decide does not pass. */
  readonly pass: boolean;
  readonly status: TimeStatus;
  /** The count of the reports, one for each job. */
  readonly jobs: number;
  /** The median ratio of each job, in the order of the reports. */
  readonly medians: readonly number[];
  /** The tail ratio of each job, in the order of the reports. A job with an empty tail set gives `null`. */
  readonly tails: readonly (number | null)[];
  /** The CPU model of each job, in the order of the reports. */
  readonly cpus: readonly string[];
  /** The line `TAIL_NOT_MEASURED` when the tail set is empty in each job. */
  readonly note?: string;
  /** The count of the inputs with a ratio in the first report. */
  readonly inputs: number;
  readonly checks: readonly TimeCheck[];
  /** This value is `true` when the test passes and the worst median ratio is below 1 and below the lowest p10 of the noise floor. */
  readonly faster: boolean;
  /** The reason of a `void` status. */
  readonly reason?: string;
  /** The computer and the mode of the first report. */
  readonly env?: PairedEnv;
  readonly mode?: Mode;
}

/**
 * This function gives the time test of a candidate against a baseline over paired time reports (MEASURE-ISOLATE). Each report comes from one job.
 *
 * - The reports must have the mode `process`, the base `baseline`, the arm `candidate` and the A/A arm. With `keys`, only those input ids count.
 * - The ratio of an input is the ratio of the report: the median of the arm over the median of the base.
 * - The median check: the worst median ratio over the reports is at `timeRatio` or below. It is valid only when `timeRatio` is above 1.1 times the worst A/A p90.
 * - The tail check uses the tail set. An input with the base median and the arm median both below `timeFloorMs` is not in it.
 * - The tail check: the worst quantile `timeTailQ` over the reports is at `timeTail` or below.
 * - The tail check is valid only when `timeTail` is above 1.1 times the worst A/A tail, and the spread of the tails is at most 0.1.
 * - The A/A tail uses the A/A ratios of the same tail set. An empty tail set in only some reports makes the tail check not valid.
 * - An empty tail set in each report gives the line `TAIL_NOT_MEASURED` in the record. This tail is not a pass, and it does not stop a promotion.
 * - A failed valid check fails the test. Else a check that cannot decide gives `noise`, and the test does not pass.
 * - With no report or no input, the status is `void` and the test fails (FAIL-CLOSED).
 */
export function pairedTimeTest(reports: readonly PairedReport[], baseline: string, candidate: string, keys: ReadonlySet<string> | undefined, limits: TimeLimits): TimeTest {
  const aa = aaId(baseline);
  const mine = reports.filter((r) => r.mode === "process" && r.base === baseline && r.arms.includes(candidate) && r.arms.includes(aa));
  const empty = { median: Number.NaN, tail: Number.NaN, pass: false, status: "void" as const, jobs: mine.length, medians: [], tails: [], cpus: mine.map((r) => r.env.cpu), inputs: 0, checks: [], faster: false };
  if (mine.length === 0) return { ...empty, reason: `no paired time report of mode process has the base ${baseline}, the arm ${candidate} and the A/A arm` };
  const at = { env: mine[0]!.env, mode: mine[0]!.mode };
  // The values of each report: the median ratio, the tail ratio, the A/A tail and the noise floor.
  const per = mine.map((report) => {
    const all: number[] = [];
    const tail: number[] = [];
    const aaTail: number[] = [];
    for (const input of report.inputs) {
      if (keys !== undefined && !keys.has(input.id)) continue;
      const c = input.ratio[candidate];
      const a = input.ratio[aa];
      if (c === undefined || a === undefined) continue;
      all.push(c);
      const b = input.median[baseline] ?? Number.NaN;
      const m = input.median[candidate] ?? Number.NaN;
      if (b < limits.timeFloorMs && m < limits.timeFloorMs) continue;
      tail.push(c);
      aaTail.push(a);
    }
    return { all, tail, aaTail, floor: report.noiseFloor };
  });
  if (per.some((x) => x.all.length === 0)) return { ...empty, ...at, reason: "a paired time report has no input of this reading" };
  const max = (xs: readonly number[]): number => xs.reduce((x, y) => Math.max(x, y), Number.NEGATIVE_INFINITY);
  const min = (xs: readonly number[]): number => xs.reduce((x, y) => Math.min(x, y), Number.POSITIVE_INFINITY);
  const medians = per.map((x) => quantileOf(x.all, 0.5));
  // A report with no A/A noise floor gives an A/A value that is not a number, so its check cannot decide.
  const aaP90 = max(per.map((x) => x.floor?.p90 ?? Number.NaN));
  const worstMedian = max(medians);
  const medianCheck = check("median", worstMedian, limits.timeRatio, aaP90, undefined);
  // A report with an empty tail set gives no tail. An empty tail set in each report gives a tail that is not measured. An empty tail set in only some reports cannot decide.
  const tails = per.map((x) => (x.tail.length === 0 ? null : quantileOf(x.tail, limits.timeTailQ)));
  const real = tails.filter((x): x is number => x !== null);
  const aaTail = max(per.filter((x) => x.tail.length > 0).map((x) => quantileOf(x.aaTail, limits.timeTailQ)));
  const some = `${tails.length - real.length} of ${tails.length} jobs have an empty tail set`;
  const tailCheck: TimeCheck =
    real.length === 0
      ? { check: "tail", worst: Number.NaN, limit: limits.timeTail, aa: Number.NaN, valid: true, why: TAIL_NOT_MEASURED, verdict: "not measured" }
      : real.length < tails.length
        ? { check: "tail", worst: max(real), limit: limits.timeTail, aa: aaTail, valid: false, why: some, verdict: "noise" }
        : check("tail", max(real), limits.timeTail, aaTail, max(real) / min(real) - 1);
  const checks = [medianCheck, tailCheck];
  const status: TimeStatus = checks.some((c) => c.verdict === "fail") ? "fail" : checks.some((c) => c.verdict === "noise") ? "noise" : "pass";
  const p10 = min(per.map((x) => x.floor?.p10 ?? Number.NaN));
  const faster = status === "pass" && worstMedian < 1 && worstMedian < p10;
  const record = { jobs: mine.length, medians, tails, cpus: mine.map((r) => r.env.cpu), ...(tailCheck.verdict === "not measured" ? { note: TAIL_NOT_MEASURED } : {}) };
  return { median: worstMedian, tail: tailCheck.worst, pass: status === "pass", status, ...record, inputs: per[0]!.all.length, checks, faster, ...at };
}

/** This function gives one check of the time test, with its resolution from the A/A value and, for the tail, the spread. */
function check(name: "median" | "tail", worst: number, limit: number, aa: number, spread: number | undefined): TimeCheck {
  const resolved = limit > aa * RESOLUTION_MARGIN;
  const steady = spread === undefined || spread <= TAIL_SPREAD;
  const valid = resolved && steady;
  const why = !resolved
    ? `the A/A ${name === "median" ? "p90" : "tail"} ${fmt(aa, 3)} times ${RESOLUTION_MARGIN} is not below the limit ${limit}`
    : !steady
      ? `the spread ${fmt(spread!, 3)} of the tails of the reports is above ${TAIL_SPREAD}`
      : undefined;
  const verdict = !valid ? "noise" : worst <= limit ? "pass" : "fail";
  return { check: name, worst, limit, aa, ...(spread === undefined ? {} : { spread }), valid, ...(why === undefined ? {} : { why }), verdict };
}

const fmt = (x: number, d = 2): string => (Number.isFinite(x) ? x.toFixed(d) : String(x));

/** This function gives the line of a time test for a summary. The quantile `q` names the tail. */
export function timeText(t: TimeTest, q: number): string {
  if (t.status === "void") return `Time: no result (${t.reason ?? "no paired time report"}), so the time test fails.`;
  const jobs = `${t.jobs} ${t.jobs === 1 ? "job" : "jobs"} (the policy is ${POLICY_JOBS})`;
  const head = `Time: the worst median ${fmt(t.median)} and the worst q${q} ${fmt(t.tail)} over ${jobs} and ${t.inputs} inputs`;
  const undecided = t.checks.filter((c) => c.verdict === "noise");
  if (t.status === "noise") return `${head}: cannot decide (noise). ${undecided.map((c) => `The ${c.check} check cannot decide: ${c.why}.`).join(" ")} This is not a pass.`;
  const failed = t.checks.filter((c) => c.verdict === "fail");
  if (t.status === "fail") return `${head}: fail. ${failed.map((c) => `The ${c.check} ${fmt(c.worst)} is above ${c.limit}.`).join(" ")}`;
  return `${head}: ${t.faster ? "pass, and faster than the baseline" : "pass"}.${t.note === undefined ? "" : ` The record has the line \`${t.note}\`.`}`;
}

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
