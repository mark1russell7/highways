// The time gates of the comparisons of highways over paired time reports (MEASURE-ISOLATE).
// Each comparison times its arms in one job with `measureIsolated`. These functions read its report: the ratios, the A/A noise floor and the verdicts.
// - The verdict of an arm in a table: a median ratio inside the noise floor (p10 to p90 of the A/A ratios) is not a gain and not a loss.
// - The verdict of an arm on one input in `roundsTable`: the band is 1 ± the A/A spread of the rounds of the input (the confirm rule), so one input has a band too.
// - The promotion time test reads the reports of several jobs. A check that the A/A arm cannot resolve gives "cannot decide (noise)", and it does not pass.
import type { NoRead } from "./annotate.ts";
import { armRows } from "./pair-confirm.ts";
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
  /** The count of the reports (one for each job) of the policy. With fewer reports, each check cannot decide, and the test does not pass. */
  readonly timeJobs: number;
  /** The quantile of the tail. */
  readonly timeTailQ: number;
  /** The limit of the worst tail ratio over the reports. */
  readonly timeTail: number;
  /** The time floor, in ms. An input with the base median and the arm median both below it is not in the tail set. */
  readonly timeFloorMs: number;
}

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
  /** The spread of the A/A values of the check over the reports: the largest value minus the smallest value. */
  readonly aaSpread: number;
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
  /** The count of the jobs of the policy, `timeJobs`. */
  readonly policy: number;
  /** The count of the reports that do not count, because their A/A band does not contain 1. A new job replaces each of them. */
  readonly outside: number;
  /** The count of the reports of the pair in mode `process`. They do not count, because they timed each case after other cases in one process (BENCH-FRESH-CASES). */
  readonly inProcess: number;
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
 * - The reports must have the mode `fresh`, the base `baseline`, the arm `candidate` and the A/A arm. With `keys`, only those input ids count.
 * - Each case of a time gate runs in its own fresh processes (BENCH-FRESH-CASES). A report of mode `process` timed each case after other cases in one process.
 * - A report of mode `process` does not count. With only such reports, the status is `void` with the reason, and the test does not pass.
 * - The ratio of an input is the ratio of the report: the median of the arm over the median of the base.
 * - The median check: the worst median ratio over the reports is at `timeRatio` or below. It is valid only when `timeRatio` is above the worst A/A p90 plus the spread of the A/A p90 values.
 * - The tail check uses the tail set. An input with the base median and the arm median both below `timeFloorMs` is not in it.
 * - The tail check: the worst quantile `timeTailQ` over the reports is at `timeTail` or below.
 * - The tail check is valid only when `timeTail` is above the worst A/A tail plus the spread of the A/A tails.
 * - Each check decides on the worst job, so a candidate that passes in 4 jobs and not in the fifth fails.
 * - The A/A tail uses the A/A ratios of the same tail set. An empty tail set in only some reports makes the tail check not valid.
 * - An empty tail set in each report gives the line `TAIL_NOT_MEASURED` in the record. This tail is not a pass, and it does not stop a promotion.
 * - A failed valid check fails the test. Else a check that cannot decide gives `noise`, and the test does not pass.
 * - A report counts only when its A/A band from p10 to p90 contains 1. A report with a band that does not contain 1 measured the runner.
 * - With fewer reports than `timeJobs`, each check gives "cannot decide (1 job of 5)" with the real counts. The test does not pass (FAIL-CLOSED).
 * - With no report or no input, the status is `void` and the test fails (FAIL-CLOSED).
 */
export function pairedTimeTest(reports: readonly PairedReport[], baseline: string, candidate: string, keys: ReadonlySet<string> | undefined, limits: TimeLimits): TimeTest {
  const aa = aaId(baseline);
  const pair = reports.filter((r) => r.base === baseline && r.arms.includes(candidate) && r.arms.includes(aa));
  // Each case runs in its own fresh processes (BENCH-FRESH-CASES, STRATEGY.md 2026-11-02). A report of mode process does not count.
  const matched = pair.filter((r) => r.mode === "fresh");
  const inProcess = pair.length - matched.length;
  // A job counts only when its A/A band contains 1. A job with a band that does not contain 1 measured the runner (STRATEGY.md 2026-11-02).
  const mine = matched.filter((r) => r.noiseFloor === null || (r.noiseFloor.p10 <= 1 && r.noiseFloor.p90 >= 1));
  const outside = matched.length - mine.length;
  const empty = {
    median: Number.NaN,
    tail: Number.NaN,
    pass: false,
    status: "void" as const,
    jobs: mine.length,
    policy: limits.timeJobs,
    outside,
    inProcess,
    medians: [],
    tails: [],
    cpus: mine.map((r) => r.env.cpu),
    inputs: 0,
    checks: [],
    faster: false,
  };
  if (matched.length === 0 && inProcess > 0)
    return { ...empty, reason: `cannot decide: the ${inProcess} paired time reports of the pair have the mode process, and each case of the time test runs in its own fresh processes` };
  if (matched.length === 0) return { ...empty, reason: `no paired time report of mode fresh has the base ${baseline}, the arm ${candidate} and the A/A arm` };
  if (mine.length === 0) return { ...empty, reason: `the A/A band of each of the ${outside} paired time reports does not contain 1` };
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
  const aaP90s = per.map((x) => x.floor?.p90 ?? Number.NaN);
  const worstMedian = max(medians);
  const medianCheck = check("median", worstMedian, limits.timeRatio, aaP90s);
  // A report with an empty tail set gives no tail. An empty tail set in each report gives a tail that is not measured. An empty tail set in only some reports cannot decide.
  const tails = per.map((x) => (x.tail.length === 0 ? null : quantileOf(x.tail, limits.timeTailQ)));
  const real = tails.filter((x): x is number => x !== null);
  const aaTails = per.filter((x) => x.tail.length > 0).map((x) => quantileOf(x.aaTail, limits.timeTailQ));
  const some = `${tails.length - real.length} of ${tails.length} jobs have an empty tail set`;
  const tailCheck: TimeCheck =
    real.length === 0
      ? { check: "tail", worst: Number.NaN, limit: limits.timeTail, aa: Number.NaN, aaSpread: Number.NaN, valid: true, why: TAIL_NOT_MEASURED, verdict: "not measured" }
      : real.length < tails.length
        ? { check: "tail", worst: max(real), limit: limits.timeTail, aa: max(aaTails), aaSpread: max(aaTails) - min(aaTails), valid: false, why: some, verdict: "noise" }
        : check("tail", max(real), limits.timeTail, aaTails);
  // Too few jobs: each check cannot decide, whatever its value (FAIL-CLOSED).
  const notCounted = [...(outside > 0 ? [`${outside} with an A/A band that does not contain 1`] : []), ...(inProcess > 0 ? [`${inProcess} of mode process`] : [])];
  const few = mine.length < limits.timeJobs ? [jobsOf(mine.length, limits.timeJobs), ...notCounted].join(", ") : undefined;
  const checks = few === undefined ? [medianCheck, tailCheck] : [medianCheck, tailCheck].map((c): TimeCheck => ({ ...c, valid: false, why: few, verdict: "noise" }));
  const status: TimeStatus = checks.some((c) => c.verdict === "fail") ? "fail" : checks.some((c) => c.verdict === "noise") ? "noise" : "pass";
  const p10 = min(per.map((x) => x.floor?.p10 ?? Number.NaN));
  const faster = status === "pass" && worstMedian < 1 && worstMedian < p10;
  const record = { jobs: mine.length, policy: limits.timeJobs, outside, inProcess, medians, tails, cpus: mine.map((r) => r.env.cpu), ...(tailCheck.verdict === "not measured" ? { note: TAIL_NOT_MEASURED } : {}) };
  return { median: worstMedian, tail: tailCheck.worst, pass: status === "pass", status, ...record, inputs: per[0]!.all.length, checks, faster, ...at };
}

/**
 * This function gives one check of the time test, with its resolution from the A/A values of the reports.
 * The resolution is the worst A/A value plus the spread of the A/A values, with no margin factor (STRATEGY.md 2026-11-02).
 */
function check(name: "median" | "tail", worst: number, limit: number, aaValues: readonly number[]): TimeCheck {
  const aa = aaValues.reduce((x, y) => Math.max(x, y), Number.NEGATIVE_INFINITY);
  const aaSpread = aa - aaValues.reduce((x, y) => Math.min(x, y), Number.POSITIVE_INFINITY);
  const valid = limit > aa + aaSpread;
  const why = valid ? undefined : `the A/A ${name === "median" ? "p90" : "tail"} ${fmt(aa, 3)} plus its spread ${fmt(aaSpread, 3)} is not below the limit ${limit}`;
  const verdict = !valid ? "noise" : worst <= limit ? "pass" : "fail";
  return { check: name, worst, limit, aa, aaSpread, valid, ...(why === undefined ? {} : { why }), verdict };
}

const fmt = (x: number, d = 2): string => (Number.isFinite(x) ? x.toFixed(d) : String(x));

/** This function gives the count of the jobs against the policy, for example "1 job of 5". */
const jobsOf = (jobs: number, policy: number): string => `${jobs} ${jobs === 1 ? "job" : "jobs"} of ${policy}`;

/** This function gives the line of a time test for a summary. The quantile `q` names the tail. */
export function timeText(t: TimeTest, q: number): string {
  if (t.status === "void") return `Time: no result (${t.reason ?? "no paired time report"}), so the time test fails.`;
  const jobs = jobsOf(t.jobs, t.policy);
  const head = `Time: the worst median ${fmt(t.median)} and the worst q${q} ${fmt(t.tail)} over ${jobs} and ${t.inputs} inputs`;
  if (t.jobs < t.policy) return `${head}: cannot decide (${jobs}). This is not a pass, and it does not promote.`;
  const undecided = t.checks.filter((c) => c.verdict === "noise");
  if (t.status === "noise") return `${head}: cannot decide (noise). ${undecided.map((c) => `The ${c.check} check cannot decide: ${c.why}.`).join(" ")} This is not a pass.`;
  const failed = t.checks.filter((c) => c.verdict === "fail");
  if (t.status === "fail") return `${head}: fail. ${failed.map((c) => `The ${c.check} ${fmt(c.worst)} is above ${c.limit}.`).join(" ")}`;
  if (t.note !== undefined) return `${head}: pass on the median${t.faster ? ", and faster than the baseline" : ""}. The tail check has no read (\`${t.note}\`), so this is not a pass of the tail.`;
  return `${head}: ${t.faster ? "pass, and faster than the baseline" : "pass"}.`;
}

/**
 * This function gives the facts of a time test that cannot read a check, for a warning on the check line (NO-READ-LINE).
 * A void test, too few jobs, a check that cannot decide and a tail with no input above the floor are each a "no read".
 * A test that reads each check gives `undefined`.
 */
export function timeNoRead(t: TimeTest): NoRead | undefined {
  if (t.status === "void") return { cases: ["the time test"], why: t.reason ?? "no paired time report", cpus: t.cpus };
  const over = `over ${t.inputs} inputs`;
  if (t.jobs < t.policy) return { cases: [`the median ${over}`, `the tail ${over}`], why: `${jobsOf(t.jobs, t.policy)}, so the checks cannot decide`, cpus: t.cpus };
  const undecided = t.checks.filter((c) => c.verdict === "noise" || c.verdict === "not measured");
  if (undecided.length === 0) return undefined;
  return { cases: undecided.map((c) => `the ${c.check} ${over}`), why: undecided.map((c) => c.why ?? c.verdict).join(", and "), cpus: t.cpus };
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
