// The rules of the branch `bench-data`. The nightly run of `Bench` lands its record on that branch, and the Pages build reads it.
import type { BenchMeta } from "./bench-label.ts";

/** The name of the branch that holds the newest record. */
export const BENCH_BRANCH = "bench-data";

/** The facts of one run of `Bench`. */
export interface BenchRun {
  readonly run: number;
  readonly sha: string;
  /** The start of the run in UTC. The data gate of the pages counts the age from this time. */
  readonly time: string;
  /** The version of the engine at the commit of the run. */
  readonly core: string;
  /** The largest fixture of the run, in nodes. */
  readonly max: number;
}

/** This function gives the fields of `bench-meta.json` of a run. */
export function metaOfRun(run: BenchRun): BenchMeta {
  return { run: run.run, sha: run.sha, date: run.time.slice(0, 10), time: run.time, core: run.core, max: run.max };
}

/** This function tells if `next` comes from a later run than `current`. A record with no valid time is not later than a record. */
export function isLaterRecord(next: BenchMeta, current: BenchMeta | undefined): boolean {
  const at = (meta: BenchMeta | undefined): number => Date.parse(meta?.time ?? "");
  if (Number.isNaN(at(next))) return false;
  return Number.isNaN(at(current)) || at(next) > at(current);
}

/** This function gives the reason that a record cannot land, or `undefined` when the record can land. */
export function recordFault(rows: unknown, meta: BenchMeta): string | undefined {
  if (!Array.isArray(rows) || rows.length === 0) return "bench.json has no rows.";
  if (meta.run === undefined || !(meta.run > 0)) return "The meta has no run.";
  if (meta.sha === undefined || !/^[0-9a-f]{40}$/.test(meta.sha)) return "The meta has no full commit.";
  if (Number.isNaN(Date.parse(meta.time ?? ""))) return "The meta has no time.";
  if (meta.core === undefined || !/^\d+\.\d+\.\d+/.test(meta.core)) return "The meta has no version of the engine.";
  return undefined;
}
