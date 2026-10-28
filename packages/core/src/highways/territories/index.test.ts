import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { cellSteps, nearestCentre, pointGroups, TERRITORY_DEFAULTS, territoryPlan } from "./index.ts";

describe("the highway strategy territories (HWY-033)", () => {
  it("puts near points into one group, and far points into other groups", () => {
    const centres = pointGroups(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 100, y: 0 },
        { x: 102, y: 0 },
      ],
      10,
    );
    expect(centres).toEqual([
      { x: 1, y: 0 },
      { x: 101, y: 0 },
    ]);
    expect(nearestCentre(centres, { x: 60, y: 0 })).toBe(1);
  });

  it("gives each crossing of a line from cell to cell, with its share of the length", () => {
    const centres = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ];
    const steps = cellSteps(
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      centres,
      10,
    );
    expect(steps.map((s) => [s.from, s.to])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(steps[0]!.at).toBeCloseTo(0.3, 6);
    expect(steps[1]!.at).toBeCloseTo(0.8, 6);
  });

  it("gives highways for the flows between the cells of the clustered board", () => {
    const plan = territoryPlan({ graph: clustered }, TERRITORY_DEFAULTS);
    expect(checkPlan(clustered, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    for (const h of plan.highways) expect(h.members.length).toBeGreaterThanOrEqual(2);
  });

  commonTests("territories", TERRITORY_DEFAULTS, territoryPlan, [flows]);
});
