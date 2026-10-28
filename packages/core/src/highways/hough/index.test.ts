import { describe, expect, it } from "vitest";
import { commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { HOUGH_DEFAULTS, houghLines, houghPeaks, houghPlan } from "./index.ts";

describe("the highway strategy hough (HWY-024)", () => {
  it("gives the strongest peak at the angle and the offset of the lines", () => {
    const lines = [90, 100, 110].map((y) => ({ theta: 0, mid: { x: 300, y }, len: 400 }));
    const top = houghPeaks(lines, HOUGH_DEFAULTS)[0]!;
    expect(top.theta).toBeCloseTo(0, 9);
    expect(Math.abs(top.rho - 100)).toBeLessThanOrEqual(HOUGH_DEFAULTS.dRho / 4);
    expect(houghPeaks(lines, { ...HOUGH_DEFAULTS, orthogonal: true })[0]!.theta).toBeCloseTo(0, 9);
  });

  it("gives one corridor for the near parallel edges, and a highway on it", () => {
    const lines = houghLines({ graph: parallel }, HOUGH_DEFAULTS);
    expect(lines.length).toBe(1);
    expect(lines[0]!.members.map((m) => m.edge).sort()).toEqual(["e0", "e1", "e2"]);
    const plan = houghPlan({ graph: parallel }, HOUGH_DEFAULTS);
    expect(checkPlan(parallel, plan)).toEqual([]);
    expect(plan.highways.length).toBe(1);
    expect(houghLines({ graph: parallel }, { ...HOUGH_DEFAULTS, minVotes: 4 })).toEqual([]);
  });

  commonTests("hough", HOUGH_DEFAULTS, houghPlan, [flows, parallel]);
});
