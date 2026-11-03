import { describe, expect, it } from "vitest";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { basePlan } from "../base.ts";
import { clustered, commonTests, flows, hub, rows } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { addPairs, disagreement, GLOBAL_ORDER_DEFAULTS, globalOrderPlan, hilbertRank, keyOrder, pseudoAngle, sift, type PairWeights } from "./index.ts";

describe("the highway strategy global-order (WILD-039)", () => {
  it("gives the Hilbert ranks of the four cells of the first level in the order of the curve", () => {
    const half = 32768;
    const ranks = [hilbertRank(0, 0), hilbertRank(0, half), hilbertRank(half, half), hilbertRank(half, 0)];
    expect(ranks[0]).toBe(0);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]!).toBeGreaterThan(ranks[i - 1]!);
    expect(hilbertRank(-5, -5)).toBe(0);
  });

  it("gives a pseudo-angle with the order of the angle", () => {
    const dirs: [number, number][] = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ];
    const keys = dirs.map(([x, y]) => pseudoAngle(x, y));
    for (let i = 1; i < keys.length; i++) expect(keys[i]!).toBeGreaterThan(keys[i - 1]!);
    expect(pseudoAngle(0, 0)).toBe(0);
  });

  it("counts the pairs that an order puts the other way, and sifting does not raise the count", () => {
    const w: PairWeights = new Map();
    addPairs(w, ["c", "a", "b"]);
    addPairs(w, ["c", "a", "b"]);
    addPairs(w, ["a", "b", "c"]);
    expect(disagreement(w, ["a", "b", "c"])).toBe(4);
    expect(disagreement(w, ["c", "a", "b"])).toBe(2);
    const sifted = sift(w, ["a", "b", "c"], 2);
    expect(disagreement(w, sifted)).toBeLessThanOrEqual(2);
    expect(sift(w, ["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
  });

  it("gives each edge of the graph one place in the key order, the same each time", () => {
    for (const key of ["hilbert", "angle"] as const) {
      const order = keyOrder(clustered, key);
      expect([...order].sort()).toEqual(clustered.edges.map((e) => e.id).sort());
      expect(keyOrder(clustered, key)).toEqual(order);
    }
  });

  it("keeps the highways and the members of its plan from, so the routes do not change", () => {
    for (const graph of [flows, rows, hub, clustered]) {
      const base = basePlan({ graph }, "shared-ways");
      const plan = globalOrderPlan({ graph }, GLOBAL_ORDER_DEFAULTS);
      expect(plan.highways.map((h) => h.members)).toEqual(base.highways.map((h) => h.members));
      expect(plan.highways.map((h) => [...h.lanes].sort())).toEqual(base.highways.map((h) => [...h.lanes].sort()));
      if (plan.highways.length > 0) expect(plan.laneRule).toEqual({ order: "plan" });
      expect(follow(graph, plan).routes).toEqual(follow(graph, base).routes);
    }
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies["global-order"], GLOBAL_ORDER_DEFAULTS)).toEqual([]);
  });

  commonTests("global-order", GLOBAL_ORDER_DEFAULTS, globalOrderPlan, [flows, rows]);
});
