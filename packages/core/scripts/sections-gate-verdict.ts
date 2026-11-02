// The verdict of the sections time gate (GATE-LIMITS slice 1). The workflow `Sections gate` (.github/workflows/sections-gate.yml) starts it.
// One job times `sections-tree` on the board of the bisect (10 000 nodes) in fresh processes, with four arms in turn:
// the parent of the pull request, the head, the A/A copy of the parent and the fixed base of `data/sections-gate/fixed-base.json`.
// The gate has two checks (docs/PROMOTION.md, "The sections time gate"):
// - Against the parent: the ratio head/parent fails above 1 + max(`MIN_EFFECT`, the A/A spread of the job).
// - Against the fixed base: the ratio head/fixed base fails above `FIXED_LIMIT`. A check against the parent alone misses a slow drift in many small steps.
// This module imports only node modules and the gates, so a job with no installed packages can start it.
import { aaId, type PairedReport, type RecordEnv } from "./gates/paired.ts";
import { COMMIT_ARM, PARENT_ARM, armRows, type ArmRow } from "./gates/pair-confirm.ts";
import { InputError } from "./gates/inputs.ts";
import { type Side } from "./sections-confirm-verdict.ts";

/** The router of the gate. SECTIONS-SLOW found its drift. */
export const GATE_ROUTER = "sections-tree";
/** The timed rounds of each arm by default. */
export const GATE_ROUNDS = 10;
/** The id of the arm of the fixed base. */
export const FIXED_ARM = "fixed";
/** The smallest step of the check against the parent: 5 %. The A/A spread of the job replaces it when the spread is larger. */
export const MIN_EFFECT = 0.05;
/** The limit of the ratio head/fixed base: 1.10. */
export const FIXED_LIMIT = 1.1;
/** The schema of the file of the fixed base. */
export const BASE_SCHEMA = "sections-gate-base/1";
/** The schema of the record of the gate. */
export const GATE_SCHEMA = "sections-gate/1";
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

/** The verdict of one check of the gate. Only `pass` passes, so a check with no time fails the gate (FAIL-CLOSED). */
export type GateVerdict = "pass" | "fail" | "not measured";

/** One check of the gate. */
export interface GateCheck {
  readonly check: "parent" | "fixed base";
  /** The median time of the head over the median time of the other side. */
  readonly ratio: number | null;
  /** The ratio limit. Above it, the check fails. */
  readonly limit: number | null;
  readonly verdict: GateVerdict;
}

/** This function gives the limit of the check against the parent: 1 + max(`MIN_EFFECT`, spread). A spread that is not a number gives `null`. */
export const parentLimit = (spread: number): number | null => (Number.isFinite(spread) ? 1 + Math.max(MIN_EFFECT, spread) : null);

/** This function compares a ratio with a limit. A ratio on the limit passes. */
function verdictOf(ratio: number | null, limit: number | null): GateVerdict {
  if (ratio === null || limit === null || !Number.isFinite(ratio)) return "not measured";
  return ratio > limit ? "fail" : "pass";
}

/** The result of the gate on one report. */
export interface GateResult {
  /** The row of the head against the parent, with the A/A ratios and the spread of the job. */
  readonly parent: ArmRow | null;
  /** The row of the fixed base against the parent. Its ratio is the median of the fixed base over the median of the parent. */
  readonly fixed: ArmRow | null;
  readonly checks: readonly [GateCheck, GateCheck];
  /** This value is `true` only when the two checks pass. */
  readonly pass: boolean;
}

/**
 * This function gives the two checks of the gate on a report.
 *
 * - The report has the base `parent`, the arms `commit` and `fixed`, and the A/A arm. Else the function throws a `RangeError`.
 * - The check against the parent fails when the ratio head/parent is above 1 + max(`MIN_EFFECT`, the A/A spread of the job).
 * - The check against the fixed base fails when the ratio head/fixed base is above `FIXED_LIMIT`. The two medians come from the same job.
 * - A check with no time gives `not measured`, and the gate does not pass.
 */
export function gateVerdict(report: PairedReport, router: string = GATE_ROUTER): GateResult {
  if (report.base !== PARENT_ARM || !report.arms.includes(COMMIT_ARM) || !report.arms.includes(FIXED_ARM) || !report.arms.includes(aaId(PARENT_ARM)))
    throw new RangeError(`A gate report has the base ${PARENT_ARM}, the arms ${COMMIT_ARM} and ${FIXED_ARM}, and the A/A arm ${aaId(PARENT_ARM)}.`);
  const parent = armRows(report, COMMIT_ARM).find((r) => r.input === router) ?? null;
  const fixed = armRows(report, FIXED_ARM).find((r) => r.input === router) ?? null;
  const limit = parent === null ? null : parentLimit(parent.spread);
  const toFixed = parent?.armMs != null && fixed?.armMs != null && fixed.armMs > 0 ? parent.armMs / fixed.armMs : null;
  const checks: [GateCheck, GateCheck] = [
    { check: "parent", ratio: parent?.ratio ?? null, limit, verdict: verdictOf(parent?.ratio ?? null, limit) },
    { check: "fixed base", ratio: toFixed, limit: FIXED_LIMIT, verdict: verdictOf(toFixed, FIXED_LIMIT) },
  ];
  return { parent, fixed, checks, pass: checks.every((c) => c.verdict === "pass") };
}

/** The record of one run of the gate, with the schema `sections-gate/1`. */
export interface GateRecord {
  readonly schema: typeof GATE_SCHEMA;
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
  /** The reason when the job timed no arm, else `null`. */
  readonly skipped: string | null;
  readonly env: RecordEnv;
  /** The paired report with the arms `parent`, `commit`, `fixed` and `parent~aa`. It is `null` when the job timed no arm. */
  readonly report: PairedReport | null;
}

/** This function gives the result of a record. A record with no report gives two checks with no time. */
export function recordVerdict(record: GateRecord): GateResult {
  if (record.report === null) {
    const none = (check: GateCheck["check"], limit: number | null): GateCheck => ({ check, ratio: null, limit, verdict: "not measured" });
    return { parent: null, fixed: null, checks: [none("parent", null), none("fixed base", FIXED_LIMIT)], pass: false };
  }
  return gateVerdict(record.report, record.router);
}

const fmt = (x: number | null | undefined, d = 3): string => (x == null ? "-" : Number.isFinite(x) ? x.toFixed(d) : String(x));
/** This function writes a time in ms, or in s above 10 s. */
const time = (ms: number | null | undefined): string => (ms == null || !Number.isFinite(ms) ? "-" : ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(1)} ms`);
/** This function keeps a text in one cell of a table. */
const cell = (text: string): string => text.replace(/\|/g, "/");
const short = (s: Side): string => `\`${s.sha.slice(0, 7)}\``;

/** This function gives the Markdown text of a record of the gate: the arms, the two checks and the verdict. */
export function gateText(record: GateRecord): string[] {
  const g = recordVerdict(record);
  const lines = [
    `# The sections time gate: ${g.pass ? "pass" : "fail"}`,
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
  const p = g.parent;
  lines.push(
    "| check | ratio | limit | verdict |",
    "|---|---:|---:|---|",
    ...g.checks.map((c) => `| head / ${c.check} | ${fmt(c.ratio)} | ${fmt(c.limit)} | ${c.verdict} |`),
    "",
    "The limit of the check against the parent is 1 + max(0.05, the A/A spread of the job). The limit of the check against the fixed base is 1.10.",
    `The A/A spread of the job is p90 of |r - 1| over its ${p?.aa.length ?? 0} A/A round ratios: ${fmt(p?.spread)}. The A/A round ratios are ${p === null || p.aa.length === 0 ? "-" : p.aa.map((r) => fmt(r)).join(", ")}.`,
    "",
    "| arm | median time |",
    "|---|---:|",
    `| parent | ${time(p?.baseMs)} |`,
    `| head | ${time(p?.armMs)} |`,
    `| fixed base | ${time(g.fixed?.armMs)} |`,
    "",
  );
  if (p !== null && Number.isFinite(p.spread) && p.spread >= FIXED_LIMIT - 1)
    lines.push(`The A/A spread ${fmt(p.spread)} is not below ${fmt(FIXED_LIMIT - 1, 2)}, so the noise of this job is as large as the step that the check against the fixed base finds.`, "");
  lines.push(`The computer: ${cell(record.env.cpu)}, ${record.env.cores} cores, Node.js ${record.env.node}.`, "");
  return lines;
}
