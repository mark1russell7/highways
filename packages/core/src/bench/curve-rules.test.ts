import { describe, expect, it } from "vitest";
import { packedGridBoard } from "../cases.ts";
import { straightCurve } from "../curves/straight/index.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { asRouter, defineStrategy, getStrategy, type CurveInput } from "../strategies/model.ts";
import { curveRuns } from "./suite.ts";

describe("the curve rules that a strategy declares (D23-PHYSICAL)", () => {
  // A packed grid of made-up boxes: many routes of `corners` leave their box off the normal of the plug.
  const graph = packedGridBoard();
  const result = asRouter(getStrategy(STRATEGIES, "router", "corners")).route(graph);
  const flat = (name: string, declared: boolean) =>
    defineStrategy({
      step: "curve",
      name,
      describe: "The polyline as it is.",
      defaults: {},
      ...(declared ? { curveRules: { normals: true } } : {}),
      run: (input: CurveInput) => straightCurve(input.points),
    });

  it("examines the end tangents of a curve that declares the normals, with no name in the sets", () => {
    const runs = curveRuns(graph, result, [flat("declared", true), flat("silent", false)], { fixture: "packed-grid", seed: 0, smooth: new Set(), normals: new Set() });
    const ends = Object.fromEntries(runs.map((r) => [r.row.strategy, r.row.values["curve-ends"]]));
    expect(ends["declared"]).toBeGreaterThan(0);
    expect(ends["silent"]).toBe(0);
  });

  it("gives each curve of the registry with the normals no break of the end tangents on the grid", () => {
    const curves = (["spline", "elastic"] as const).map((n) => getStrategy(STRATEGIES, "curve", n));
    expect(curves.every((c) => c.curveRules?.normals === true)).toBe(true);
    const runs = curveRuns(graph, result, curves, { fixture: "packed-grid", seed: 0, smooth: new Set(), normals: new Set() });
    expect(runs.map((r) => r.row.values["curve-ends"])).toEqual([0, 0]);
  });
});
