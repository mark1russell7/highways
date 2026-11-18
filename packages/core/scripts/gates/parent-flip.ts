// The flip of the check against the parent of the sections gate (GATE-FLIP-PARENT).
// The fixture `PARENT_RUN_FILE` holds a quiet run of the gate from CI and the pool of its parent. This module replays that run through the verdicts of the gate.
// The clean arm replays the run as recorded. The slower arm multiplies each head time by the margin of the check, so the interval of the home moves by exactly that factor.
// The bootstrap of the home has a fixed seed, so the replay has no runner noise. A test holds the flip in each run of `CI OK`.
// This module imports `home-verdict.ts`, which imports `@mark1russell7/rigor-bench`. So `flip.ts` loads it with a dynamic import.
import type { ArmRead } from "./flip.ts";
import { homeVerdict, limitHome } from "./home-verdict.ts";
import { InputError } from "./inputs.ts";
import { COMMIT_ARM } from "./pair-confirm.ts";
import { pairedReport, type PairedReport, type RawTimes } from "./paired.ts";
import {
  FIXED_ARM,
  FIXED_LIMIT,
  GATE_SCHEMA,
  fixedRecord,
  gateExit,
  gateOptions,
  homeRecord,
  parsePool,
  recordVerdict,
  sealRecord,
  type AaPool,
  type GateRecord,
} from "../sections-gate-verdict.ts";

/** The schema of the fixture. */
export const PARENT_RUN_SCHEMA = "gate-flip-parent/1";
/** The file of the fixture, relative to `packages/core`. */
export const PARENT_RUN_FILE = "scripts/data/gate-flip/parent-run.json";

/** The fixture: one quiet run of the gate with its report, and the pool of the home at its parent. */
export interface ParentRun {
  readonly schema: typeof PARENT_RUN_SCHEMA;
  readonly note: string;
  /** The workflow run, the job, the arm and the number of the gate run that wrote the record. */
  readonly source: { readonly run: number; readonly job: string; readonly arm: string; readonly attempt: number };
  readonly record: GateRecord;
  readonly pool: AaPool;
}

/**
 * This function reads the fixture. The function throws an `InputError` for a bad value.
 * The record has the schema `GATE_SCHEMA` and a report, and the pool is a valid pool.
 */
export function parseParentRun(text: string): ParentRun {
  let value: Partial<ParentRun>;
  try {
    value = JSON.parse(text) as Partial<ParentRun>;
  } catch {
    throw new InputError(`The file ${PARENT_RUN_FILE} is not JSON.`);
  }
  if (value?.schema !== PARENT_RUN_SCHEMA) throw new InputError(`The file ${PARENT_RUN_FILE} is not of schema ${PARENT_RUN_SCHEMA}.`);
  const record = value.record;
  if (record?.schema !== GATE_SCHEMA || record.report === null || record.report === undefined) throw new InputError(`The record of ${PARENT_RUN_FILE} is not a run of schema ${GATE_SCHEMA} with a report.`);
  if (typeof value.source?.run !== "number" || typeof value.note !== "string") throw new InputError(`The file ${PARENT_RUN_FILE} has no source or no note.`);
  return { schema: PARENT_RUN_SCHEMA, note: value.note, source: value.source, record, pool: parsePool(JSON.stringify(value.pool)) };
}

/**
 * This function gives a report with the times of one arm on one input multiplied by `factor`.
 * The function `pairedReport` makes the report again from the times, so the medians, the ratios and the noise floor agree with the times.
 * The order of each round stays. A factor of 1 gives the same report.
 */
export function slowedReport(report: PairedReport, input: string, arm: string, factor: number): PairedReport {
  if (report.arms[0] !== report.base) throw new RangeError(`The first arm of the report is ${report.arms[0]}, not the base ${report.base}.`);
  if (!(factor > 0 && Number.isFinite(factor))) throw new RangeError(`The factor ${factor} is not a finite number above 0.`);
  const raw: RawTimes = {
    ms: new Map(report.inputs.map((row) => [row.id, new Map(report.arms.map((a) => [a, (row.ms[a] ?? []).map((t) => (row.id === input && a === arm ? t * factor : t))]))])),
    peak: new Map(report.inputs.map((row) => [row.id, new Map(Object.entries(row.peakRss ?? {}))])),
    ...(report.orders === undefined ? {} : { orders: report.orders.map((o) => [...o]) }),
  };
  const inputs = report.inputs.map((row) => ({ id: row.id, ...(row.group === undefined ? {} : { group: row.group }) }));
  return pairedReport(report.mode, report.env, report.context, report.arms.map((id) => ({ id })), inputs, raw);
}

/**
 * This function gives the record of a run of the gate on a report, as the job of the gate decides it.
 * The verdicts of the home use the pool, as in `runGate` of `sections-bisect.ts`. Then `sealRecord` gives the end of the run.
 */
export function replayRun(record: GateRecord, report: PairedReport, pool: AaPool): GateRecord {
  const home = homeRecord(homeVerdict(report, record.router, COMMIT_ARM, gateOptions(pool)));
  const fixedCheck = fixedRecord(limitHome(report, record.router, FIXED_ARM, COMMIT_ARM, FIXED_LIMIT));
  const { end: _end, noRead: _noRead, ...run } = record;
  return sealRecord({ ...run, report, home, fixedCheck });
}

/**
 * This function gives the read of one arm: the exit code of the gate and its text, as in the arm `sections` of `flip.ts`.
 * A replay has no runner noise, so a run that cannot decide is not a no read. It is a change of the verdicts, and the arm is not as stated.
 */
export function replayRead(id: string, fault: string | null, run: GateRecord): ArmRead {
  const verdict = recordVerdict(run);
  return { id, fault, exit: gateExit(run), text: `${verdict.outcome}, in the words of the home ${verdict.words}: ${verdict.reason}`, ratio: verdict.parent?.ratio ?? null, runs: 1 };
}

/** The two arms of the flip, and the factor of the slower arm. */
export interface ParentFlip {
  readonly clean: ArmRead;
  readonly slower: ArmRead;
  /** The factor of the head times of the slower arm: e to the power of the margin of the check against the parent. */
  readonly factor: number;
}

/**
 * This function gives the flip of the check against the parent from the fixture.
 *
 * - The clean arm replays the recorded report.
 * - The slower arm multiplies each head time by e to the power of the margin of the clean replay. The margin of the rule `difference` does not change, because the A/A times and the pool do not change.
 * - The clean interval is in the margin, so its low end is at or above 1 / factor. Thus the low end of the slower interval is at or above 1.
 */
export function parentFlip(run: ParentRun): ParentFlip {
  const report = run.record.report!;
  const clean = replayRun(run.record, report, run.pool);
  const margin = clean.home?.margin;
  if (margin === null || margin === undefined) throw new RangeError("The clean replay has no margin of the check against the parent.");
  const factor = Math.exp(margin);
  const slower = replayRun(run.record, slowedReport(report, run.record.router, COMMIT_ARM, factor), run.pool);
  return {
    clean: replayRead("clean", null, clean),
    slower: replayRead("slower", `each head time times ${factor.toFixed(4)}, the margin of the check against the parent`, slower),
    factor,
  };
}
