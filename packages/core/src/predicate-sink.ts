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

/**
 * The rule of one call site whose answer is not the default of its form (PREDICATE-RULES). The dump line of the site gets the key of its rule as `rule`.
 * The default of a crossing test is an open test with exact signs: a touch or a common line is not a crossing.
 * The default of a side test with a sign is the sign of the orientation, with 0 for a point on the line.
 */
export interface CallSiteRule {
  /** The answer of a side test with a sign when the orientation is exactly 0. */
  readonly zero?: -1 | 0 | 1;
  /** With `true`, a crossing test is closed: two segments that touch at an end or at an inner point cross. */
  readonly touch?: boolean;
  /** The tolerance on the shares `t` and `u` of a crossing test: a share from `-shareTolerance` to `1 + shareTolerance` is on the segment. */
  readonly shareTolerance?: number;
  /** A crossing test gives no crossing when the absolute cross product of the two directions is less than this value. */
  readonly parallelTolerance?: number;
}

/** The type of `CALL_SITE_RULES`: one exact rule for each key. The tests check that each rule is a `CallSiteRule`. */
export type CallSiteRules = {
  /** The side of the centre of a box against the chord of a route. A centre on the chord gives -1, so the point moves to the left of the chord. */
  readonly "physics.outOf": { readonly zero: -1 };
  /** The crossing of two segments of the mesh. The test is closed, with a tolerance on the shares, and a nearly parallel pair does not cross. */
  readonly "mesh.crossing": { readonly touch: true; readonly shareTolerance: 1e-9; readonly parallelTolerance: 1e-12 };
};

/**
 * The rules of the call sites whose answers are not the default of their form. The key is the `fn` of the site in the dump.
 * The code of each site reads its values from here, so the rules and the code agree.
 */
export const CALL_SITE_RULES: CallSiteRules = Object.freeze({
  "physics.outOf": Object.freeze({ zero: -1 }),
  "mesh.crossing": Object.freeze({ touch: true, shareTolerance: 1e-9, parallelTolerance: 1e-12 }),
} as const);

/** The key of a rule of `CALL_SITE_RULES`. */
export type CallSiteRuleKey = keyof CallSiteRules;

/** This function gives the key of the rule of the call site `fn`, or `undefined` when the site has the default of its form. */
export function callSiteRuleOf(fn: string): CallSiteRuleKey | undefined {
  return Object.hasOwn(CALL_SITE_RULES, fn) ? (fn as CallSiteRuleKey) : undefined;
}
