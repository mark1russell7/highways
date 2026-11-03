// The time test of a promotion (WIN-TEST-HOME). Its rule is the block `win-test` of `docs/WIN-TEST.md` of rigor, at the commit of `docs/shared.lock.json`.
// The home `@mark1russell7/rigor-bench` gives each step of the verdict: `balanceOrders`, `pooledVerdict` and `limitVerdict`.
// This module maps the paired time reports of the jobs to the records of the home, and it reads the outcomes of the home. It has no verdict rule of its own.
import { balanceOrders, limitVerdict, pooledVerdict, type JobRecords, type LimitOutcome, type PairedTime, type PooledVerdict, type TimeOutcome } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import { aaId, firstOf, type Mode, type PairedEnv, type PairedReport } from "./paired.ts";

/** The settings of the time test. The block `win-test` of the home names each of them. */
export interface WinTimeParams {
  /** The half width of the margin on a log scale. An interval in `[exp(-timeMargin), exp(timeMargin)]` is `same`. */
  readonly timeMargin: number;
  /** The largest A/A spread on a log scale. A larger spread gives `cannot decide`. It also limits the A/A median ratio. */
  readonly noiseCap: number;
  /** The count of the CI jobs of the policy. With fewer jobs, the test cannot decide. */
  readonly timeJobs: number;
  /** The smallest median time in milliseconds of a case of the tail set. */
  readonly timeFloorMs: number;
  /** The largest ratio of a case of the tail set. */
  readonly timeTail: number;
  /** The share of the tail set that is `within` the limit `timeTail`. */
  readonly timeTailQ: number;
  /** The level of the interval of each case of the tail set. */
  readonly timeTailLevel: number;
}

/** The line of the record for an empty tail set. */
export const TAIL_NOT_MEASURED = "tail: not measured, no input above timeFloorMs";

/** The status of a time test. The status `void` tells that the test has no records. Only `pass` passes. */
export type TimeStatus = "pass" | "fail" | "cannot decide" | "void";

/** The verdict of one job alone, with the CPU model of the job. */
export interface JobTime {
  readonly job: string;
  readonly cpu: string;
  readonly outcome: TimeOutcome;
}

/** One case of the tail set, with the outcome of `limitVerdict`. */
export interface TailCase {
  readonly case: string;
  readonly ratio: number;
  /** The high end of the interval of the case, times the high end of the A/A band. */
  readonly bound: number;
  readonly outcome: LimitOutcome;
}

/** The time tail of the test. */
export interface TimeTail {
  readonly status: "pass" | "fail" | "cannot decide" | "not measured";
  readonly cases: readonly TailCase[];
  /** The count of the cases of the tail set that are not `within`. */
  readonly notWithin: number;
  /** The count of the cases of the tail set that are `beyond`. */
  readonly beyond: number;
  readonly reason: string;
}

/** The result of the time test of a promotion. */
export interface TimeTest {
  readonly status: TimeStatus;
  /** This value is `true` only for the status `pass`. */
  readonly pass: boolean;
  /** The outcome of `pooledVerdict`, or undefined for the status `void`. */
  readonly outcome: TimeOutcome | undefined;
  /** The reason of the status, in words. */
  readonly reason: string;
  /** The count of the reports of mode `fresh` of the pair, one for each job. */
  readonly jobs: number;
  /** The count of the jobs of the policy, `timeJobs`. */
  readonly policy: number;
  /** The count of the reports of the pair in mode `process`. They do not count (BENCH-FRESH-CASES). */
  readonly inProcess: number;
  /** The verdict and the CPU model of each job. */
  readonly jobVerdicts: readonly JobTime[];
  /** The jobs whose own outcome is the opposite direction of the pooled outcome. */
  readonly opposed: readonly string[];
  /** The count of the records that `balanceOrders` removed. */
  readonly trimmed: number;
  /** The pooled interval of the candidate median over the A/A median. */
  readonly interval?: { readonly estimate: number; readonly low: number; readonly high: number };
  /** The A/A median ratio and the A/A spread of the merged records. */
  readonly aaMedian?: number;
  readonly spread?: number;
  readonly noiseCap: number;
  readonly margin: number;
  /** The count of the inputs with records in the merged candidate pair. */
  readonly inputs: number;
  readonly tail?: TimeTail;
  /** The line `TAIL_NOT_MEASURED` for an empty tail set. */
  readonly note?: string;
  /** This value is `true` when the test passes with the pooled outcome `faster`. */
  readonly faster: boolean;
  /** The computer and the mode of the first report. */
  readonly env?: PairedEnv;
  readonly mode?: Mode;
}

/** The value `ok` tells that a time is a finite number above 0. */
const ok = (ms: number | undefined): ms is number => typeof ms === "number" && Number.isFinite(ms) && ms > 0;

/**
 * This function gives the records of the home for one arm against the base of a report. Each input is one case of the home.
 *
 * - The round of a record is `offset + k` for the round `k` of the report. Thus the records of all jobs merge.
 * - The field `first` comes from the mode, the order and the round offset of the report (`firstOf`).
 * - With `keys`, only those input ids count. A round with a time that is not a finite number above 0 is not in the list.
 */
export function reportRecords(report: PairedReport, arm: string, keys: ReadonlySet<string> | undefined, offset: number): PairedTime[] {
  const baseAt = report.arms.indexOf(report.base);
  const at = report.arms.indexOf(arm);
  if (baseAt < 0 || at < 0) return [];
  const out: PairedTime[] = [];
  for (const input of report.inputs) {
    if (keys !== undefined && !keys.has(input.id)) continue;
    const base = input.ms[report.base] ?? [];
    const other = input.ms[arm] ?? [];
    for (let k = 0; k < Math.min(base.length, other.length); k++) {
      const a = base[k];
      const b = other[k];
      if (ok(a) && ok(b)) out.push({ case: input.id, round: offset + k, first: firstOf(report, k, baseAt, at), a, b });
    }
  }
  return out;
}

/**
 * This function gives the job records of the reports for `pooledVerdict`.
 * The label of a job is the field `job` of its report, else its place in the list from 1.
 * The round offset is the field `roundOffset`, else the place from 0 times the most rounds of a report.
 */
export function jobRecords(reports: readonly PairedReport[], candidate: string, keys: ReadonlySet<string> | undefined): JobRecords[] {
  const span = Math.max(1, ...reports.flatMap((r) => r.inputs.flatMap((i) => Object.values(i.ms).map((ms) => ms.length))));
  return reports.map((report, i) => {
    const offset = report.roundOffset ?? i * span;
    return {
      job: report.job ?? String(i + 1),
      candidate: reportRecords(report, candidate, keys, offset),
      aa: reportRecords(report, aaId(report.base), keys, offset),
    };
  });
}

/** This function gives the count of the jobs against the policy, for example "1 job of 5". */
const jobsOf = (jobs: number, policy: number): string => `${jobs} ${jobs === 1 ? "job" : "jobs"} of ${policy}`;

/**
 * This function gives the time tail. The tail set holds the cases with a median time of the default or of the candidate of `timeFloorMs` or more.
 * `limitVerdict` of the home gives the outcome of each case, against the A/A pair of the merged records.
 */
function timeTail(candidate: readonly PairedTime[], aa: readonly PairedTime[], p: WinTimeParams): TimeTail {
  const byCase = new Map<string, PairedTime[]>();
  for (const r of candidate) byCase.set(r.case, [...(byCase.get(r.case) ?? []), r]);
  const set = new Set([...byCase].filter(([, rs]) => median(rs.map((r) => r.a)) >= p.timeFloorMs || median(rs.map((r) => r.b)) >= p.timeFloorMs).map(([c]) => c));
  if (set.size === 0) return { status: "not measured", cases: [], notWithin: 0, beyond: 0, reason: TAIL_NOT_MEASURED };
  const limit = limitVerdict(
    candidate.filter((r) => set.has(r.case)),
    aa,
    { limit: p.timeTail, caseLevel: p.timeTailLevel },
  );
  const cases = limit.cases.map((c): TailCase => ({ case: c.case, ratio: c.ratio, bound: c.bound, outcome: c.outcome }));
  const notWithin = cases.filter((c) => c.outcome !== "within").length;
  const beyond = cases.filter((c) => c.outcome === "beyond").length;
  if (limit.band === undefined) return { status: "cannot decide", cases, notWithin, beyond, reason: limit.reason };
  // The share 1 - timeTailQ of the tail set. The small tolerance keeps a share such as 0.05 of 20 cases at 1 case.
  const allowed = (1 - p.timeTailQ) * cases.length + 1e-9;
  const counts = `${notWithin} of ${cases.length} cases of the tail set are not within ${p.timeTail}, and ${beyond} are beyond it`;
  if (notWithin <= allowed) return { status: "pass", cases, notWithin, beyond, reason: `${counts}. The share ${1 - p.timeTailQ} permits ${Math.floor(allowed)}.` };
  if (beyond > allowed) return { status: "fail", cases, notWithin, beyond, reason: `${counts}. The share ${1 - p.timeTailQ} permits ${Math.floor(allowed)}.` };
  return { status: "cannot decide", cases, notWithin, beyond, reason: `${counts}. Too many cases are not within, and too few are beyond.` };
}

/**
 * This function gives the time test of a candidate against a baseline over the paired time reports of the jobs.
 *
 * - The reports have the mode `fresh`, the base `baseline`, the arm `candidate` and the A/A arm. A report of mode `process` does not count.
 * - `pooledVerdict` of the home gives the pooled outcome, with the rule `difference`, the margin `timeMargin` and the cap `noiseCap`.
 * - It also gives the guard of the jobs: one job alone in the opposite direction makes the outcome `cannot decide`.
 * - The time tail uses `limitVerdict` of the home on the merged rounds, balanced by `balanceOrders`.
 * - The outcome `slower` or a failed tail fails the test. The outcome `faster` or `same` with a tail that passes or is not measured passes it.
 * - Each other result cannot decide, and so does a test with fewer jobs than `timeJobs` (FAIL-CLOSED).
 * - With no report of the pair or no input, the status is `void`, and the test fails.
 */
export function promotionTimeTest(reports: readonly PairedReport[], baseline: string, candidate: string, keys: ReadonlySet<string> | undefined, p: WinTimeParams): TimeTest {
  const aa = aaId(baseline);
  const pair = reports.filter((r) => r.base === baseline && r.arms.includes(candidate) && r.arms.includes(aa));
  const matched = pair.filter((r) => r.mode === "fresh");
  const inProcess = pair.length - matched.length;
  const cpuOf = new Map<string, string>();
  const empty = { pass: false, status: "void" as const, outcome: undefined, jobs: matched.length, policy: p.timeJobs, inProcess, jobVerdicts: [], opposed: [], trimmed: 0, noiseCap: p.noiseCap, margin: p.timeMargin, inputs: 0, faster: false };
  if (matched.length === 0 && inProcess > 0)
    return { ...empty, reason: `cannot decide: the ${inProcess} paired time reports of the pair have the mode process, and each case of the time test runs in its own fresh processes` };
  if (matched.length === 0) return { ...empty, reason: `no paired time report of mode fresh has the base ${baseline}, the arm ${candidate} and the A/A arm` };
  const at = { env: matched[0]!.env, mode: matched[0]!.mode };
  const jobs = jobRecords(matched, candidate, keys);
  jobs.forEach((j, i) => cpuOf.set(j.job, matched[i]!.env.cpu));
  if (jobs.some((j) => j.candidate.length === 0)) return { ...empty, ...at, reason: "a paired time report has no input of this reading" };
  let pooled: PooledVerdict;
  try {
    pooled = pooledVerdict(jobs, { rule: "difference", margin: p.timeMargin, noiseCap: p.noiseCap });
  } catch (error) {
    // The home refuses two jobs with one label, or two jobs with a record of one case and one round (FAIL-CLOSED).
    return { ...empty, ...at, reason: error instanceof Error ? error.message : String(error) };
  }
  const merged = balanceOrders(jobs.flatMap((j) => j.candidate)).records;
  const mergedAa = balanceOrders(jobs.flatMap((j) => j.aa)).records;
  const tail = timeTail(merged, mergedAa, p);
  const noise = pooled.pooled.noise;
  const interval = pooled.pooled.interval;
  const facts = {
    outcome: pooled.outcome,
    jobs: matched.length,
    policy: p.timeJobs,
    inProcess,
    jobVerdicts: pooled.jobs.map((j): JobTime => ({ job: j.job, cpu: cpuOf.get(j.job) ?? "unknown", outcome: j.verdict.outcome })),
    opposed: pooled.opposed,
    trimmed: pooled.trimmed,
    ...(interval === undefined ? {} : { interval: { estimate: interval.estimate, low: interval.low, high: interval.high } }),
    ...(noise?.aaMedian === undefined ? {} : { aaMedian: noise.aaMedian }),
    ...(noise?.spread === undefined ? {} : { spread: noise.spread }),
    noiseCap: p.noiseCap,
    margin: p.timeMargin,
    inputs: new Set(merged.map((r) => r.case)).size,
    tail,
    ...(tail.status === "not measured" ? { note: TAIL_NOT_MEASURED } : {}),
    ...at,
  };
  const few = matched.length < p.timeJobs;
  const status: TimeStatus = few
    ? "cannot decide"
    : pooled.outcome === "slower" || tail.status === "fail"
      ? "fail"
      : pooled.outcome === "cannot decide" || tail.status === "cannot decide"
        ? "cannot decide"
        : "pass";
  const reason = few ? `${jobsOf(matched.length, p.timeJobs)}${inProcess > 0 ? `, ${inProcess} of mode process` : ""}` : pooled.reason;
  return { ...facts, status, pass: status === "pass", reason, faster: status === "pass" && pooled.outcome === "faster" };
}

const fmt = (x: number | undefined, d = 3): string => (x !== undefined && Number.isFinite(x) ? x.toFixed(d) : "-");

/** This function gives the lines of a time test for a summary. */
export function timeText(t: TimeTest): string[] {
  if (t.status === "void") return [`Time: no result (${t.reason}), so the time test fails.`];
  const jobs = jobsOf(t.jobs, t.policy);
  const word = t.status === "pass" ? (t.faster ? "pass, and faster than the baseline" : "pass") : t.status;
  const span = t.interval === undefined ? "no interval" : `the interval ${fmt(t.interval.low)} to ${fmt(t.interval.high)}`;
  const lines = [`Time: the pooled outcome "${t.outcome}" with ${span} over ${jobs} and ${t.inputs} inputs: ${word}.`];
  if (t.jobs < t.policy) lines[0] += " This is not a pass, and it does not promote.";
  else if (t.status === "cannot decide") lines[0] += " This is not a pass.";
  lines.push(`  - The reason of the home: ${t.reason}`);
  lines.push(`  - The A/A median ratio ${fmt(t.aaMedian)}, the A/A spread ${fmt(t.spread)}, the noise cap ${t.noiseCap} and the margin ${t.margin}. The balance removed ${t.trimmed} records.`);
  lines.push(`  - The verdict of each job: ${t.jobVerdicts.map((j) => `${j.job}: ${j.outcome} (${j.cpu})`).join(", ")}.${t.opposed.length > 0 ? ` The opposed jobs: ${t.opposed.join(", ")}.` : ""}`);
  if (t.tail !== undefined) {
    const shown = t.tail.cases.filter((c) => c.outcome !== "within").slice(0, 5);
    const more = shown.length > 0 ? ` The cases that are not within: ${shown.map((c) => `${c.case} ${fmt(c.ratio)} (bound ${fmt(c.bound)}, ${c.outcome})`).join(", ")}.` : "";
    lines.push(t.tail.status === "not measured" ? `  - The record has the line \`${TAIL_NOT_MEASURED}\`.` : `  - The time tail: ${t.tail.status}. ${t.tail.reason}${more}`);
  }
  return lines;
}
