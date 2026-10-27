import { describe, expect, it } from "vitest";
import { CASES } from "../../../cases.ts";
import { STRATEGIES } from "../../../strategies/builtins.ts";
import { getStrategy } from "../../../strategies/model.ts";
import { CORRIDOR_DEFAULTS, corridorPlan } from "../../corridors/index.ts";
import { checkPlan, type HighwayPlan } from "../../model.ts";
import { AMBIGUITY_GUARD_DEFAULTS, ambiguityPlan, nodeAmbiguity } from "./index.ts";

const graph = CASES.find((c) => c.name === "case-hub-chain")!.make();
const plan = corridorPlan({ graph }, CORRIDOR_DEFAULTS);
const count = (p: HighwayPlan): number => p.highways.reduce((n, h) => n + h.members.length, 0);

describe("nodeAmbiguity", () => {
  const adj = new Map<string, Set<string>>([
    ["s", new Set(["a", "b", "c"])],
    ["a", new Set(["s"])],
    ["b", new Set(["s"])],
    ["c", new Set(["s"])],
  ]);

  it("gives the share of the pairs of nodes without an edge", () => {
    // A fan of three edges: 3 of the 6 pairs have an edge.
    expect(nodeAmbiguity(new Set(["s", "a", "b", "c"]), adj)).toBeCloseTo(0.5, 12);
    expect(nodeAmbiguity(new Set(["s", "a"]), adj)).toBe(0);
    expect(nodeAmbiguity(new Set(["a", "b"]), adj)).toBe(1);
    expect(nodeAmbiguity(new Set(["a"]), adj)).toBe(0);
  });
});

describe("the gate ambiguity (HWY-049)", () => {
  it("gives a valid plan with fewer members or the same members", () => {
    const out = ambiguityPlan({ graph }, plan, AMBIGUITY_GUARD_DEFAULTS);
    expect(checkPlan(graph, out)).toEqual([]);
    expect(count(out)).toBeLessThanOrEqual(count(plan));
  });

  it("keeps each member when each rise is allowed and no common node is necessary", () => {
    expect(count(ambiguityPlan({ graph }, plan, { maxAmbiguity: 1, link: "any" }))).toBe(count(plan));
  });

  it("keeps fewer members or the same members with a lower limit", () => {
    const low = ambiguityPlan({ graph }, plan, { maxAmbiguity: 0.1, link: "node" });
    const high = ambiguityPlan({ graph }, plan, { maxAmbiguity: 0.9, link: "node" });
    expect(count(low)).toBeLessThanOrEqual(count(high));
  });

  it("is in the registry as `corridors+ambiguity`", () => {
    const s = getStrategy(STRATEGIES, "highway", "corridors+ambiguity");
    expect(s.defaults).toEqual({ ...CORRIDOR_DEFAULTS, ...AMBIGUITY_GUARD_DEFAULTS });
    expect(s.run({ graph })).toEqual(ambiguityPlan({ graph }, plan, AMBIGUITY_GUARD_DEFAULTS));
  });
});
