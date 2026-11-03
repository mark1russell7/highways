// The verdict of the sections time gate (GATE-LIMITS slices 1 and 2). The workflow `Sections gate` (.github/workflows/sections-gate.yml) starts it.
// One job times `sections-tree` on the board of the bisect (10 000 nodes) in fresh processes, with four arms in turn:
// the parent of the pull request, the head, the A/A copy of the parent and the fixed base of `data/sections-gate/fixed-base.json`.
// The gate has two checks and a noise cap (docs/PROMOTION.md, "The sections time gate"):
// - The noise cap: a run with an A/A spread above `NOISE_CAP` cannot decide. The workflow then runs the gate once more on a fresh runner.
// - Against the parent: the ratio head/parent fails above 1 + max(`MIN_EFFECT`, the pooled A/A spread of `data/sections-gate/aa-pool.json`).
// - Against the fixed base: the ratio head/fixed base fails above `FIXED_LIMIT`. A check against the parent alone misses a slow drift in many small steps.
// This module imports only node modules, the gates and types, so a job with no installed packages can start it.
// The verdict of the bench home `@mark1russell7/rigor-bench` comes from `gates/home-verdict.ts`, and the record keeps it.
import type { TimeOutcome } from "@mark1russell7/rigor-bench";
import { aaId, type PairedReport, type RecordEnv } from "./gates/paired.ts";
import { COMMIT_ARM, PARENT_ARM, aaRatios, armRows, spreadOf, type ArmRow } from "./gates/pair-confirm.ts";
import { InputError } from "./gates/inputs.ts";
import { type Side } from "./sections-confirm-verdict.ts";

/** The router of the gate. SECTIONS-SLOW found its drift. */
export const GATE_ROUTER = "sections-tree";
/** The timed rounds of each arm by default. */
export const GATE_ROUNDS = 10;
/** The id of the arm of the fixed base. */
export const FIXED_ARM = "fixed";
/** The smallest step of the check against the parent: 5 %. The pooled A/A spread replaces it when the spread is larger. */
export const MIN_EFFECT = 0.05;
/** The limit of the ratio head/fixed base: 1.10. */
export const FIXED_LIMIT = 1.1;
/** The schema of the file of the fixed base. */
export const BASE_SCHEMA = "sections-gate-base/1";
/** The schema of the record of the gate. Version 2 adds the attempt, the pooled band and the verdict of the home. */
export const GATE_SCHEMA = "sections-gate/2";
/** The schemas of the records that the pool reads. */
export const GATE_SCHEMAS: readonly string[] = ["sections-gate/1", GATE_SCHEMA];
/** The noise cap: 0.06, three times the A/A spread 0.027 of a quiet run. A run with a larger A/A spread cannot decide. */
export const NOISE_CAP = 0.06;
/** The fewest quiet runs that give the pooled band. With fewer runs, the limit against the parent is 1 + `MIN_EFFECT`. */
export const POOL_MIN_RUNS = 5;
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
  /** The A/A spread of the run: p90 of |r - 1| over `ratios`. It is at or below `NOISE_CAP`. */
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
 * Each run has a full hash, a date and A/A ratios. Its spread is the spread of its ratios, at or below `NOISE_CAP`. The run ids are unique.
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
    const spread = spreadOf(r.ratios);
    if (typeof r.spread !== "number" || Math.abs(r.spread - spread) > 1e-12) throw new InputError(`The spread of the run ${id} of ${POOL_FILE} is not the spread of its ratios.`);
    if (spread > NOISE_CAP) throw new InputError(`The run ${id} of ${POOL_FILE} has the spread ${spread}, above the cap ${NOISE_CAP}.`);
  }
  return { schema: POOL_SCHEMA, runs: value.runs };
}

/** The pooled band of the check against the parent. */
export interface PoolBand {
  /** The count of the quiet runs of the pool, and the count of their A/A ratios. */
  readonly runs: number;
  readonly ratios: number;
  /** The pooled A/A spread: p90 of |r - 1| over all ratios of the pool. It is `null` for an empty pool. */
  readonly spread: number | null;
  /** This value is `true` when the pool has `POOL_MIN_RUNS` runs or more. Else the limit uses the floor `MIN_EFFECT`. */
  readonly pooled: boolean;
  /** The limit of the ratio head/parent: 1 + max(`MIN_EFFECT`, the pooled spread), or 1 + `MIN_EFFECT` with too few runs. */
  readonly limit: number;
}

/** This function gives the limit of the check against the parent from a spread: 1 + max(`MIN_EFFECT`, spread). */
export const parentLimit = (spread: number): number => 1 + Math.max(MIN_EFFECT, spread);

/** This function gives the pooled band of a pool. A pool with fewer than `POOL_MIN_RUNS` runs gives the floor 1 + `MIN_EFFECT`. */
export function poolBand(pool: AaPool): PoolBand {
  const ratios = pool.runs.flatMap((r) => r.ratios);
  const spread = ratios.length === 0 ? null : spreadOf(ratios);
  const pooled = pool.runs.length >= POOL_MIN_RUNS && spread !== null;
  return { runs: pool.runs.length, ratios: ratios.length, spread, pooled, limit: pooled ? parentLimit(spread) : parentLimit(0) };
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

/** This function decides if a record of the gate goes into the pool. Only a run with A/A ratios and a spread at or below `NOISE_CAP` goes in. */
export function poolEntry(record: PoolRecord, facts: RunFacts): PoolEntry {
  if (!GATE_SCHEMAS.includes(record.schema)) return { kept: false, run: facts, reason: `the record is of schema ${record.schema}` };
  if (record.report === null) return { kept: false, run: facts, reason: "the job timed no arm" };
  const ratios = aaRatios(record.report, record.router);
  if (ratios.length === 0) return { kept: false, run: facts, reason: "the record has no A/A ratios" };
  const spread = spreadOf(ratios);
  if (spread > NOISE_CAP) return { kept: false, run: facts, reason: `the A/A spread ${spread.toFixed(3)} is above the cap ${NOISE_CAP}` };
  return { kept: true, run: { ...facts, commit: record.head.sha, parent: record.parent.sha, cpu: record.env.cpu, spread, ratios } };
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
  /** The median time of the head over the median time of the other side. */
  readonly ratio: number | null;
  /** The ratio limit. Above it, the check fails. */
  readonly limit: number | null;
  readonly verdict: GateVerdict;
}

/** The outcome of one run of the gate. A run that cannot decide starts the second run. */
export type GateOutcome = "pass" | "fail" | "cannot decide";

/** The verdict of the home on the head against the parent, as the record keeps it. */
export interface HomeVerdict {
  readonly outcome: TimeOutcome;
  readonly reason: string;
  /** The interval of the rule `difference`: the candidate median over the A/A median. It is `null` without an interval. */
  readonly low: number | null;
  readonly high: number | null;
}

/** The result of the gate on one report. */
export interface GateResult {
  /** The row of the head against the parent, with the A/A ratios and the spread of the run. */
  readonly parent: ArmRow | null;
  /** The row of the fixed base against the parent. Its ratio is the median of the fixed base over the median of the parent. */
  readonly fixed: ArmRow | null;
  /** The pooled band that gives the limit against the parent. */
  readonly band: PoolBand;
  /** This value is `true` when the A/A spread of the run is above `NOISE_CAP`. */
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

/** This function compares a ratio with a limit. A ratio on the limit passes. */
function checkOf(ratio: number | null, limit: number | null): GateVerdict {
  if (ratio === null || limit === null || !Number.isFinite(ratio)) return "not measured";
  return ratio > limit ? "fail" : "pass";
}

const fmt = (x: number | null | undefined, d = 3): string => (x == null ? "-" : Number.isFinite(x) ? x.toFixed(d) : String(x));

/**
 * This function gives the checks and the outcome of the gate on a report.
 *
 * - The report has the base `parent`, the arms `commit` and `fixed`, and the A/A arm. Else the function throws a `RangeError`.
 * - A check with no time gives `not measured`, and the run fails (FAIL-CLOSED).
 * - The check against the fixed base fails above `FIXED_LIMIT`. The two medians come from the same job. A failed check fails the run.
 * - When the A/A spread of the run is above `NOISE_CAP`, the check against the parent and the run cannot decide.
 * - Else the check against the parent fails above the limit of the pooled band.
 */
export function gateVerdict(report: PairedReport, band: PoolBand, router: string = GATE_ROUTER): GateResult {
  if (report.base !== PARENT_ARM || !report.arms.includes(COMMIT_ARM) || !report.arms.includes(FIXED_ARM) || !report.arms.includes(aaId(PARENT_ARM)))
    throw new RangeError(`A gate report has the base ${PARENT_ARM}, the arms ${COMMIT_ARM} and ${FIXED_ARM}, and the A/A arm ${aaId(PARENT_ARM)}.`);
  const parent = armRows(report, COMMIT_ARM).find((r) => r.input === router) ?? null;
  const fixed = armRows(report, FIXED_ARM).find((r) => r.input === router) ?? null;
  const spread = parent !== null && Number.isFinite(parent.spread) ? parent.spread : null;
  const noisy = spread !== null && spread > NOISE_CAP;
  const ratio = parent?.ratio ?? null;
  const toFixed = parent?.armMs != null && fixed?.armMs != null && fixed.armMs > 0 ? parent.armMs / fixed.armMs : null;
  const measured = checkOf(ratio, band.limit);
  const toParent: GateVerdict = spread === null ? "not measured" : noisy && measured !== "not measured" ? "cannot decide" : measured;
  const checks: [GateCheck, GateCheck] = [
    { check: "parent", ratio, limit: band.limit, verdict: toParent },
    { check: "fixed base", ratio: toFixed, limit: FIXED_LIMIT, verdict: checkOf(toFixed, FIXED_LIMIT) },
  ];
  let words: GateResult["words"] = "not measured";
  if (toParent === "cannot decide") words = "cannot decide";
  else if (toParent !== "not measured" && ratio !== null) words = ratio > band.limit ? "slower" : ratio < 2 - band.limit ? "faster" : "same";
  let outcome: GateOutcome;
  let reason: string;
  if (checks.some((c) => c.verdict === "not measured")) {
    outcome = "fail";
    reason = "A check has no time, so the run fails (FAIL-CLOSED).";
  } else if (checks[1].verdict === "fail") {
    outcome = "fail";
    reason = `The head is ${fmt(toFixed)} times the fixed base, above the limit ${fmt(FIXED_LIMIT, 2)}.`;
  } else if (noisy) {
    outcome = "cannot decide";
    reason = `The A/A spread of the run is ${fmt(spread)}, above the noise cap ${fmt(NOISE_CAP, 2)}, so the run cannot decide.`;
  } else if (checks[0].verdict === "fail") {
    outcome = "fail";
    reason = `The head is ${fmt(ratio)} times the parent, above the limit ${fmt(band.limit)}.`;
  } else {
    outcome = "pass";
    reason = `The head is ${fmt(ratio)} times the parent (limit ${fmt(band.limit)}) and ${fmt(toFixed)} times the fixed base (limit ${fmt(FIXED_LIMIT, 2)}).`;
  }
  return { parent, fixed, band, noisy, words, checks, outcome, pass: outcome === "pass", reason };
}

/** The record of one run of the gate, with the schema `sections-gate/2`. */
export interface GateRecord {
  readonly schema: typeof GATE_SCHEMA;
  /** The run of the gate: 1 for the job `gate`, 2 for the job `retry` on a fresh runner after a run that cannot decide. */
  readonly attempt: 1 | 2;
  /** The commit of the board: the base of the bisect, `fa1dd82~1`. Each arm routes its fixture. */
  readonly board: Side;
  readonly fixture: string;
  readonly router: string;
  readonly rounds: number;
  readonly head: Side;
  readonly parent: Side;
  readonly fixed: Side;
  /** The file of the fixed base of the head. */
  readonly fixedBase: FixedBase;
  /** The pooled band of the pool of the head. */
  readonly band: PoolBand;
  /** The reason when the job timed no arm, else `null`. */
  readonly skipped: string | null;
  readonly env: RecordEnv;
  /** The paired report with the arms `parent`, `commit`, `fixed` and `parent~aa`. It is `null` when the job timed no arm. */
  readonly report: PairedReport | null;
  /** The verdict of the home on the same rounds. It is `null` when the job timed no arm. */
  readonly home: HomeVerdict | null;
}

/** This function gives the result of a record. A record with no report gives two checks with no time, and the run fails. */
export function recordVerdict(record: GateRecord): GateResult {
  if (record.report === null) {
    const none = (check: GateCheck["check"], limit: number | null): GateCheck => ({ check, ratio: null, limit, verdict: "not measured" });
    return {
      parent: null,
      fixed: null,
      band: record.band,
      noisy: false,
      words: "not measured",
      checks: [none("parent", record.band.limit), none("fixed base", FIXED_LIMIT)],
      outcome: "fail",
      pass: false,
      reason: "The job timed no arm, so the run fails (FAIL-CLOSED).",
    };
  }
  return gateVerdict(record.report, record.band, record.router);
}

/** The exit code of the script for the first run that cannot decide. The workflow then starts the job `retry`. */
export const EXIT_CANNOT_DECIDE = 3;

/** This function gives the exit code of the script for a record: 0 for a pass, 1 for a fail, 3 for the first run that cannot decide. */
export function gateExit(record: GateRecord): 0 | 1 | typeof EXIT_CANNOT_DECIDE {
  const g = recordVerdict(record);
  if (g.outcome === "pass") return 0;
  // The second run that cannot decide fails, so a noisy run does not pass at any time.
  if (g.outcome === "cannot decide" && record.attempt === 1) return EXIT_CANNOT_DECIDE;
  return 1;
}

/** This function gives the outcome of a record in words, with the next step. */
export function outcomeText(record: GateRecord): string {
  const g = recordVerdict(record);
  if (g.outcome === "pass") return `The gate passes. ${g.reason}`;
  if (g.outcome === "fail") return `The gate fails. ${g.reason}`;
  if (record.attempt === 1) return `This run cannot decide. ${g.reason} The job \`retry\` runs the gate once more on a fresh runner.`;
  return `The gate fails. ${g.reason} The first run was noisy too, and a noisy run does not pass.`;
}

/** This function writes a time in ms, or in s above 10 s. */
const time = (ms: number | null | undefined): string => (ms == null || !Number.isFinite(ms) ? "-" : ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(1)} ms`);
/** This function keeps a text in one cell of a table. */
const cell = (text: string): string => text.replace(/\|/g, "/");
const short = (s: Side): string => `\`${s.sha.slice(0, 7)}\``;

/** This function gives the Markdown text of a record of the gate: the outcome, the noise, the arms, the two checks and the verdict of the home. */
export function gateText(record: GateRecord): string[] {
  const g = recordVerdict(record);
  const p = g.parent;
  const b = record.band;
  const lines = [
    `# The sections time gate, run ${record.attempt} of 2: ${g.outcome}`,
    "",
    outcomeText(record),
    "",
    `The job times \`${record.router}\` on the fixture \`${record.fixture}\` of \`fa1dd82~1\` (${short(record.board)}), with 10 000 nodes. Each arm routes the same board.`,
    `Each route has its own fresh process. Each arm has ${record.rounds} rounds, and in each round the arms take turns. The A/A arm is a second copy of the parent.`,
    "",
    `- The head: ${short(record.head)} ${cell(record.head.subject)}`,
    `- The parent: ${short(record.parent)} ${cell(record.parent.subject)}`,
    `- The fixed base: ${short(record.fixed)} since ${record.fixedBase.date}. ${cell(record.fixedBase.reason)}`,
    "",
  ];
  if (record.skipped !== null) lines.push(`**The job timed no arm:** ${record.skipped}`, "");
  const floor = b.pooled ? "" : `. The pool has fewer than ${POOL_MIN_RUNS} runs, so the limit uses the floor ${MIN_EFFECT}`;
  lines.push(
    "| noise | value |",
    "|---|---|",
    `| the A/A spread of this run | ${fmt(p?.spread)} |`,
    `| the noise cap | ${fmt(NOISE_CAP, 2)}. Above it, the run cannot decide. |`,
    `| the pooled A/A spread | ${fmt(b.spread)}, from ${b.ratios} A/A ratios of ${b.runs} quiet runs${floor} |`,
    `| the limit against the parent | ${fmt(b.limit)} |`,
    `| the head against the parent | ${g.words} |`,
    "",
    "| check | ratio | limit | verdict |",
    "|---|---:|---:|---|",
    ...g.checks.map((c) => `| head / ${c.check} | ${fmt(c.ratio)} | ${fmt(c.limit)} | ${c.verdict} |`),
    "",
    `The limit of the check against the parent is 1 + max(0.05, the pooled A/A spread). The pool needs ${POOL_MIN_RUNS} quiet runs or more. The limit of the check against the fixed base is 1.10.`,
    `The A/A spread of a run is p90 of |r - 1| over its A/A round ratios. The ${p?.aa.length ?? 0} A/A round ratios of this run are ${p === null || p.aa.length === 0 ? "-" : p.aa.map((r) => fmt(r)).join(", ")}.`,
    "",
  );
  if (record.home !== null) {
    const span = record.home.low === null ? "" : ` Its interval is ${fmt(record.home.low)} to ${fmt(record.home.high)}.`;
    lines.push(
      `The verdict of \`@mark1russell7/rigor-bench\` (\`timeVerdict\`, rule \`difference\`) on the same rounds: **${record.home.outcome}**.${span} The gate shows this verdict, but it does not use it.`,
      "",
    );
  }
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
