import { describe, expect, it } from "vitest";
import { CURVE_TYPES } from "../curves/index.ts";
import { CASES } from "../cases.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import { ROUTERS } from "../routers/index.ts";
import { sharedRouter } from "../routers/shared.ts";
import type { LaneCurve } from "../curves/highway/index.ts";
import type { Point } from "../geom.ts";
import { runKey, type SegmentGraph } from "../segments.ts";
import { benchCurves, benchHighways, formatCurves, formatHighways, measureHighways, SPACING_LIMIT } from "./curves.ts";

describe("benchCurves", () => {
  it("gives one row for each type, and a clamped curve goes through no box that its route avoids", () => {
    const graph = makeFixture(FIXTURES.find((f) => f.name === "tiny-uniform")!);
    for (const router of ROUTERS.filter((r) => ["corners", "shared", "sections"].includes(r.name))) {
      const rows = benchCurves(router, "tiny-uniform", graph);
      expect(rows.map((r) => r.type)).toEqual(CURVE_TYPES);
      for (const r of rows) expect(r.clamped).toBeLessThanOrEqual(r.through);
      expect(rows[0]!.length).toBeCloseTo(1, 9);
      expect(formatCurves(rows).split("\n")).toHaveLength(2 + CURVE_TYPES.length);
    }
  });
});

describe("benchHighways", () => {
  it("measures the lanes of each bundle when each lane bends alone and when the bundle bends as one", () => {
    const graph = CASES.find((c) => c.name === "case-dense-groups")!.make();
    const rows = benchHighways(ROUTERS.find((r) => r.name === "shared")!, "case-dense-groups", graph);
    expect(rows.map((r) => r.curve)).toEqual(["rounded", "highway"]);
    const [alone, together] = rows as [(typeof rows)[0], (typeof rows)[0]];
    expect(together.bundles).toBeGreaterThan(0);
    expect(together.lanes).toBe(alone.lanes);
    expect(alone.worstSpacing).toBeGreaterThan(SPACING_LIMIT);
    expect(together.worstSpacing).toBeLessThanOrEqual(SPACING_LIMIT);
    expect(together.breaks).toBe(0);
    expect(together.through).toBe(0);
    expect(formatHighways(rows).split("\n")).toHaveLength(4);
  });

  it("counts fewer crossings in a bundle when two edges keep one lane order through it (HWC-B)", () => {
    const graph = CASES.find((c) => c.name === "case-many-groups")!.make();
    const [, run] = benchHighways(sharedRouter({ name: "shared-all", laneOrder: "run" }), "case-many-groups", graph);
    const [, bundle] = benchHighways(sharedRouter({ name: "shared-all" }), "case-many-groups", graph);
    expect(run!.crossings).toBeGreaterThan(0);
    // LANE-ROOM: each way has its own width, so two lanes can meet where the shifts of both ends of a short way meet. Before it, this value was 0.
    // This test is a ratchet. The item LANE-WIDTH-CHAIN takes the value back toward 0, or states why it cannot.
    expect(bundle!.crossings).toBeLessThanOrEqual(2);
    expect(bundle!.crossings).toBeLessThan(run!.crossings);
    expect(bundle!.endCrossings).toBeLessThan(run!.endCrossings / 2);
  });
});

describe("the crossings of measureHighways on a long straight piece", () => {
  // One bundle of two lanes along the x axis, 300 long. The body of the bundle is from 12 to 288.
  const graph: SegmentGraph = {
    segments: [{ id: "s", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 290, y: 0 }, { x: 300, y: 0 }], edges: ["a", "b"], count: 2 }],
    paths: ["a", "b"].map((edge, lane) => ({ edge, segments: [{ segment: "s", reverse: false, lane }] })),
  };
  const lane = (edge: string, points: readonly Point[]): LaneCurve => ({
    edge,
    segments: points.map((to, i) => (i === 0 ? { kind: "move", to } : { kind: "line", to })),
  });
  const measure = (b: readonly Point[]) => {
    // The lane `a` is one straight piece, so the middle of the piece is far from each crossing.
    const a = lane("a", [{ x: 0, y: -2 }, { x: 300, y: 2 }]);
    return measureHighways(graph, new Set([runKey(["a", "b"])]), 4, [a, lane("b", b)]);
  };

  it("classes a crossing by its point, not by the middle of the piece", () => {
    const m = measure([{ x: 0, y: -3 }, { x: 280, y: -3 }, { x: 300, y: 3 }]);
    expect({ body: m.crossings, ends: m.endCrossings }).toEqual({ body: 0, ends: 1 });
  });

  it("counts each crossing of one pair on one piece", () => {
    const m = measure([{ x: 0, y: -3 }, { x: 100, y: 3 }, { x: 200, y: -3 }, { x: 300, y: 3 }]);
    expect({ body: m.crossings, ends: m.endCrossings }).toEqual({ body: 3, ends: 0 });
  });
});
