import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows } from "../fixtures.test-util.ts";
import type { HighwayPlan } from "../model.ts";
import { candidatePlan } from "../select/index.ts";
import { coAssociation, CONSENSUS_DEFAULTS, consensusGroups, consensusLabels, consensusPlan } from "./index.ts";

/** This function gives a plan with one highway for each list of edges. Only the members matter here. */
const planOf = (...lists: string[][]): HighwayPlan => ({
  highways: lists.map((edges, i) => ({
    id: `h${i}`,
    key: `k${i}`,
    spine: [],
    lanes: edges,
    members: edges.map((edge) => ({ edge, on: 0, off: 1, merge: { x: 0, y: 0 }, split: { x: 0, y: 0 }, seq: 0 })),
  })),
});

describe("the highway strategy consensus (HWY-035)", () => {
  it("gives the share of the plans that put each pair into one highway", () => {
    const a = coAssociation(["a", "b", "c"], [planOf(["a", "b"]), planOf(["a", "b", "c"]), planOf(["c", "a"])]);
    expect(a[0 * 3 + 1]).toBeCloseTo(2 / 3, 9);
    expect(a[1 * 3 + 0]).toBeCloseTo(2 / 3, 9);
    expect(a[0 * 3 + 2]).toBeCloseTo(2 / 3, 9);
    expect(a[1 * 3 + 2]).toBeCloseTo(1 / 3, 9);
  });

  it("keeps only the pairs that most plans agree on", () => {
    const plans = [planOf(["a", "b"], ["c", "d"]), planOf(["a", "b", "c", "d"]), planOf(["a", "b"], ["c", "d"])];
    const a = coAssociation(["a", "b", "c", "d", "e"], plans);
    const labels = [...consensusLabels(5, a, 0.5, "average")];
    expect(labels[0]).toBe(labels[1]);
    expect(labels[2]).toBe(labels[3]);
    expect(labels[0]).not.toBe(labels[2]);
    expect(labels[4]).toBe(-1);
    const single = [...consensusLabels(5, a, 0.7, "single")];
    expect(single[0]).toBe(single[2]);
  });

  it("puts into a group only the edges that a finder puts on a highway", () => {
    const groups = consensusGroups({ graph: clustered }, CONSENSUS_DEFAULTS);
    const voted = new Set(CONSENSUS_DEFAULTS.members.flatMap((m) => candidatePlan({ graph: clustered }, m).highways.flatMap((h) => h.members.map((x) => x.edge))));
    expect(groups.size).toBeGreaterThan(0);
    for (const edge of groups.keys()) expect(voted.has(edge)).toBe(true);
  });

  commonTests("consensus", CONSENSUS_DEFAULTS, consensusPlan, [flows]);
});
