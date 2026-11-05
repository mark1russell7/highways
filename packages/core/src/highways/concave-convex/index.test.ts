import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { box, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { CONCAVE_DEFAULTS, concaveCost, concaveMarginal, concavePlan } from "./index.ts";

/** Three edges from the left to the right, and a tall wall between them. Each way goes past one end of the wall. */
const blocked: Graph = {
  nodes: [
    ...[0, 1, 2].flatMap((i) => [
      { id: `l${i}`, box: box(0, 30 * i) },
      { id: `r${i}`, box: box(600, 30 * i) },
    ]),
    { id: "wall", box: box(280, -80, 40, 240) },
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `l${i}` }, target: { node: `r${i}` } })),
};

const COST = { alpha: 0.5, beta: 0.5, power: 2, mu: 4 };

describe("the highway strategy concave-convex (EDA-032)", () => {
  it("gives a marginal cost that falls below the capacity and grows above it", () => {
    expect(concaveCost(0, 0, 4, COST)).toBe(0);
    expect(concaveCost(4, 4, 4, COST)).toBe(2);
    const m = [0, 1, 2, 3, 4, 5, 6].map((f) => concaveMarginal(f, f, 4, COST));
    for (let f = 1; f < 4; f++) expect(m[f]!).toBeLessThan(m[f - 1]!);
    expect(m[4]!).toBeGreaterThan(m[0]!);
    expect(m[5]!).toBeGreaterThan(m[4]!);
    // With alpha 1 and below the capacity, the cost is the number of edges.
    expect(concaveCost(3, 3, 4, { ...COST, alpha: 1 })).toBe(3);
  });

  it("bundles the three edges past the wall", () => {
    const plan = concavePlan({ graph: blocked }, CONCAVE_DEFAULTS);
    expect(checkPlan(blocked, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(Math.max(...plan.highways.map((h) => h.members.length))).toBeGreaterThanOrEqual(2);
    expect(checkProperties(blocked, follow(blocked, plan), 1_000_000)).toEqual([]);
  });

  it("makes no highway for edges with a straight line of sight", () => {
    expect(concavePlan({ graph: parallel }, CONCAVE_DEFAULTS).highways).toEqual([]);
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies["concave-convex"], CONCAVE_DEFAULTS)).toEqual([]);
  });

  commonTests("concave-convex", CONCAVE_DEFAULTS, concavePlan, [flows, blocked]);
});
