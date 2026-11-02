import type { Point } from "./geom.ts";

/**
 * The recorder of the inputs of the geometric predicates (PREDICATE-CASES). The script `scripts/predicate-dump.ts` sets it.
 * Each predicate with a hook gives its inputs and its float answer to the sink, after the predicate has its answer.
 * The sink only observes. It does not change an answer. The default is no sink, and then each hook is one test of `null`.
 */
export interface PredicateSink {
  /** This function gets one test of the crossing of the segments `ab` and `cd`, and the answer of the predicate `fn`. */
  cross(fn: string, a: Point, b: Point, c: Point, d: Point, answer: boolean): void;
  /**
   * This function gets one test of the segment `ab` against the box from (`x0`, `y0`) to (`x1`, `y1`), and the answer of `fn`.
   * The box `box` is the box of the call, when the call gives a box and not 4 sides.
   */
  box(fn: string, a: Point, b: Point, x0: number, y0: number, x1: number, y1: number, eps: number, answer: boolean, box?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }): void;
  /** This function gets one test of the nearest centre of `p`, and the index `answer` that the predicate `fn` gives. */
  nearest(fn: string, p: Point, centres: readonly Point[], answer: number): void;
  /**
   * This function gets one side test of the point `p` against the line through `a` and `b`.
   * The answer is the value that the code of `fn` uses: a sign, or a boolean.
   */
  side(fn: string, p: Point, a: Point, b: Point, answer: boolean | number): void;
}

/** The sink of the predicates. The value `null` turns the hooks off. Only `setPredicateSink` changes it. */
export let predicateSink: PredicateSink | null = null;

/** This function sets the sink of the predicates. The value `null` turns the hooks off. */
export function setPredicateSink(sink: PredicateSink | null): void {
  predicateSink = sink;
}
