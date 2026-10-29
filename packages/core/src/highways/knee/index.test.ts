import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { checkOptions } from "../../strategies/options.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { box, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { KNEE_DEFAULTS, kneeOf, kneePlan } from "./index.ts";

/** One node on the left with edges to four nodes on the right. */
const fan: Graph = {
  nodes: [{ id: "s", box: box(0, 150) }, ...[0, 1, 2, 3].map((i) => ({ id: `t${i}`, box: box(500, 100 * i) }))],
  edges: [0, 1, 2, 3].map((i) => ({ id: `e${i}`, source: { node: "s" }, target: { node: `t${i}` } })),
};

describe("the highway strategy knee (NAT-018)", () => {
  it("picks the knee of a front by the chord, and the least sum by the weights", () => {
    const front = [
      { ink: 0, paths: 10 },
      { ink: 1, paths: 3 },
      { ink: 5, paths: 2 },
      { ink: 10, paths: 0 },
      { ink: 6, paths: 6 },
    ];
    expect(kneeOf(front, "chord", 0.5)).toBe(1);
    expect(kneeOf(front, "weights", 1)).toBe(0);
    expect(kneeOf(front, "weights", 0)).toBe(3);
  });

  it("gives highways for the edges of one source with each rule", () => {
    for (const rule of ["chord", "weights"] as const) {
      const plan = kneePlan({ graph: fan }, { ...KNEE_DEFAULTS, rule });
      expect(checkPlan(fan, plan)).toEqual([]);
      expect(plan.highways.length).toBeGreaterThan(0);
    }
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies.knee, KNEE_DEFAULTS)).toEqual([]);
  });

  commonTests("knee", KNEE_DEFAULTS, kneePlan, [flows, fan]);
});
