import { RECORD_EPS } from "./hash.ts";

/**
 * The smallest change of a measure that counts as better or worse (WIN-RES).
 * A number is an absolute change. `{ rel }` is a share of the larger of the two absolute values.
 * The threshold is not less than `RECORD_EPS` at any time.
 */
export type MinEffect = number | { readonly rel: number };

/** The result of a compare of a candidate with a baseline on one measure. A tie is not a win. */
export type MeasureCompare = "better" | "worse" | "tie";

/** The part of a measure that a compare reads: the better side and the minimum effect. */
export interface CompareSpec {
  readonly direction: "lower" | "higher";
  readonly minEffect?: MinEffect;
}

/**
 * This function gives the threshold of a compare of the values `a` and `b`.
 * The threshold is `max(RECORD_EPS, m)` for a number `m`, or `max(RECORD_EPS, m.rel * max(|a|, |b|))` for a relative `m`.
 * The larger value of the two makes the threshold the same after a swap of `a` and `b`.
 * A product that is not finite gives `RECORD_EPS`.
 * This copy follows `docs/PROMOTION.md`. The contract `@mark1russell7/layout-contract` has the same function from 0.2.2, and `contract.test.ts` compares the two.
 */
export function minEffectOf(spec: { readonly minEffect?: MinEffect }, a = 0, b = 0): number {
  const m = spec.minEffect ?? 0;
  const t = typeof m === "number" ? m : m.rel * Math.max(Math.abs(a), Math.abs(b));
  return Number.isFinite(t) ? Math.max(RECORD_EPS, t) : RECORD_EPS;
}

/**
 * This function compares the candidate value `a` with the baseline value `b` of one measure on one input or board.
 * A change of at most `minEffectOf(spec, a, b)` is a tie. Two equal values are a tie, also two equal infinite values.
 * The test is symmetric: a swap of `a` and `b` swaps `better` and `worse`.
 * A value `NaN` is an error.
 */
export function compareMeasure(a: number, b: number, spec: CompareSpec): MeasureCompare {
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError("compareMeasure: a value is NaN");
  if (a === b) return "tie";
  if (Math.abs(a - b) <= minEffectOf(spec, a, b)) return "tie";
  const lower = a < b;
  return lower === (spec.direction === "lower") ? "better" : "worse";
}

/**
 * This function applies the wave rule to the compares of one board, for example of `B1` and of the `B3` q95.
 * The board is a win only when no compare is `worse` and one or more compares are `better`. Thus a board of ties is not a win.
 */
export function boardWins(compares: readonly MeasureCompare[]): boolean {
  return !compares.includes("worse") && compares.includes("better");
}
