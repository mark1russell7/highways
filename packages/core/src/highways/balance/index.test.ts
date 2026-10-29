import { describe, expect, it } from "vitest";
import { polylineLength } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { box, commonTests, flows } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { checkPlan, memberAt, type HighwayPlan } from "../model.ts";
import { BALANCE_DEFAULTS, balanceOf, balancePlan } from "./index.ts";

/** Two edges from the left to the right. The edge e1 ends high above the line, so the ride to the far end stretches its route. */
const pair: Graph = {
  nodes: [
    { id: "a", box: box(0, 0) },
    { id: "b", box: box(0, 40) },
    { id: "c", box: box(600, 20) },
    { id: "d", box: box(300, -300) },
  ],
  edges: [
    { id: "e0", source: { node: "a" }, target: { node: "c" } },
    { id: "e1", source: { node: "b" }, target: { node: "d" } },
  ],
};

describe("the highway strategy balance (EDA-017)", () => {
  it("gives a plan that passes the checks", () => {
    expect(checkPlan(pair, balancePlan({ graph: pair }))).toEqual([]);
  });

  it("keeps a plan with no stretch above the target", () => {
    const loose = balancePlan({ graph: flows }, { tau: 2, from: "shared-ways" });
    const plain = balancePlan({ graph: flows }, { tau: 2, iterations: 5 });
    expect(loose).toEqual(plain);
  });

  it("cuts the ride of an edge whose stretch is above the target", () => {
    const stretchOf = (g: Graph, plan: HighwayPlan): number => {
      const alone = new Map(follow(g, { highways: [] }).routes.map((r) => [r.edge, polylineLength(r.points)]));
      return Math.max(...follow(g, plan).routes.map((r) => polylineLength(r.points) / (alone.get(r.edge) || 1)));
    };
    // A plan by hand: both edges ride one spine to the right, so e1 goes far past its target.
    const spine = [
      { x: 60, y: 30 },
      { x: 590, y: 30 },
    ];
    const hand: HighwayPlan = { highways: [{ id: "h0", key: "k", spine, lanes: ["e0", "e1"], members: [memberAt(spine, "e0", 0, 1), memberAt(spine, "e1", 0, 1)] }] };
    const before = stretchOf(pair, hand);
    expect(before).toBeGreaterThan(1.2);
    expect(stretchOf(pair, balanceOf(pair, hand))).toBeLessThan(before);
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies.balance, BALANCE_DEFAULTS)).toEqual([]);
  });

  commonTests("balance", BALANCE_DEFAULTS, balancePlan, [flows, pair]);
});
