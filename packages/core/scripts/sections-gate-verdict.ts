// The verdict of the sections time gate (GATE-LIMITS slices 1 to 3). The workflow `Sections gate` (.github/workflows/sections-gate.yml) starts it.
// One job times `sections-tree` on the board of the bisect (10 000 nodes) in fresh processes, with four arms in turn:
// the parent of the pull request, the head, the A/A copy of the parent and the fixed base of `data/sections-gate/fixed-base.json`.
// `armOrder` of the bench home `@mark1russell7/rigor-bench` gives the order of the arms in each round. The report keeps the order of each round.
// The gate has two checks (docs/PROMOTION.md, "The sections time gate"):
// - Against the parent: `timeVerdict` of the home decides, with the options of `gateOptions`.
//   These options are the noise cap `NOISE_CAP`, the pool of `data/sections-gate/aa-pool.json` and the floor `PARENT_FLOOR`.
//   The outcome `slower` fails, and `same` and `faster` pass.
// - Against the fixed base: `limitVerdict` of the home decides the claim "head / fixed base is at most `FIXED_LIMIT`".
//   The A/A rounds of the same run give its noise (`aaFrom: "rounds"`). The outcome `beyond` fails, and `within` passes.
//   A check against the parent alone misses a slow drift in many small steps.
// A check that cannot decide starts the job `retry` on a fresh runner, with `RETRY_FACTOR` times the rounds.
// A second run that cannot decide is a no read, and a no read fails. So a run that cannot decide does not pass at any time.
// This module imports only node modules, the gates and types, so a job with no installed packages can start it.
// Only the caller calls the home: `scripts/gates/home-verdict.ts` gives the verdicts. `homeRecord` and `fixedRecord` keep their facts in the record.
import type { LimitOutcome, LimitVerdict, PairedTime, PoolOptions, TimeOutcome, TimeVerdict, VerdictOptions } from "@mark1russell7/rigor-bench";
import { aaId, type PairedReport, type RecordEnv } from "./gates/paired.ts";
import { COMMIT_ARM, PARENT_ARM, aaRatios, armRows, spreadOf, type ArmRow } from "./gates/pair-confirm.ts";
import { InputError } from "./gates/inputs.ts";
import { type Side } from "./sections-confirm-verdict.ts";

/** The router of the gate. SECTIONS-SLOW found its drift. */
export const GATE_ROUTER = "sections-tree";
/**
 * The timed rounds of each arm in the first run by default. In each 2 rounds, `armOrder` puts each arm of a pair first one time.
 * The limit verdict needs 6 rounds or more for an interval at the level 0.95.
 */
export const GATE_ROUNDS = 10;
/** The rounds of the second run, the job `retry`, are this factor times the rounds of the first run. */
export const RETRY_FACTOR = 2;
/** The most timed rounds of one run. The time-out of the job `retry` holds 20 rounds. */
export const GATE_MAX_ROUNDS = 20;

/**
 * This function gives the timed rounds of each arm in a run: `rounds` in the first run.
 * The second run has `RETRY_FACTOR` times `rounds`, at most `GATE_MAX_ROUNDS`.
 */
export const attemptRounds = (rounds: number, attempt: 1 | 2): number => (attempt === 1 ? rounds : Math.min(GATE_MAX_ROUNDS, RETRY_FACTOR * rounds));
/** The id of the arm of the fixed base. */
export const FIXED_ARM = "fixed";
/** The limit of the ratio head/fixed base: 1.10. */
export const FIXED_LIMIT = 1.1;
/** The start of the reason of a run that fails the check against the fixed base. The flip of the sections gate wants this text. */
export const FIXED_BEYOND_TEXT = `The home finds the head beyond the limit ${FIXED_LIMIT.toFixed(2)} of the fixed base`;
/** The schema of the file of the fixed base. */
export const BASE_SCHEMA = "sections-gate-base/1";
/**
 * The schema of the record of the gate. Version 3 keeps the facts of the home verdict that decides: the noise, the pool and the margin.
 * Version 4 keeps the order of each round in the report and the end of the run.
 * It also keeps the limit verdict of the check against the fixed base.
 */
export const GATE_SCHEMA = "sections-gate/4";
/** The schemas of the records that the pool reads. */
export const GATE_SCHEMAS: readonly string[] = ["sections-gate/1", "sections-gate/2", "sections-gate/3", GATE_SCHEMA];
/**
 * The noise cap on the A/A spread of the run, on the log scale of the home: `Math.log(1.06)`, approximately 0.058.
 * Slice 2 had the cap 0.06 on |r - 1|. A ratio of 1.06 has |log r| = 0.058, so the cap keeps the rule of slice 2.
 */
export const NOISE_CAP = Math.log(1.06);
/** The floor of the pooled band and the margin of the rule `difference`, on the log scale: `Math.log(1.05)`, approximately 0.049. */
export const PARENT_FLOOR = Math.log(1.05);
/** The quantile of the A/A spread of the noise cap and of the pool: p90. */
export const SPREAD_LEVEL = 0.9;
/** The most runs of the pool. The pool keeps the newest quiet runs. */
export const POOL_MAX_RUNS = 20;
/** The schema of the pool of A/A rounds. */
export const POOL_SCHEMA = "sections-gate-pool/1";
/** The path of the pool of A/A rounds, from the folder of the core package. */
export const POOL_FILE = "scripts/data/sections-gate/aa-pool.json";
/** The path of the file of the fixed base, from the folder of the core package. */
export const BASE_FILE = "scripts/data/sections-gate/fixed-base.json";

/** The fixed base of the gate: a commit, the date it became the base and the reason. */
export interface FixedBase {
  readonly schema: typeof BASE_SCHEMA;
  /** The full hash of the commit. */
  readonly commit: string;
  /** The date of the change of the base, as `YYYY-MM-DD`. */
  readonly date: string;
  /** The reason of the base. A new base names the reason, for example a feature that costs time on purpose. */
  readonly reason: string;
}

/** This function reads the file of the fixed base. A value with no full hash, no date or no reason throws an `InputError`. */
export function parseFixedBase(text: string): FixedBase {
  let value: Partial<FixedBase>;
  try {
    value = JSON.parse(text) as Partial<FixedBase>;
  } catch {
    throw new InputError(`The file ${BASE_FILE} is not JSON.`);
  }
  if (value?.schema !== BASE_SCHEMA) throw new InputError(`The file ${BASE_FILE} is not of schema ${BASE_SCHEMA}.`);
  if (typeof value.commit !== "string" || !/^[0-9a-f]{40}$/.test(value.commit)) throw new InputError(`The fixed base of ${BASE_FILE} is not a full hash.`);
  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new InputError(`The date of ${BASE_FILE} is not YYYY-MM-DD.`);
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) throw new InputError(`The fixed base of ${BASE_FILE} has no reason.`);
  return { schema: BASE_SCHEMA, commit: value.commit, date: value.date, reason: value.reason };
}

/** One quiet run of the pool: its A/A round ratios and the facts of its runner. */
export interface PoolRun {
  /** The id of the workflow run. */
  readonly run: number;
  /** The job of the run: `gate`, or `retry` for the second run on a fresh runner. */
  readonly job: "gate" | "retry";
  /** The full hash of the head of the run. On a pull request, it is the merge commit. */
  readonly commit: string;
  /** The full hash of the parent. The A/A arm times this commit of `main`. */
  readonly parent: string;
  /** The CPU model of the runner. */
  readonly cpu: string;
  /** The date of the run, as `YYYY-MM-DD`. */
  readonly date: string;
  /** The A/A spread of the run on the scale of slice 2: p90 of |r - 1| over `ratios`. The file keeps it as data. The home uses |log r|. */
  readonly spread: number;
  /** The A/A round ratios of the run: the time of the A/A arm over the time of the parent in each round. */
  readonly ratios: readonly number[];
}

/** The pool of A/A rounds of the gate: the quiet runs of the gate, the newest first. */
export interface AaPool {
  readonly schema: typeof POOL_SCHEMA;
  readonly runs: readonly PoolRun[];
}

const HASH = /^[0-9a-f]{40}$/;
const isRatio = (r: unknown): r is number => typeof r === "number" && Number.isFinite(r) && r > 0;

/**
 * This function reads the file of the pool. The function throws an `InputError` for a bad value.
 * Each run has a full hash, a date and A/A ratios. Its spread is the spread of its ratios. The run ids are unique.
 * The script `sections-gate-pool.ts` admits a run only below the noise cap, with the spread of the home.
 */
export function parsePool(text: string): AaPool {
  let value: Partial<AaPool>;
  try {
    value = JSON.parse(text) as Partial<AaPool>;
  } catch {
    throw new InputError(`The file ${POOL_FILE} is not JSON.`);
  }
  if (value?.schema !== POOL_SCHEMA || !Array.isArray(value.runs)) throw new InputError(`The file ${POOL_FILE} is not of schema ${POOL_SCHEMA}.`);
  const seen = new Set<string>();
  for (const r of value.runs as readonly Partial<PoolRun>[]) {
    const id = `${String(r?.run)} ${String(r?.job)}`;
    if (!Number.isSafeInteger(r?.run) || (r.job !== "gate" && r.job !== "retry")) throw new InputError(`A run of ${POOL_FILE} has no run id or no job.`);
    if (seen.has(id)) throw new InputError(`The run ${id} is two times in ${POOL_FILE}.`);
    seen.add(id);
    if (typeof r.commit !== "string" || !HASH.test(r.commit) || typeof r.parent !== "string" || !HASH.test(r.parent)) throw new InputError(`The run ${id} of ${POOL_FILE} has no full hash.`);
    if (typeof r.cpu !== "string" || typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new InputError(`The run ${id} of ${POOL_FILE} has no CPU model or no date.`);
    if (!Array.isArray(r.ratios) || r.ratios.length === 0 || !r.ratios.every(isRatio)) throw new InputError(`The run ${id} of ${POOL_FILE} has no A/A ratios.`);
    if (typeof r.spread !== "number" || Math.abs(r.spread - spreadOf(r.ratios)) > 1e-12) throw new InputError(`The spread of the run ${id} of ${POOL_FILE} is not the spread of its ratios.`);
  }
  return { schema: POOL_SCHEMA, runs: value.runs };
}

/** This function gives the name of a run of the pool: its run id and its job. A retry ran on another runner, so it is another run. */
export const poolRunName = (run: Pick<PoolRun, "run" | "job">): string => `${run.run} ${run.job}`;

/**
 * This function gives the `PairedTime` records of a list of A/A ratios: one case of one round for each ratio.
 * The parent has the time 1 and the A/A arm has the ratio, so the ratio of each case is the A/A round ratio.
 * Each case name starts with `name`, so the cases of two runs do not share a name.
 */
export function ratioTimes(ratios: readonly number[], name: string): PairedTime[] {
  return ratios.map((b, k) => ({ case: `${name} #${k}`, round: 0, first: k % 2 === 0 ? "a" : "b", a: 1, b }));
}

/** This function gives the run of a record of `ratioTimes`: the case name before ` #`. */
const runOfCase = (record: PairedTime): string => record.case.slice(0, record.case.lastIndexOf(" #"));

/** This function gives the pooled band of the home for a pool. It uses the A/A records of each run, the floor `PARENT_FLOOR` and the run of each record. */
export function poolOptions(pool: AaPool): PoolOptions {
  return { records: pool.runs.flatMap((r) => ratioTimes(r.ratios, poolRunName(r))), floor: PARENT_FLOOR, run: runOfCase };
}

/**
 * This function gives the options of `timeVerdict` for the check against the parent.
 * The rule is `difference`. The margin is the floor, so the margin of the rule is the larger of the floor and the pooled spread.
 */
export function gateOptions(pool: AaPool): VerdictOptions {
  return { rule: "difference", margin: PARENT_FLOOR, noiseCap: NOISE_CAP, spreadLevel: SPREAD_LEVEL, pool: poolOptions(pool) };
}

/** The facts of one run for the pool. The script `sections-gate-pool.ts` gives them from the list of the workflow runs. */
export interface RunFacts {
  readonly run: number;
  readonly job: PoolRun["job"];
  readonly date: string;
}

/** The decision of the pool on one record. */
export type PoolEntry = { readonly kept: true; readonly run: PoolRun } | { readonly kept: false; readonly run: RunFacts; readonly reason: string };

/** The minimal record that the pool reads. A record of each schema of `GATE_SCHEMAS` has these fields. */
export interface PoolRecord {
  readonly schema: string;
  readonly router: string;
  readonly head: Side;
  readonly parent: Side;
  readonly env: RecordEnv;
  readonly report: PairedReport | null;
}

/**
 * This function decides if a record of the gate goes into the pool. Only a run with A/A ratios and a spread at or below `NOISE_CAP` goes in.
 * The function `logSpread` gives the A/A spread on the log scale. The pool script gives it with `aaSpread` of the home.
 */
export function poolEntry(record: PoolRecord, facts: RunFacts, logSpread: (ratios: readonly number[]) => number): PoolEntry {
  if (!GATE_SCHEMAS.includes(record.schema)) return { kept: false, run: facts, reason: `the record is of schema ${record.schema}` };
  if (record.report === null) return { kept: false, run: facts, reason: "the job timed no arm" };
  const ratios = aaRatios(record.report, record.router);
  if (ratios.length === 0) return { kept: false, run: facts, reason: "the record has no A/A ratios" };
  const spread = logSpread(ratios);
  if (spread > NOISE_CAP) return { kept: false, run: facts, reason: `the A/A spread ${spread.toFixed(3)} is above the cap ${NOISE_CAP.toFixed(3)}` };
  return { kept: true, run: { ...facts, commit: record.head.sha, parent: record.parent.sha, cpu: record.env.cpu, spread: spreadOf(ratios), ratios } };
}

/** This function gives the pool of the kept runs: the newest `POOL_MAX_RUNS` runs, the newest first. One run id and job is one run. */
export function buildPool(runs: readonly PoolRun[]): AaPool {
  const unique = new Map(runs.map((r) => [`${r.run} ${r.job}`, r]));
  const sorted = [...unique.values()].sort((a, b) => b.run - a.run || a.job.localeCompare(b.job));
  return { schema: POOL_SCHEMA, runs: sorted.slice(0, POOL_MAX_RUNS) };
}

/** The verdict of one check of the gate. Only `pass` passes, so a check with no time fails the gate (FAIL-CLOSED). */
export type GateVerdict = "pass" | "fail" | "not measured" | "cannot decide";

/** One check of the gate. */
export interface GateCheck {
  readonly check: "parent" | "fixed base";
  /**
   * For the check against the parent, the median time of the head over the median time of the parent.
   * For the check against the fixed base, the median of the round ratios head / fixed base of the limit verdict.
   */
  readonly ratio: number | null;
  /**
   * For the check against the fixed base, the limit `FIXED_LIMIT` of the claim of `limitVerdict`.
   * For the check against the parent, it is the high end of the band `same` of the home, `exp(margin)`.
   */
  readonly limit: number | null;
  readonly verdict: GateVerdict;
}

/** The outcome of one run of the gate. A first run that cannot decide starts the second run. */
export type GateOutcome = "pass" | "fail" | "cannot decide";

/**
 * The end of one run of the gate. Only `pass` passes.
 * The end `retry` is a first run that cannot decide. The end `no read` is a second run that cannot decide, and it fails the check.
 */
export type GateEnd = "pass" | "fail" | "retry" | "no read";

/** This function gives the end of a run from its outcome and its number, 1 or 2. */
export function gateEnd(outcome: GateOutcome, attempt: 1 | 2): GateEnd {
  if (outcome !== "cannot decide") return outcome;
  return attempt === 1 ? "retry" : "no read";
}

/** This function gives the words of a no read, with the timed rounds of the run, for the record and the summary of the job. */
export const noReadText = (rounds: number): string => `no read: cannot decide at ${rounds} rounds`;

/** The limit verdict of the home on the head against the fixed base, as the record keeps it. It decides the check against the fixed base. */
export interface FixedVerdict {
  readonly outcome: LimitOutcome;
  readonly reason: string;
  /** The limit of the claim: `FIXED_LIMIT`. */
  readonly limit: number;
  /** The median of the round ratios head / fixed base, and the count of the rounds. They are `null` without a case. */
  readonly ratio: number | null;
  readonly rounds: number | null;
  /** The ends of the interval of the median of the round ratios. They are `null` without a case. */
  readonly low: number | null;
  readonly high: number | null;
  /** The noise of the A/A rounds on the log scale. The bound is `high` times `exp(noise)`, and the floor is `low` times `exp(-noise)`. */
  readonly noise: number | null;
  readonly bound: number | null;
  readonly floor: number | null;
}

/** This function keeps the facts of a limit verdict of the home on one case in the form of the record. A verdict with no case gives `null` values. */
export function fixedRecord(v: LimitVerdict): FixedVerdict {
  const c = v.cases[0];
  return {
    outcome: v.outcome,
    reason: v.reason,
    limit: v.limit,
    ratio: c?.ratio ?? null,
    rounds: c?.rounds ?? null,
    low: c?.low ?? null,
    high: c?.high ?? null,
    noise: c?.noise ?? null,
    bound: c?.bound ?? null,
    floor: c?.floor ?? null,
  };
}

/** This function maps an outcome of the limit verdict to the verdict of the check against the fixed base. Only `beyond` fails. */
export function fixedVerdictOf(outcome: LimitOutcome): GateVerdict {
  if (outcome === "beyond") return "fail";
  if (outcome === "cannot decide") return "cannot decide";
  return "pass";
}

/** The verdict of the home on the head against the parent, as the record keeps it. The home decides the check against the parent with it. */
export interface HomeVerdict {
  readonly outcome: TimeOutcome;
  readonly reason: string;
  /** The interval of the rule `difference`: the candidate median over the A/A median. It is `null` without an interval. */
  readonly low: number | null;
  readonly high: number | null;
  /** The margin of the rule `difference` on the log scale: the larger of `PARENT_FLOOR` and the noise of the pooled band. It is `null` without a band. */
  readonly margin: number | null;
  /** The noise cap: the A/A spread of the run on the log scale, the cap and the result. It is `null` without the option `noiseCap`. */
  readonly noise: { readonly spread: number | null; readonly cap: number; readonly noisy: boolean } | null;
  /** The pooled band: the count of its cases and runs, its spread on the log scale and its floor. It is `null` without the option `pool`. */
  readonly pool: { readonly cases: number; readonly runs: number | null; readonly spread: number | null; readonly floor: number; readonly pooled: boolean } | null;
}

/** This function keeps the facts of a verdict of the home in the form of the record. A value of the home that is undefined becomes `null`. */
export function homeRecord(v: TimeVerdict): HomeVerdict {
  return {
    outcome: v.outcome,
    reason: v.reason,
    low: v.interval?.low ?? null,
    high: v.interval?.high ?? null,
    margin: v.band === undefined ? null : Math.max(PARENT_FLOOR, v.band.noise),
    noise: v.noise === undefined ? null : { spread: v.noise.spread ?? null, cap: v.noise.cap, noisy: v.noise.noisy },
    pool: v.pool === undefined ? null : { cases: v.pool.cases, runs: v.pool.runs ?? null, spread: v.pool.spread ?? null, floor: v.pool.floor, pooled: v.pool.pooled },
  };
}

/** The result of the gate on one report. */
export interface GateResult {
  /** The row of the head against the parent, with the A/A ratios and the spread of the run on |r - 1|. */
  readonly parent: ArmRow | null;
  /** The row of the fixed base against the parent. Its ratio is the median of the fixed base over the median of the parent. */
  readonly fixed: ArmRow | null;
  /** The verdict of the home that decides the check against the parent. It is `null` when the job timed no arm. */
  readonly home: HomeVerdict | null;
  /** The limit verdict of the home that decides the check against the fixed base. It is `null` when the job timed no arm. */
  readonly fixedCheck: FixedVerdict | null;
  /** This value is `true` when the home finds the A/A spread of the run above `NOISE_CAP`. */
  readonly noisy: boolean;
  /** The head against the parent, in the words of the home: faster, slower, same or cannot decide. */
  readonly words: TimeOutcome | "not measured";
  readonly checks: readonly [GateCheck, GateCheck];
  readonly outcome: GateOutcome;
  /** This value is `true` only when the run decides and the two checks pass. */
  readonly pass: boolean;
  /** The reason of the outcome, in one sentence. */
  readonly reason: string;
}

/** This function maps an outcome of the home to the verdict of the check against the parent. Only `slower` fails. */
export function parentVerdictOf(outcome: TimeOutcome): GateVerdict {
  if (outcome === "slower") return "fail";
  if (outcome === "cannot decide") return "cannot decide";
  return "pass";
}

const fmt = (x: number | null | undefined, d = 3): string => (x == null ? "-" : Number.isFinite(x) ? x.toFixed(d) : String(x));

/**
 * This function gives the checks and the outcome of the gate on a report and the two verdicts of the home on the same report.
 *
 * - The report has the base `parent`, the arms `commit` and `fixed`, and the A/A arm. Else the function throws a `RangeError`.
 * - A check with no time gives `not measured`, and the run fails (FAIL-CLOSED). A missing verdict of the home is a check with no time.
 * - The limit verdict decides the check against the fixed base: `beyond` fails, `cannot decide` cannot decide, and `within` passes.
 * - The time verdict decides the check against the parent: `slower` fails, `cannot decide` cannot decide, and `same` and `faster` pass.
 * - A failed check fails the run. Else a check that cannot decide makes the run cannot decide.
 */
export function gateVerdict(report: PairedReport, home: HomeVerdict | null, fixedCheck: FixedVerdict | null, router: string = GATE_ROUTER): GateResult {
  if (report.base !== PARENT_ARM || !report.arms.includes(COMMIT_ARM) || !report.arms.includes(FIXED_ARM) || !report.arms.includes(aaId(PARENT_ARM)))
    throw new RangeError(`A gate report has the base ${PARENT_ARM}, the arms ${COMMIT_ARM} and ${FIXED_ARM}, and the A/A arm ${aaId(PARENT_ARM)}.`);
  const parent = armRows(report, COMMIT_ARM).find((r) => r.input === router) ?? null;
  const fixed = armRows(report, FIXED_ARM).find((r) => r.input === router) ?? null;
  const ratio = parent?.ratio ?? null;
  const measured = parent !== null && ratio !== null && Number.isFinite(ratio) && home !== null;
  const toParent: GateVerdict = measured ? parentVerdictOf(home.outcome) : "not measured";
  const limit = home?.margin == null ? null : Math.exp(home.margin);
  const toFixed = fixedCheck?.ratio ?? null;
  const fixedMeasured = fixed !== null && fixedCheck !== null && toFixed !== null && Number.isFinite(toFixed);
  const checks: [GateCheck, GateCheck] = [
    { check: "parent", ratio, limit, verdict: toParent },
    { check: "fixed base", ratio: toFixed, limit: FIXED_LIMIT, verdict: fixedMeasured ? fixedVerdictOf(fixedCheck.outcome) : "not measured" },
  ];
  const words: GateResult["words"] = measured ? home.outcome : "not measured";
  const noisy = home?.noise?.noisy ?? false;
  let outcome: GateOutcome;
  let reason: string;
  if (checks.some((c) => c.verdict === "not measured")) {
    outcome = "fail";
    reason = "A check has no time, so the run fails (FAIL-CLOSED).";
  } else if (checks[1].verdict === "fail") {
    outcome = "fail";
    reason = `${FIXED_BEYOND_TEXT} (ratio ${fmt(toFixed)}, floor ${fmt(fixedCheck!.floor)}). ${fixedCheck!.reason}`;
  } else if (checks[0].verdict === "fail") {
    outcome = "fail";
    reason = `The home finds the head slower than the parent (ratio ${fmt(ratio)}). ${home!.reason}`;
  } else if (checks[0].verdict === "cannot decide" || checks[1].verdict === "cannot decide") {
    outcome = "cannot decide";
    const parts: string[] = [];
    if (checks[0].verdict === "cannot decide") parts.push(`The home cannot decide the head against the parent. ${home!.reason}`);
    if (checks[1].verdict === "cannot decide") {
      parts.push(`The home cannot decide the head against the limit ${fmt(FIXED_LIMIT, 2)} of the fixed base (ratio ${fmt(toFixed)}, bound ${fmt(fixedCheck!.bound)}). ${fixedCheck!.reason}`);
    }
    reason = parts.join(" ");
  } else {
    outcome = "pass";
    reason = `The home finds the head ${home!.outcome} against the parent (ratio ${fmt(ratio)}), and within the limit ${fmt(FIXED_LIMIT, 2)} of the fixed base (ratio ${fmt(toFixed)}, bound ${fmt(fixedCheck!.bound)}).`;
  }
  return { parent, fixed, home, fixedCheck, noisy, words, checks, outcome, pass: outcome === "pass", reason };
}

/** The record of one run of the gate, with the schema `sections-gate/4`. */
export interface GateRecord {
  readonly schema: typeof GATE_SCHEMA;
  /** The run of the gate: 1 for the job `gate`, 2 for the job `retry` on a fresh runner after a run that cannot decide. */
  readonly attempt: 1 | 2;
  /** The commit of the board: the base of the bisect, `fa1dd82~1`. Each arm routes its fixture. */
  readonly board: Side;
  readonly fixture: string;
  readonly router: string;
  /** The timed rounds of each arm in this run. The second run has `RETRY_FACTOR` times the rounds of the first run. */
  readonly rounds: number;
  /** The timed head. Its `ref` is the input text, for example `HEAD`, and its `sha` is the full hash that the job resolved one time. */
  readonly head: Side;
  /** The parent of the head. Its `ref` is the input text, for example `HEAD^1`, and its `sha` is the full hash that the job resolved one time. */
  readonly parent: Side;
  readonly fixed: Side;
  /** The file of the fixed base of the checkout. */
  readonly fixedBase: FixedBase;
  /** The reason when the job timed no arm, else `null`. */
  readonly skipped: string | null;
  readonly env: RecordEnv;
  /**
   * The paired report with the arms `parent`, `commit`, `fixed` and `parent~aa`. It is `null` when the job timed no arm.
   * Its field `orders` keeps the order of the arms in each round, so a reader does not make the order again.
   */
  readonly report: PairedReport | null;
  /** The verdict of the home on the same rounds, with the pool of the head. It decides the check against the parent. It is `null` when the job timed no arm. */
  readonly home: HomeVerdict | null;
  /** The limit verdict of the home on the same rounds. It decides the check against the fixed base. It is `null` when the job timed no arm. */
  readonly fixedCheck: FixedVerdict | null;
  /** The end of the run: `pass`, `fail`, `retry` or `no read`. Only `pass` passes. `sealRecord` gives it. */
  readonly end: GateEnd;
  /** The words of a no read, for example "no read: cannot decide at 20 rounds". It is `null` for each other end. */
  readonly noRead: string | null;
}

/** The record of one run of the gate before its end. */
export type GateRun = Omit<GateRecord, "end" | "noRead">;

/** This function gives the result of a record. A record with no report gives two checks with no time, and the run fails. */
export function recordVerdict(record: GateRun): GateResult {
  if (record.report === null) {
    const none = (check: GateCheck["check"], limit: number | null): GateCheck => ({ check, ratio: null, limit, verdict: "not measured" });
    return {
      parent: null,
      fixed: null,
      home: record.home,
      fixedCheck: record.fixedCheck,
      noisy: false,
      words: "not measured",
      checks: [none("parent", null), none("fixed base", FIXED_LIMIT)],
      outcome: "fail",
      pass: false,
      reason: "The job timed no arm, so the run fails (FAIL-CLOSED).",
    };
  }
  return gateVerdict(record.report, record.home, record.fixedCheck, record.router);
}

/** This function gives the record of a run with its end. A second run that cannot decide gets the end `no read` and the words of `noReadText`. */
export function sealRecord(run: GateRun): GateRecord {
  const end = gateEnd(recordVerdict(run).outcome, run.attempt);
  return { ...run, end, noRead: end === "no read" ? noReadText(run.rounds) : null };
}

/** The exit code of the script for the first run that cannot decide. The workflow then starts the job `retry`. */
export const EXIT_CANNOT_DECIDE = 3;

/**
 * This function gives the exit code of the script for a record. The code is 0 for a pass, 1 for a fail and 3 for a first run that cannot decide.
 * A no read has the code 1, so a run that cannot decide does not pass at any time.
 */
export function gateExit(record: GateRun): 0 | 1 | typeof EXIT_CANNOT_DECIDE {
  const end = gateEnd(recordVerdict(record).outcome, record.attempt);
  if (end === "pass") return 0;
  if (end === "retry") return EXIT_CANNOT_DECIDE;
  return 1;
}

/** This function gives the outcome of a record in words, with the next step. */
export function outcomeText(record: GateRun): string {
  const g = recordVerdict(record);
  const end = gateEnd(g.outcome, record.attempt);
  if (end === "pass") return `The gate passes. ${g.reason}`;
  if (end === "fail") return `The gate fails. ${g.reason}`;
  if (end === "retry") {
    const more = attemptRounds(record.rounds, 2);
    return `This run cannot decide at ${record.rounds} rounds. ${g.reason} The job \`retry\` runs the gate once more on a fresh runner, with ${more} rounds.`;
  }
  return `**The gate fails with a ${noReadText(record.rounds)}.** ${g.reason} The first run could not decide too. A run that cannot decide does not pass.`;
}

/** This function writes a time in ms, or in s above 10 s. */
const time = (ms: number | null | undefined): string => (ms == null || !Number.isFinite(ms) ? "-" : ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(1)} ms`);
/** This function keeps a text in one cell of a table. */
const cell = (text: string): string => text.replace(/\|/g, "/");
const short = (s: Side): string => `\`${s.sha.slice(0, 7)}\``;
/** This function writes the input text of a side and its full hash, for example `` `HEAD^1` = `414ec5f...` ``. */
const named = (s: Side): string => (s.ref === s.sha ? `\`${s.sha}\`` : `\`${cell(s.ref)}\` = \`${s.sha}\``);

/** This function gives the Markdown text of a record of the gate: the outcome, the noise, the pool, the two checks and the times. */
export function gateText(record: GateRun): string[] {
  const g = recordVerdict(record);
  const p = g.parent;
  const h = record.home;
  const f = record.fixedCheck;
  const end = gateEnd(g.outcome, record.attempt);
  const lines = [
    `# The sections time gate, run ${record.attempt} of 2: ${end === "no read" ? noReadText(record.rounds) : end}`,
    "",
    outcomeText(record),
    "",
    `The job times \`${record.router}\` on the fixture \`${record.fixture}\` of \`fa1dd82~1\` (${short(record.board)}), with 10 000 nodes. Each arm routes the same board.`,
    `Each route has its own fresh process. Each arm has ${record.rounds} rounds. \`armOrder\` of the home gives the order of the arms in each round, and the record keeps it. The A/A arm is a second copy of the parent.`,
    "",
    `- The head: ${named(record.head)} ${cell(record.head.subject)}`,
    `- The parent: ${named(record.parent)} ${cell(record.parent.subject)}`,
    `- The fixed base: ${short(record.fixed)} since ${record.fixedBase.date}. ${cell(record.fixedBase.reason)}`,
    "",
  ];
  if (record.skipped !== null) lines.push(`**The job timed no arm:** ${record.skipped}`, "");
  const pool = h?.pool ?? null;
  const pooled = pool === null ? "-" : `${fmt(pool.spread)}, from ${pool.cases} A/A cases of ${pool.runs ?? "-"} quiet runs. The floor is ${fmt(pool.floor)} = log(1.05).`;
  const band = h?.margin == null ? "-" : `${fmt(h.margin)}, so the band \`same\` is ${fmt(Math.exp(-h.margin))} to ${fmt(Math.exp(h.margin))}`;
  lines.push(
    "| noise | value |",
    "|---|---|",
    `| the A/A spread of this run, on \\|log r\\| | ${fmt(h?.noise?.spread)} |`,
    `| the noise cap | ${fmt(NOISE_CAP)} = log(1.06). Above it, the run cannot decide. |`,
    `| the pooled A/A spread, on \\|log r\\| | ${pooled} |`,
    `| the margin of the rule \`difference\` | ${band} |`,
    `| the head over the parent, over the A/A arm | ${h?.low == null ? "-" : `${fmt(h.low)} to ${fmt(h.high)}`} |`,
    `| the head against the parent | ${g.words} |`,
    "",
    "| check | ratio | limit | verdict |",
    "|---|---:|---:|---|",
    ...g.checks.map((c) => `| head / ${c.check} | ${fmt(c.ratio)} | ${fmt(c.limit)} | ${c.verdict} |`),
    "",
    "`timeVerdict` of `@mark1russell7/rigor-bench` (rule `difference`) decides the check against the parent. Its outcome `slower` fails.",
    "The margin is the larger of the floor log(1.05) and the pooled A/A spread.",
    "`limitVerdict` of the home decides the check against the fixed base, with the limit 1.10 and the A/A noise of the rounds of this run. Its outcome `beyond` fails.",
    "A check that cannot decide starts the retry with 2 times the rounds. A second run that cannot decide is a no read, and it fails.",
    `The A/A spread of the home is p90 of |log r| over the A/A round ratios. The ${p?.aa.length ?? 0} A/A round ratios of this run are ${p === null || p.aa.length === 0 ? "-" : p.aa.map((r) => fmt(r)).join(", ")}.`,
    "",
  );
  if (f !== null) {
    lines.push(
      "| the head against the fixed base | value |",
      "|---|---|",
      `| the median of the round ratios | ${fmt(f.ratio)}, over ${f.rounds ?? "-"} rounds |`,
      `| its interval at 0.95 | ${f.low == null ? "-" : `${fmt(f.low)} to ${fmt(f.high)}`} |`,
      `| the A/A noise of the rounds, on \\|log r\\| | ${fmt(f.noise)} |`,
      `| the floor and the bound | ${f.floor == null ? "-" : `${fmt(f.floor)} to ${fmt(f.bound)}`}. Within: the bound is at most ${fmt(f.limit, 2)}. Beyond: the floor is above it. |`,
      `| the outcome | ${f.outcome} |`,
      "",
    );
  }
  if (h !== null) lines.push(`The reason of the home: ${cell(h.reason)}`, "");
  if (f !== null) lines.push(`The reason of the limit verdict: ${cell(f.reason)}`, "");
  lines.push(
    "| arm | median time |",
    "|---|---:|",
    `| parent | ${time(p?.baseMs)} |`,
    `| head | ${time(p?.armMs)} |`,
    `| fixed base | ${time(g.fixed?.armMs)} |`,
    "",
    `The computer: ${cell(record.env.cpu)}, ${record.env.cores} cores, Node.js ${record.env.node}.`,
    "",
  );
  return lines;
}
