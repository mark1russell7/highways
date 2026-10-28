import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { SCALE_SPACE_DEFAULTS, scaleClusters, scaleSpaceGroups, scaleSpacePlan } from "./index.ts";

describe("the highway strategy scale-space (HWY-053)", () => {
  it("gives nested clusters with their birth and their death", () => {
    const pairs = [
      { i: 0, j: 1, d: 1 },
      { i: 2, j: 3, d: 1 },
      { i: 1, j: 2, d: 5 },
    ];
    const levels = scaleClusters(5, pairs, [0.5, 1, 2, 4, 8]);
    expect(levels[0]).toEqual([]);
    expect(levels[1]).toEqual([
      { members: [0, 1], birth: 1, death: 4 },
      { members: [2, 3], birth: 1, death: 4 },
    ]);
    expect(levels[4]).toEqual([{ members: [0, 1, 2, 3], birth: 4, death: 5 }]);
  });

  it("keeps only the clusters that persist", () => {
    const all = scaleSpaceGroups({ graph: clustered }, { ...SCALE_SPACE_DEFAULTS, p0: 0 });
    const kept = scaleSpaceGroups({ graph: clustered }, SCALE_SPACE_DEFAULTS);
    expect(all.size).toBeGreaterThan(0);
    expect(kept.size).toBeLessThanOrEqual(all.size);
    for (const edge of kept.keys()) expect(all.has(edge)).toBe(true);
    expect(scaleSpaceGroups({ graph: clustered }, { ...SCALE_SPACE_DEFAULTS, p0: 100 }).size).toBe(0);
  });

  it("gives a correct plan at each scale", () => {
    for (const level of [0, 4, 7]) expect(checkPlan(clustered, scaleSpacePlan({ graph: clustered }, { ...SCALE_SPACE_DEFAULTS, level }))).toEqual([]);
  });

  commonTests("scale-space", SCALE_SPACE_DEFAULTS, scaleSpacePlan, [flows]);
});
