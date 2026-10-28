// The activation test of a screen (ACTIVATION): did the idea of a candidate run on the input?
// The functions of this file know no type of `highways`. They are a local copy of the functions of `@mark1russell7/layout-contract` 0.2.5 (L19).
// Keep this copy until that version is on npm. Then the test compares the two, as for `compareMeasure`.
import { canonicalJson, sha256Hex } from "./hash.ts";

/** The options of `outputHash`. */
export interface OutputHashOptions {
  /** The grid of the numbers. Each number goes to the nearest multiple of `grid`, and `-0` becomes `0`. Without it, the numbers stay exact. */
  readonly grid?: number;
}

/** This function puts each number of a JSON value on the grid `grid`. It keeps the other values. */
function onGrid(value: unknown, grid: number): unknown {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return value;
    const steps = 1 / grid;
    const r = Math.round(value * steps) / steps;
    return r === 0 ? 0 : r;
  }
  if (Array.isArray(value)) return value.map((v) => onGrid(v, grid));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = onGrid(v, grid);
    return out;
  }
  return value;
}

/**
 * This function gives the hash of the output of a stage: the first 16 hex characters of the SHA-256 of its canonical JSON.
 * The canonical JSON has the keys of each object in sorted order. With `grid`, each number goes to the grid first.
 * Two outputs with the same hash are the same output, at the precision of the grid.
 */
export function outputHash(value: unknown, options: OutputHashOptions = {}): string {
  const v = options.grid === undefined ? value : onGrid(value, options.grid);
  return sha256Hex(canonicalJson(v)).slice(0, 16);
}

/** One output group: the candidates with the same list of output hashes. The id of the group is its first candidate. */
export interface OutputGroup {
  readonly id: string;
  /** The candidates of the group, in sorted order. */
  readonly members: readonly string[];
}

/**
 * This function groups the candidates by their output hashes. The hashes of a candidate are a list, one hash for each input, in the same order for each candidate.
 * The candidates with the same list form one group. A group with one member is a group too.
 * The groups are in the order of their first candidate, and the id of a group is that candidate.
 */
export function outputGroups(hashesByCandidate: Readonly<Record<string, readonly string[]>>): OutputGroup[] {
  const byKey = new Map<string, string[]>();
  for (const name of Object.keys(hashesByCandidate).sort()) {
    const key = JSON.stringify(hashesByCandidate[name]);
    const list = byKey.get(key);
    if (list) list.push(name);
    else byKey.set(key, [name]);
  }
  return [...byKey.values()].map((members) => ({ id: members[0]!, members })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The facts of a candidate on the decision inputs, for `exercised`. */
export interface ExercisedFacts {
  /** The counts of the own move of the candidate, for example `{ "move.powerEdge": 3 }`. A list holds one record of counts for each input. */
  readonly moves?: Readonly<Record<string, number>> | readonly Readonly<Record<string, number>>[];
  /** The output hash of the candidate on each decision input. */
  readonly hashes?: readonly (string | undefined)[];
  /** The output hash of the base of the candidate on the same inputs, in the same order. */
  readonly baseHashes?: readonly (string | undefined)[];
}

/**
 * This function tells if a candidate is exercised: a move count is above 0, or a decision hash differs from the base hash.
 * A hash or a base hash that is absent (a skipped run) does not count. A candidate that is not exercised gets the verdict `not-exercised`.
 */
export function exercised(facts: ExercisedFacts): boolean {
  const moves = facts.moves === undefined ? [] : Array.isArray(facts.moves) ? facts.moves : [facts.moves];
  for (const m of moves as readonly Readonly<Record<string, number>>[]) for (const n of Object.values(m)) if (n > 0) return true;
  const own = facts.hashes ?? [];
  const base = facts.baseHashes ?? [];
  for (let i = 0; i < own.length; i++) {
    const a = own[i];
    const b = base[i];
    if (a !== undefined && b !== undefined && a !== b) return true;
  }
  return false;
}
