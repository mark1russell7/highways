// The case reads of the gates of highways, for their check lines (NO-READ-LINE).
// `gateLine` of `@mark1russell7/rigor-bench` gives each line from these reads, and `writeGateLine` writes it.
// This module has only the parts of highways: the cases of a mixed pair, of a time test and of the sections gate.
// It imports a package, so the modules that start with no install (`time-gate.ts`, `sections-gate-verdict.ts`) do not import it.
import { gateLine, jobModels, type CaseRead, type GateLine } from "@mark1russell7/rigor-bench";
import { recordVerdict, type GateCheck, type GateRecord } from "../sections-gate-verdict.ts";
import type { TimeCheck, TimeTest } from "./time-gate.ts";

/** A record with a value of each measure, for an input and a seed. */
interface Measured {
  readonly input: string;
  readonly seed: number;
  readonly measures: Readonly<Record<string, number>>;
}

/**
 * This function gives one case read for each input and seed with a value of the measure `name`, as `input#seed`.
 * A case is `no read` when a filter removed one of its values, and `pass` when each value stays.
 * The list `after` has the records of `before` in the same order, for example the result of `withoutMixedKinds`.
 */
export function droppedReads(before: readonly Measured[], after: readonly Measured[], name: string): CaseRead[] {
  if (after.length !== before.length) throw new RangeError(`The filter gave ${after.length} records of ${before.length}, so the records do not pair.`);
  const dropped = new Map<string, boolean>();
  before.forEach((r, i) => {
    if (r.measures[name] === undefined) return;
    const id = `${r.input}#${r.seed}`;
    dropped.set(id, (dropped.get(id) ?? false) || after[i]!.measures[name] === undefined);
  });
  return [...dropped].map(([id, d]) => ({ case: id, outcome: d ? "no read" : "pass" }));
}

/** The reason of a value that a verdict leaves out, because its records pair an estimate with a full count (BENCH-PAIRS-HEAP). */
export const mixedKindsWhy = (name: string): string => `The measure ${name} pairs an estimate with a full count, so the verdict leaves these inputs out`;

/**
 * This function gives the report-only check line of the values of the measure `name` that a filter removed.
 * Records with no value of the measure give no cases and no line, because the verdict then reads no value.
 */
export function droppedLine(before: readonly Measured[], after: readonly Measured[], name: string, title: string): GateLine | undefined {
  const reads = droppedReads(before, after, name);
  return reads.length === 0 ? undefined : gateLine(reads, { title, enforced: false, reason: mixedKindsWhy(name) });
}

/** The outcome of a check of the time test in the words that `gateLine` reads. */
const TIME_READ: Readonly<Record<TimeCheck["verdict"], string>> = { pass: "pass", fail: "slower", noise: "cannot decide", "not measured": "no read" };

/**
 * This function gives one case read for each check of a time test.
 * A fail is `slower`, a check that cannot decide is `cannot decide`, and a tail with no input above the floor is `no read`.
 * A void test has no checks, so it gives an empty list. `gateLine` reads an empty list as a no read.
 */
export function timeReads(t: TimeTest): CaseRead[] {
  return t.checks.map((c) => ({ case: `the ${c.check} over ${t.inputs} inputs`, outcome: TIME_READ[c.verdict] }));
}

/**
 * This function gives the check line of a time test that does not pass each check.
 * The time test only reports, so the line is a warning. The line names each check that is not a pass, the reason and the jobs on each CPU model.
 * A test that passes each check gives `undefined`.
 */
export function timeLine(t: TimeTest, title: string): GateLine | undefined {
  const parts = [...new Set(t.checks.filter((c) => c.verdict !== "pass").map((c) => (c.verdict === "fail" ? `The ${c.check} ${c.worst.toFixed(2)} is above ${c.limit}` : (c.why ?? c.verdict))))];
  const few = `${t.jobs} ${t.jobs === 1 ? "job" : "jobs"} of ${t.policy}`;
  const why = t.status === "void" ? (t.reason ?? "no paired time report") : t.jobs < t.policy ? `${parts.join(", and ") || few}, so the checks cannot decide` : parts.join(", and ");
  const reason = why.charAt(0).toUpperCase() + why.slice(1);
  return gateLine(timeReads(t), { title, enforced: false, reason, ...(t.cpus.length === 0 ? {} : { models: jobModels(t.cpus.map((cpu) => ({ cpu }))) }) });
}

/**
 * This function gives one case read for each check of a record of the sections gate.
 * A check that cannot decide is `cannot decide`, and a check with no time is `no read`.
 * A fail against the parent is `slower`, and a fail against the fixed base is `beyond` its limit.
 */
export function checkReads(record: GateRecord): CaseRead[] {
  const read = `${record.router} on ${record.fixture}, ${record.rounds} rounds of each arm`;
  const word = (c: GateCheck): string => (c.verdict === "not measured" ? "no read" : c.verdict !== "fail" ? c.verdict : c.check === "parent" ? "slower" : "beyond");
  return recordVerdict(record).checks.map((c) => ({ case: `${read}, against the ${c.check}`, outcome: word(c) }));
}

/**
 * This function gives the check line of a run of the sections gate that does not pass.
 * A first run that cannot decide only reports, because the job `retry` decides. So its line is a warning. Each other line is an error.
 * The four arms of a run time on one runner, so the line names one CPU model with 1 job. A pass gives no line.
 */
export function checkLine(record: GateRecord): GateLine | undefined {
  const g = recordVerdict(record);
  if (g.outcome === "pass") return undefined;
  const retry = g.outcome === "cannot decide" && record.attempt === 1;
  const next =
    g.outcome === "cannot decide"
      ? retry
        ? "The job retry times the gate on a fresh runner."
        : "The first run could not decide too, so the gate fails."
      : g.words === "not measured"
        ? `${record.skipped === null ? "" : `${record.skipped} `}The gate fails (FAIL-CLOSED).`
        : "The gate fails.";
  return gateLine(checkReads(record), { title: `Sections gate, run ${record.attempt} of 2`, enforced: !retry, reason: `${g.reason} ${next}`, models: jobModels([record.env]) });
}
