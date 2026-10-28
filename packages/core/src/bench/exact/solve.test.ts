import highsModule from "highs";
import { describe, expect, it } from "vitest";
import type { Box } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { bootstrapMedian, gapCap, gapClosed } from "../screen/gap.ts";
import { planMeasures, solveExact, type HighsLike } from "./solve.ts";

// The types of `highs` describe a CommonJS module, but Node loads its ES module. Its loader is the default export of either form.
const loadHighs = (highsModule.default ?? highsModule) as unknown as () => Promise<HighsLike>;

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });

// Three edges that go around one tall wall. The least ink shares the way over the wall.
const wall: Graph = {
  nodes: [
    { id: "wall", box: box(280, 0, 40, 400) },
    ...[0, 1, 2].flatMap((i) => [
      { id: `s${i}`, box: box(0, 100 + 30 * i) },
      { id: `t${i}`, box: box(600, 100 + 30 * i) },
    ]),
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `s${i}` }, target: { node: `t${i}` } })),
};

describe("the solve of the exact model (MEAS2)", () => {
  it("proves the optimum, gives a gap of 0, and a plan that saves ink", async () => {
    const highs = await loadHighs();
    const s = solveExact(highs, wall, { stretch: 1.5, rule: "all", seconds: 30 });
    expect(s.status).toBe("optimal");
    expect(s.proven).toBe(true);
    expect(s.mipGap).toBeLessThanOrEqual(1e-9);
    expect(s.objective).not.toBeNull();
    expect(s.plan.highways.length).toBeGreaterThan(0);
    expect(s.modelB1).toBeGreaterThan(0.3);
    const m = planMeasures(wall, s.plan);
    expect(m.b1).toBeGreaterThan(0.3);
    expect(m.b3max).toBeGreaterThanOrEqual(1);
  });
});

describe("the gap closed (MEAS2)", () => {
  it("takes the smallest cap at or above the stretch, and gives no value above the largest cap", () => {
    expect(gapCap(1)).toBe(1.1);
    expect(gapCap(1.1)).toBe(1.1);
    expect(gapCap(1.2)).toBe(1.25);
    expect(gapCap(1.5)).toBe(1.5);
    expect(gapCap(1.51)).toBeUndefined();
  });

  it("gives the share of the gap from the baseline to the optimum, and no value without a gap", () => {
    expect(gapClosed(0.1, 0, 0.2)).toBeCloseTo(0.5);
    expect(gapClosed(0, 0.1, 0.2)).toBeCloseTo(-1);
    expect(gapClosed(0.3, 0.2, 0.2)).toBeUndefined();
  });

  it("gives a bootstrap interval that holds the median, and the same interval from the same seed", () => {
    const values = Array.from({ length: 40 }, (_, i) => (i % 7) / 10);
    const a = bootstrapMedian(values, { runs: 2000 });
    expect(a.lo).toBeLessThanOrEqual(a.median);
    expect(a.hi).toBeGreaterThanOrEqual(a.median);
    expect(bootstrapMedian(values, { runs: 2000 })).toEqual(a);
    expect(Number.isNaN(bootstrapMedian([]).median)).toBe(true);
  });
});
