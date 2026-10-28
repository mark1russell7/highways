import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { hubCandidates, P_HUB_DEFAULTS, pHubPlan, pMedian } from "./index.ts";

describe("the highway strategy p-hub (HWY-041)", () => {
  it("chooses the median of each group of points, after the swaps", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 100, y: 0 },
      { x: 101, y: 0 },
    ];
    const candidates = [
      { x: 50, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(pMedian(points, candidates, 2).sort()).toEqual([1, 2]);
    expect(pMedian(points, candidates, 1)).toEqual([0]);
  });

  it("gives candidates of the corners and of the sections, with no copies", () => {
    for (const kind of ["corners", "sections"] as const) {
      const points = hubCandidates({ graph: clustered }, kind);
      expect(points.length).toBeGreaterThan(1);
      expect(new Set(points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size).toBe(points.length);
    }
  });

  it("gives highways between two hubs, with each allocation", () => {
    // The multiple allocation tries each pair of hubs for each edge, so this test runs it without the swaps.
    for (const allocation of ["single", "multiple"] as const) {
      const plan = pHubPlan({ graph: clustered }, { ...P_HUB_DEFAULTS, allocation, swaps: allocation === "multiple" ? 0 : 1 });
      expect(checkPlan(clustered, plan)).toEqual([]);
      expect(plan.highways.length).toBeGreaterThan(0);
    }
  }, 20_000);

  commonTests("p-hub", P_HUB_DEFAULTS, pHubPlan, [flows]);
});
