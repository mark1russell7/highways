import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { FRECHET_DEFAULTS, frechetBundles, frechetPlan, partWithin, samplesOf } from "./index.ts";

/** This function gives a horizontal line at the height `y`, from `x0` to `x1`. */
const row = (y: number, x0 = 0, x1 = 100) => [
  { x: x0, y },
  { x: x1, y },
];

describe("the highway strategy frechet (HWY-027)", () => {
  it("gives samples at equal steps, with the two ends", () => {
    const s = samplesOf(row(0), 30);
    expect(s.length).toBe(5);
    expect(s[0]).toEqual({ x: 0, y: 0 });
    expect(s[4]).toEqual({ x: 100, y: 0 });
  });

  it("finds a part of a longer curve near a short curve, and no part of a far or a short curve", () => {
    const p = samplesOf(row(0, 40, 60), 5);
    expect(partWithin(p, samplesOf(row(2), 5), 3)).toBe(true);
    expect(partWithin(p, samplesOf(row(9), 5), 3)).toBe(false);
    expect(partWithin(p, samplesOf(row(2, 0, 30), 5), 3)).toBe(false);
  });

  it("finds a bundle of two near lines in opposite senses", () => {
    const samples = new Map([
      ["a", samplesOf(row(0), 5)],
      ["b", samplesOf(row(2), 5).reverse()],
    ]);
    const best = frechetBundles(samples, 3, 2, 50, 2).find((b) => b.edge === "a")!;
    expect(best.members).toEqual([{ edge: "b", back: true }]);
    expect(best.length).toBeGreaterThanOrEqual(90);
  });

  it("gives a highway on the parallel edges 8 apart only with eps 2, and a correct plan with stride 1", () => {
    // The median short side of the boxes is 6, so the default eps is 6.
    expect(frechetPlan({ graph: parallel }, FRECHET_DEFAULTS).highways).toEqual([]);
    const plan = frechetPlan({ graph: parallel }, { ...FRECHET_DEFAULTS, eps: 2 });
    expect(checkPlan(parallel, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(checkPlan(clustered, frechetPlan({ graph: clustered }, { ...FRECHET_DEFAULTS, stride: 1 }))).toEqual([]);
  });

  commonTests("frechet", FRECHET_DEFAULTS, frechetPlan, [flows, parallel]);
});
