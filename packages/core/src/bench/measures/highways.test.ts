import { describe, expect, it } from "vitest";
import { CASES } from "../../cases.ts";
import { memberAt, type Highway, type HighwayPlan } from "../../highways/model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { highwayChurn, highwayEdits, highwayFlips, highwayIdKeep } from "./highways.ts";

const spine = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];
const highway = (id: string, edges: readonly string[]): Highway => ({ id, key: id, spine, lanes: [...edges], members: edges.map((e, i) => memberAt(spine, e, 0, 100, i)) });
const all = new Set(["a", "b", "c", "d", "e"]);

describe("highwayChurn", () => {
  it("gives 0 for the same pairs and 1 for no common pair", () => {
    const one: HighwayPlan = { highways: [highway("h0", ["a", "b", "c"])] };
    expect(highwayChurn(one, { highways: [highway("x", ["c", "b", "a"])] }, all)).toBe(0);
    expect(highwayChurn(one, { highways: [highway("x", ["d", "e"])] }, all)).toBe(1);
    expect(highwayChurn({ highways: [] }, { highways: [] }, all)).toBe(0);
  });

  it("gives the share of the pairs that come or go, over the edges of the set", () => {
    // Before: ab, ac, bc. After: ab. One pair of three stays.
    const before: HighwayPlan = { highways: [highway("h0", ["a", "b", "c"])] };
    const after: HighwayPlan = { highways: [highway("h0", ["a", "b"])] };
    expect(highwayChurn(before, after, all)).toBeCloseTo(2 / 3, 12);
    expect(highwayChurn(before, after, new Set(["a", "b"]))).toBe(0);
  });
});

describe("highwayIdKeep", () => {
  it("counts the matched highways that keep their id", () => {
    const before: HighwayPlan = { highways: [highway("h0", ["a", "b", "c"]), highway("h1", ["d", "e"])] };
    const after: HighwayPlan = { highways: [highway("h1", ["a", "b", "c"]), highway("h0", ["d", "e"])] };
    expect(highwayIdKeep(before, before, all)).toEqual({ matched: 2, kept: 2, share: 1 });
    expect(highwayIdKeep(before, after, all)).toEqual({ matched: 2, kept: 0, share: 0 });
    expect(highwayIdKeep(before, { highways: [] }, all).share).toBeNaN();
  });
});

describe("highwayFlips (Z13)", () => {
  it("counts the edges that join or leave the highways, and not a move from one highway to another", () => {
    const before: HighwayPlan = { highways: [highway("h0", ["a", "b"]), highway("h1", ["c", "d"])] };
    // The edge a leaves, the edge e joins, and the edge c moves from h1 to h2.
    const after: HighwayPlan = { highways: [highway("h0", ["b", "e"]), highway("h2", ["c", "d"])] };
    expect(highwayFlips(before, before, all)).toBe(0);
    expect(highwayFlips(before, after, all)).toBe(2);
    expect(highwayFlips(before, after, new Set(["a", "c"]))).toBe(1);
  });
});

describe("highwayEdits", () => {
  const graph = CASES.find((c) => c.name === "case-hub-chain")!.make();

  it("gives the same values for the same seed, and values in their scales", () => {
    const corridors = getStrategy(STRATEGIES, "highway", "corridors");
    const one = highwayEdits(graph, corridors, undefined, 2, 7);
    expect(highwayEdits(graph, corridors, undefined, 2, 7)).toEqual(one);
    expect(one.mean).toBeGreaterThanOrEqual(0);
    expect(one.flicker).toBeGreaterThanOrEqual(0);
    for (const v of [one.moved, one.churn]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("gives the same routes with the gate ids, and each matched highway keeps its id", () => {
    const corridors = highwayEdits(graph, getStrategy(STRATEGIES, "highway", "corridors"), undefined, 3, 1);
    const ids = highwayEdits(graph, getStrategy(STRATEGIES, "highway", "corridors+ids"), undefined, 3, 1);
    expect(ids.mean).toBe(corridors.mean);
    expect(ids.churn).toBe(corridors.churn);
    if (!Number.isNaN(ids.ids)) expect(ids.ids).toBe(1);
  });

  it("gives the flicker Z13 to the gate split-hysteresis, with its memory from run to run", () => {
    const gated = highwayEdits(graph, getStrategy(STRATEGIES, "highway", "corridors+split-hysteresis"), undefined, 3, 1);
    expect(gated.flicker).toBeGreaterThanOrEqual(0);
    expect(highwayEdits(graph, getStrategy(STRATEGIES, "highway", "corridors+split-hysteresis"), undefined, 3, 1)).toEqual(gated);
  });
});
