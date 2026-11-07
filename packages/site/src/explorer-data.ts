// The data of the explorer page (EXPLORER-1). These functions read a sweep record only through `parseResponseRecord`.
// They do not read files, so the page and the tests use them.
import { parseResponseRecord } from "@mark1russell7/rigor-statistics";

/** The folder of the sweep records, relative to the root of the repository. */
export const SWEEP_DIR = "docs/research/sweeps";

/** The two categorical dimensions that name a strategy card in a sweep record. */
export const CARD_DIMENSIONS = ["step", "strategy"] as const;

/** The size and the date of one sweep record. The page shows them, so a small record does not look like the full space. */
export interface SweepFacts {
  /** The name of the file in the folder of the sweep records. */
  readonly file: string;
  /** The field `name` of the record. A record with faults has an empty string. */
  readonly name: string;
  /** The date of the last commit of the file, in the form `YYYY-MM-DD`. Outside a git checkout, the field is absent. */
  readonly date?: string;
  /** The levels of the dimension `step`. */
  readonly steps: readonly string[];
  /** The levels of the dimension `strategy`. */
  readonly strategies: readonly string[];
  /** The number of dimensions that are not `step` or `strategy`. Each one is an option of a strategy. */
  readonly options: number;
  /** The number of measured points. */
  readonly points: number;
  /** The number of groups. Each group is one input, so this number is the number of inputs. */
  readonly inputs: number;
  /** The labels of the measures. */
  readonly measures: readonly string[];
  /** The number of faults that `parseResponseRecord` found. A good record has 0. */
  readonly faults: number;
}

/** The data of the explorer page: the record, its facts and the names of the other records of the folder. */
export interface ExplorerPage {
  /** The record as parsed JSON. The explorer reads it only through `parseResponseRecord`. */
  readonly record: unknown;
  readonly facts: SweepFacts;
  /** The other files of the folder, in the order of their names. */
  readonly others: readonly string[];
}

/** This function gives the levels of a categorical dimension of a record, or an empty list when the record has no such dimension. */
function levelsOf(dimensions: readonly { readonly id: string; readonly kind: string; readonly levels?: readonly unknown[] }[], id: string): string[] {
  const d = dimensions.find((x) => x.id === id && x.kind === "categorical");
  return d?.levels?.map(String) ?? [];
}

/** This function gives the facts of a sweep record. A record that `parseResponseRecord` refuses gives its number of faults and 0 for each count. */
export function sweepFacts(file: string, value: unknown, date?: string): SweepFacts {
  const parsed = parseResponseRecord(value);
  const when = date === undefined ? {} : { date };
  if (!parsed.ok) return { file, name: "", ...when, steps: [], strategies: [], options: 0, points: 0, inputs: 0, measures: [], faults: parsed.faults.length };
  const { name, dimensions, points, measures } = parsed.record;
  const named: readonly string[] = CARD_DIMENSIONS;
  return {
    file,
    name,
    ...when,
    steps: levelsOf(dimensions, "step"),
    strategies: levelsOf(dimensions, "strategy"),
    options: dimensions.filter((d) => !named.includes(d.id)).length,
    points: points.length,
    inputs: new Set(points.map((p) => p.group ?? p.id)).size,
    measures: measures.map((m) => m.label),
    faults: 0,
  };
}

/** This function tells if a record is a good sweep record: `parseResponseRecord` takes it, and it has the categorical dimensions `step` and `strategy`. */
export function isSweepRecord(value: unknown): boolean {
  const parsed = parseResponseRecord(value);
  return parsed.ok && CARD_DIMENSIONS.every((id) => parsed.record.dimensions.some((d) => d.id === id && d.kind === "categorical"));
}

/** This function gives the id of the first option dimension of a record, for the first horizontal axis. A record with no option gives `undefined`. */
export function firstOption(value: unknown): string | undefined {
  const parsed = parseResponseRecord(value);
  if (!parsed.ok) return undefined;
  const named: readonly string[] = CARD_DIMENSIONS;
  return parsed.record.dimensions.find((d) => !named.includes(d.id))?.id;
}
