import { describe, expect, it } from "vitest";
import { commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { densityRidges, lineDensity, RIDGE_DEFAULTS, ridgeLines, ridgePlan } from "./index.ts";

describe("the highway strategy ridges (HWY-032)", () => {
  it("finds one horizontal ridge in the density of parallel lines", () => {
    const lines = [95, 100, 105].map((y) => [
      { x: 0, y },
      { x: 400, y },
    ]);
    const img = lineDensity(lines, { x: -50, y: 0, w: 500, h: 200 }, 8, 16);
    const ridges = densityRidges(img, 0.15, 60);
    expect(ridges.length).toBeGreaterThan(0);
    const r = ridges[0]!;
    expect(Math.abs(r.a.y - r.b.y)).toBeLessThan(10);
    expect(Math.abs((r.a.y + r.b.y) / 2 - 100)).toBeLessThan(10);
    expect(Math.abs(r.b.x - r.a.x)).toBeGreaterThan(200);
  });

  it("snaps the near parallel edges to the ridge, and gives a highway", () => {
    const lines = ridgeLines({ graph: parallel }, RIDGE_DEFAULTS);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.members.map((m) => m.edge).sort()).toEqual(["e0", "e1", "e2"]);
    const plan = ridgePlan({ graph: parallel }, RIDGE_DEFAULTS);
    expect(checkPlan(parallel, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
  });

  commonTests("ridges", RIDGE_DEFAULTS, ridgePlan, [flows, parallel]);
});
