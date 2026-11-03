import { describe, expect, it } from "vitest";
import type { Point } from "../../geom.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { basePlan } from "../base.ts";
import { clustered, commonTests, flows, hub } from "../fixtures.test-util.ts";
import { follow, ruleLanes } from "../follow.ts";
import { memberAt, type Highway } from "../model.ts";
import { TWO_WAY_DEFAULTS, twoWayPlan } from "./index.ts";

const spine: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

/** A highway with two edges that go along the spine (`f1`, `f2`) and two edges that go back (`b1`, `b2`). */
const road: Highway = {
  id: "h0",
  key: "p",
  spine,
  lanes: ["f2", "f1", "b1", "b2"],
  members: [memberAt(spine, "f1", 0, 100), memberAt(spine, "b1", 100, 0), memberAt(spine, "f2", 0, 100), memberAt(spine, "b2", 100, 0)],
};

/** The bundle order of the run. */
const bundle = ["f1", "b1", "f2", "b2"];

describe("the highway strategy two-way (NAT-009)", () => {
  it("puts the edges of one direction side by side, and keeps the bundle order in each direction", () => {
    expect(ruleLanes({ order: "two-way", side: "right", weight: 1 }, road, bundle)).toEqual(["b1", "b2", "f1", "f2"]);
    expect(ruleLanes({ order: "two-way", side: "left", weight: 1 }, road, bundle)).toEqual(["f1", "f2", "b1", "b2"]);
  });

  it("gives the two outer lanes to the edges along the spine with the side outer", () => {
    expect(ruleLanes({ order: "two-way", side: "outer", weight: 1 }, road, bundle)).toEqual(["f1", "b1", "b2", "f2"]);
  });

  it("keeps the bundle order with the weight 0, and moves one lane with a small weight", () => {
    expect(ruleLanes({ order: "two-way", side: "right", weight: 0 }, road, bundle)).toEqual(bundle);
    // With the weight 0.5, the class adds 2 to the key of an edge along the spine. The keys are f1 2, b1 1, f2 4 and b2 3.
    expect(ruleLanes({ order: "two-way", side: "right", weight: 0.5 }, road, bundle)).toEqual(["b1", "f1", "b2", "f2"]);
  });

  it("gives the lanes of the plan with the rule plan, and puts the other edges last", () => {
    expect(ruleLanes({ order: "plan" }, { ...road, lanes: ["f2", "f1"] }, ["f1", "b1", "f2"])).toEqual(["f2", "f1", "b1"]);
  });

  it("keeps the highways of its plan from, so the routes do not change", () => {
    for (const graph of [flows, hub, clustered]) {
      const base = basePlan({ graph }, "shared-ways");
      const plan = twoWayPlan({ graph }, TWO_WAY_DEFAULTS);
      expect(plan.highways).toEqual(base.highways);
      expect(plan.laneRule).toEqual({ order: "two-way", side: "right", weight: 1 });
      const before = follow(graph, base);
      const after = follow(graph, plan);
      expect(after.routes).toEqual(before.routes);
      expect((after.runs ?? []).map((r) => [...r.edges].sort())).toEqual((before.runs ?? []).map((r) => [...r.edges].sort()));
    }
  });

  it("gives the runs of today for a plan with no lane rule", () => {
    const base = basePlan({ graph: clustered }, "shared-ways");
    expect(base.laneRule).toBeUndefined();
    expect(follow(clustered, base)).toEqual(follow(clustered, { highways: base.highways }));
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies["two-way"], TWO_WAY_DEFAULTS)).toEqual([]);
  });

  commonTests("two-way", TWO_WAY_DEFAULTS, twoWayPlan, [flows]);
});
