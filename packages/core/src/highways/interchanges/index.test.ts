import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { INTERCHANGE_DEFAULTS, interchangeCandidates, interchangePlan } from "./index.ts";

describe("the highway strategy interchanges (HWY-060)", () => {
  it("gives an interchange where two spines cross or come near", () => {
    const cross = [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 50, y: -50 },
        { x: 50, y: 50 },
      ],
      [
        { x: 0, y: 30 },
        { x: 100, y: 30 },
      ],
    ];
    const list = interchangeCandidates(cross, 5, () => true);
    expect(list.map((c) => [c.h, c.g])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(list[0]!.hAt).toBeCloseTo(0.5);
    expect(list[0]!.gAt).toBeCloseTo(0.5);
    expect(interchangeCandidates(cross, 40, () => true).length).toBe(3);
    expect(interchangeCandidates(cross, 40, () => false).length).toBe(2);
  });

  it("gives correct plans with one, two and three highways for each edge", () => {
    for (const perEdge of [1, 2, 3]) {
      const plan = interchangePlan({ graph: clustered }, { ...INTERCHANGE_DEFAULTS, perEdge });
      expect(checkPlan(clustered, plan)).toEqual([]);
      expect(plan.highways.length).toBeGreaterThan(0);
    }
  }, 20_000);

  commonTests("interchanges", INTERCHANGE_DEFAULTS, interchangePlan, [flows]);
});
