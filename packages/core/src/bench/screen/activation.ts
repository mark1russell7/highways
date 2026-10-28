// The activation test of a screen (ACTIVATION): did the idea of a candidate run on the input?
// The functions of this file know no type of `highways`. They are a local copy of the functions of `@mark1russell7/layout-contract` 0.2.5.
// The core has no run-time dependency, so it keeps this copy. The test `contract.test.ts` compares the copy with the contract, as for `compareMeasure`.
import { canonicalJson, RECORD_EPS, sha256Hex } from "./hash.ts";

/** The options of `outputHash`. */
export interface HashOptions {
  /**
   * The step of the grid of the numbers. The default is `RECORD_EPS`, so a number keeps 3 decimals.
   * The value `0` keeps the exact numbers. A negative value or a value that is not finite causes a `RangeError`.
   */
  readonly grid?: number;
}

/** This function gives the factor of a grid: `1 / grid`, or `undefined` for the exact numbers. */
function gridFactor(options: HashOptions): number | undefined {
  const grid = options.grid ?? RECORD_EPS;
  if (!Number.isFinite(grid) || grid < 0) throw new RangeError(`The grid ${grid} is not a finite number of 0 or more.`);
  return grid === 0 ? undefined : 1 / grid;
}

/**
 * This function gives a copy of a value with each number on the grid. The value `-0` becomes `0`.
 * It throws a `RangeError` for a number that is not finite. The message gives the path of the number.
 */
function onGrid(value: unknown, path: string, k: number | undefined): unknown {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`The value has the number ${value} at ${path}. JSON has no form for it.`);
    if (k === undefined) return value;
    const r = Math.round(value * k) / k;
    if (!Number.isFinite(r)) throw new RangeError(`The number at ${path} is too large for the grid.`);
    return r === 0 ? 0 : r;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v: unknown, i) => onGrid(v, `${path}[${i}]`, k));
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(o)) out[key] = onGrid(o[key], `${path}.${key}`, k);
  return out;
}

/**
 * This function gives the hash of an output: the first 16 hex characters of the SHA-256 of its canonical JSON.
 * The canonical JSON has the keys of each object in sorted order. Before it, each number goes to the nearest point of the grid.
 * With the default grid `RECORD_EPS`, the rounding is `round3`. The function throws a `RangeError` for `NaN` and for an infinite number.
 */
export function outputHash(value: unknown, options: HashOptions = {}): string {
  return sha256Hex(canonicalJson(onGrid(value, "$", gridFactor(options)))).slice(0, 16);
}

/** One output group: the candidates with the same output hash on each decision input. */
export interface OutputGroup {
  /** The id of the group: its first member. */
  readonly id: string;
  /** The ids of the candidates of the group, in sorted order. */
  readonly members: readonly string[];
}

/**
 * This function gives the output groups of the candidates. The key of `hashes` is the id of a candidate.
 * Its value is the list of the output hashes of the candidate, in the order of the decision inputs.
 * Candidates with equal lists make one group. The groups are in the order of their ids.
 * The function throws a `RangeError` when two lists have different lengths.
 */
export function outputGroups(hashes: Readonly<Record<string, readonly string[]>>): OutputGroup[] {
  const byList = new Map<string, string[]>();
  let first: string | undefined;
  for (const id of Object.keys(hashes)) {
    const list = hashes[id]!;
    if (first === undefined) first = id;
    else if (list.length !== hashes[first]!.length)
      throw new RangeError(`The candidate "${id}" has ${list.length} hashes, but "${first}" has ${hashes[first]!.length}.`);
    const key = JSON.stringify(list);
    const members = byList.get(key);
    if (members) members.push(id);
    else byList.set(key, [id]);
  }
  const groups = [...byList.values()].map((members): OutputGroup => {
    const sorted = [...members].sort();
    return { id: sorted[0]!, members: sorted };
  });
  return groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The evidence that a candidate is exercised on its decision inputs. */
export interface ExerciseEvidence {
  /** The move counts of the candidate, by name. A record keeps each one as the trace measure `move.<name>`. */
  readonly moves?: Readonly<Record<string, number>>;
  /** The output hashes of the candidate, in the order of the decision inputs. */
  readonly hashes?: readonly string[];
  /** The output hashes of the base of the candidate, in the same order. */
  readonly baseHashes?: readonly string[];
}

/**
 * This function tells if a candidate is exercised. It gives `true` when a move count is more than 0.
 * It also gives `true` when `hashes` and `baseHashes` are different at one place or more. Without evidence, it gives `false`.
 * The function throws a `RangeError` when only one of the two lists is given, or when their lengths are different.
 */
export function exercised(evidence: ExerciseEvidence): boolean {
  const { moves, hashes, baseHashes } = evidence;
  if ((hashes === undefined) !== (baseHashes === undefined)) throw new RangeError("The evidence must have both hashes and baseHashes, or neither of them.");
  if (hashes && baseHashes && hashes.length !== baseHashes.length)
    throw new RangeError(`The candidate has ${hashes.length} hashes, but its base has ${baseHashes.length}.`);
  if (moves && Object.values(moves).some((n) => n > 0)) return true;
  if (hashes && baseHashes) return hashes.some((h, i) => h !== baseHashes[i]);
  return false;
}
