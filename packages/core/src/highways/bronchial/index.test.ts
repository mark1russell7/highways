import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { checkOptions } from "../../strategies/options.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { box, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { BRONCHIAL_DEFAULTS, bronchialPlan, diamondAngle, splitTargets } from "./index.ts";

/** One node on the left with edges to four nodes on the right. */
const fan: Graph = {
  nodes: [{ id: "s", box: box(0, 150) }, ...[0, 1, 2, 3].map((i) => ({ id: `t${i}`, box: box(500, 100 * i) }))],
  edges: [0, 1, 2, 3].map((i) => ({ id: `e${i}`, source: { node: "s" }, target: { node: `t${i}` } })),
};

describe("the highway strategy bronchial (NAT-019)", () => {
  it("gives the diamond angle, which grows with the angle", () => {
    expect([diamondAngle(1, 0), diamondAngle(0, 1), diamondAngle(-1, 0), diamondAngle(0, -1), diamondAngle(1, -1)]).toEqual([0, 1, 2, 3, 3.5]);
  });

  it("splits the targets of a tip into two sectors", () => {
    const tip = { x: 0, y: 0 };
    const targets = [
      { x: 10, y: -3 },
      { x: 10, y: -1 },
      { x: 10, y: 1 },
      { x: 10, y: 9 },
    ];
    const ids = [0, 1, 2, 3];
    expect(splitTargets(tip, targets, ids, "count")).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(splitTargets(tip, targets, ids, "gap")).toEqual([[0, 1, 2], [3]]);
  });

  it("gives highways for the edges of one source with each split", () => {
    for (const split of ["count", "weight", "gap"] as const) {
      const plan = bronchialPlan({ graph: fan }, { ...BRONCHIAL_DEFAULTS, split });
      expect(checkPlan(fan, plan)).toEqual([]);
      expect(plan.highways.length).toBeGreaterThan(0);
    }
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies.bronchial, BRONCHIAL_DEFAULTS)).toEqual([]);
  });

  commonTests("bronchial", BRONCHIAL_DEFAULTS, bronchialPlan, [flows, fan]);
});
