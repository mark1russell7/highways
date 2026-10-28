import highsModule from "highs";
import { describe, expect, it } from "vitest";
import type { Box } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { asRouter, getStrategy } from "../../strategies/model.ts";
import { bootstrapMedian, gapCap, gapClosed, gapValues, mixesCollections, optimumKey, type ExactOptimum } from "../screen/gap.ts";
import { exactStretch } from "./index.ts";
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

describe("the stretch of the exact model and the rule of a run (MEAS2)", () => {
  const corners = asRouter(getStrategy(STRATEGIES, "router", "corners")).route(wall);

  it("gives a stretch near 1 for the routes of corners, and a larger stretch for a detour", () => {
    const s = exactStretch(wall, corners.routes);
    expect(s).toBeGreaterThanOrEqual(1);
    expect(s).toBeLessThan(1.1);
    const detour = corners.routes.map((r) => ({ ...r, points: [r.points[0]!, { x: 300, y: -400 }, r.points[r.points.length - 1]!] }));
    expect(exactStretch(wall, detour)).toBeGreaterThan(1.5);
  });

  it("tells a run that mixes collections", () => {
    const keyed: Graph = { ...wall, edges: wall.edges.map((e, i) => ({ ...e, data: { collection: i < 2 ? "a" : "b" } })) };
    const run = (edges: string[]) => ({ ...corners, runs: [{ id: "r", key: "k", points: [], edges }] });
    expect(mixesCollections(keyed, run(["e0", "e1"]))).toBe(false);
    expect(mixesCollections(keyed, run(["e1", "e2"]))).toBe(true);
    expect(mixesCollections(keyed, corners)).toBe(false);
  });

  it("gives the gap closed of the rule of the run, at the cap of the stretch of the model", () => {
    const input = { id: "exact-v1/uniform/s0", hash: "h" };
    const opt = (rule: "collection" | "all", b1: number, hash = "h"): ExactOptimum =>
      ({ input: input.id, hash, class: "uniform", nodes: 7, edges: 3, rule, cap: 1.1, status: "optimal", proven: true, objective: 1, bound: 1, mipGap: 0, seconds: 1, binaries: 1, b1, modelB1: b1, b3max: 1, highways: 1 }) as ExactOptimum;
    const optima = new Map([
      [optimumKey(input.id, "collection", 1.1), opt("collection", 0.5)],
      [optimumKey(input.id, "all", 1.1), opt("all", 0.6, "other")],
    ]);
    const v = gapValues(input, wall, corners, corners.routes, { collection: 0, all: 0 }, optima);
    expect(v["gap.cap"]).toBe(1.1);
    expect(v["gap.mixed"]).toBe(0);
    expect(v["gap"]).toBeCloseTo(v["gap.collection"]!);
    // The hash of the optimum of the rule `all` is not the hash of the input, so that rule has no value.
    expect(v["gap.all"]).toBeUndefined();
  });
});
