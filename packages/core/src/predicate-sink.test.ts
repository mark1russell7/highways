import { describe, expect, it } from "vitest";
import { segmentsCross } from "./geom.ts";
import { crossing } from "./highways/mesh/index.ts";
import { CALL_SITE_RULES, callSiteRuleOf, type CallSiteRule } from "./predicate-sink.ts";

// Made-up points only.
const P = (x: number, y: number): { x: number; y: number } => ({ x, y });

describe("call site rules", () => {
  it("gives the two rules with their values", () => {
    // The typecheck of the tests fails when a rule is not a `CallSiteRule`.
    const rules: Readonly<Record<string, CallSiteRule>> = CALL_SITE_RULES;
    expect(Object.isFrozen(rules)).toBe(true);
    expect(rules).toEqual({
      "physics.outOf": { zero: -1 },
      "mesh.crossing": { touch: true, shareTolerance: 1e-9, parallelTolerance: 1e-12 },
    });
  });

  it("gives the key of a site with a rule, and undefined for the other sites", () => {
    expect(callSiteRuleOf("physics.outOf")).toBe("physics.outOf");
    expect(callSiteRuleOf("mesh.crossing")).toBe("mesh.crossing");
    expect(callSiteRuleOf("geom.segmentsCross")).toBeUndefined();
    // A name of the prototype of an object is not a rule.
    expect(callSiteRuleOf("toString")).toBeUndefined();
  });

  it("agrees with mesh.crossing on a touch: a touch crosses, and the default does not", () => {
    const rule = CALL_SITE_RULES["mesh.crossing"];
    expect(rule.touch).toBe(true);
    // A touch at a common end.
    expect(crossing(P(0, 0), P(2, 0), P(2, 0), P(2, 3))).toEqual({ t: 1, u: 0 });
    // A touch at an inner point of the segment a b.
    expect(crossing(P(0, 0), P(2, 0), P(1, 0), P(1, 3))).toEqual({ t: 0.5, u: 0 });
    expect(segmentsCross(P(0, 0), P(2, 0), P(1, 0), P(1, 3))).toBe(false);
  });

  it("agrees with mesh.crossing on the share tolerance", () => {
    const eps = CALL_SITE_RULES["mesh.crossing"].shareTolerance;
    // The segment c d stops a half tolerance before the line of a b: it crosses.
    expect(crossing(P(0, 0), P(2, 0), P(1, eps / 2), P(1, 1))).toBeDefined();
    // The segment c d stops 2 tolerances before the line of a b: it does not cross.
    expect(crossing(P(0, 0), P(2, 0), P(1, eps * 2), P(1, 1))).toBeUndefined();
  });

  it("agrees with mesh.crossing on the parallel tolerance", () => {
    const tol = CALL_SITE_RULES["mesh.crossing"].parallelTolerance;
    // The cross product of the directions is 2 * tol: the pair crosses at the middle.
    expect(crossing(P(0, 0), P(1, 0), P(0, -tol), P(1, tol))).toEqual({ t: 0.5, u: 0.5 });
    // The cross product is tol / 5: the pair is parallel and does not cross. The default test finds the crossing.
    expect(crossing(P(0, 0), P(1, 0), P(0, -tol / 10), P(1, tol / 10))).toBeUndefined();
    expect(segmentsCross(P(0, 0), P(1, 0), P(0, -tol / 10), P(1, tol / 10))).toBe(true);
    // An exact parallel pair on one line.
    expect(crossing(P(0, 0), P(2, 0), P(1, 0), P(3, 0))).toBeUndefined();
  });
});
