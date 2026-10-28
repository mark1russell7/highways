// The compare of one measure (WIN-RES). `compareMeasure` and `minEffectOf` come from `@mark1russell7/layout-contract` (PORTFOLIO-FIT).
// `docs/PROMOTION.md` gives the rule. The test `compare.test.ts` checks that the functions agree with the note.
import type { MeasureSpec, Verdict } from "@mark1russell7/layout-contract";

export { compareMeasure, minEffectOf } from "@mark1russell7/layout-contract";

/**
 * The smallest change of a measure that counts as better or worse (WIN-RES).
 * A number is an absolute change. `{ rel }` is a share of the larger of the two absolute values.
 * The threshold is not less than `RECORD_EPS` at any time.
 */
export type MinEffect = NonNullable<MeasureSpec["minEffect"]>;

/** The result of a compare of a candidate with a baseline on one measure. A tie is not a win. It is the `Verdict` of the contract. */
export type MeasureCompare = Verdict;

/** The part of a measure that a compare reads: the better side and the minimum effect. */
export type CompareSpec = Pick<MeasureSpec, "direction" | "minEffect">;

/**
 * This function applies the wave rule to the compares of one board, for example of `B1` and of the `B3` q95.
 * The board is a win only when no compare is `worse` and one or more compares are `better`. Thus a board of ties is not a win.
 */
export function boardWins(compares: readonly MeasureCompare[]): boolean {
  return !compares.includes("worse") && compares.includes("better");
}
