import { describe, expect, it } from "vitest";
import { measureHighways, measureJogs, SPACING_LIMIT } from "../../bench/curves.ts";
import { crossingPairs } from "../../bench/measures/crossing-pairs.ts";
import type { Point } from "../../geom.ts";
import { pathPoints, runKey, type SegmentGraph } from "../../segments.ts";
import { arcCurve } from "../arc/index.ts";
import type { ArcSegment, CurveSegment } from "../model.ts";
import { sampleCurve } from "../sample.ts";
import { curveSpace } from "../space.ts";
import { highwayCurve, highwayCurves, tracedHighwayCurves } from "./index.ts";

const P = (x: number, y: number): Point => ({ x, y });

// A bundle of three lanes with a right turn. The lane `a` joins after an S, `b` joins straight and `c` joins from below.
// The lanes split at the end of the bundle. The edge `d` is in no bundle.
const graph: SegmentGraph = {
  segments: [
    { id: "in-a", points: [P(-60, -30), P(-30, -30), P(-30, 0), P(0, 0)], edges: ["a"], count: 1 },
    { id: "in-b", points: [P(-60, 0), P(0, 0)], edges: ["b"], count: 1 },
    { id: "in-c", points: [P(0, 60), P(0, 0)], edges: ["c"], count: 1 },
    { id: "trunk", points: [P(0, 0), P(120, 0), P(120, 120)], edges: ["a", "b", "c"], count: 3 },
    { id: "out-a", points: [P(120, 120), P(160, 160)], edges: ["a"], count: 1 },
    { id: "out-b", points: [P(120, 120), P(120, 180)], edges: ["b"], count: 1 },
    { id: "out-c", points: [P(120, 120), P(80, 160)], edges: ["c"], count: 1 },
    { id: "alone", points: [P(-60, 80), P(-20, 80), P(-20, 120)], edges: ["d"], count: 1 },
  ],
  paths: [
    { edge: "a", segments: [{ segment: "in-a", reverse: false, lane: 0 }, { segment: "trunk", reverse: false, lane: 0 }, { segment: "out-a", reverse: false, lane: 0 }] },
    { edge: "b", segments: [{ segment: "in-b", reverse: false, lane: 0 }, { segment: "trunk", reverse: false, lane: 1 }, { segment: "out-b", reverse: false, lane: 0 }] },
    { edge: "c", segments: [{ segment: "in-c", reverse: false, lane: 0 }, { segment: "trunk", reverse: false, lane: 2 }, { segment: "out-c", reverse: false, lane: 0 }] },
    { edge: "d", segments: [{ segment: "alone", reverse: false, lane: 0 }] },
  ],
};
const open = new Set([runKey(["a", "b", "c"])]);

/** This function gives the arc of each lane at the bend of the trunk: the arc with its center nearest to the inner corner. */
const bendArcs = (curves: readonly { segments: readonly CurveSegment[] }[]): ArcSegment[] =>
  curves.slice(0, 3).map((c) => {
    const arcs = c.segments.filter((s): s is ArcSegment => s.kind === "arc" && s.center.x > 60 && s.center.y < 60);
    expect(arcs).toHaveLength(1);
    return arcs[0]!;
  });

describe("highwayCurves", () => {
  it("bends the lanes of a bundle about one center, at the lane spacing", () => {
    const curves = highwayCurves(graph, open, 4, { maxWidth: 16 });
    expect(curves.map((c) => c.edge)).toEqual(["a", "b", "c", "d"]);
    const arcs = bendArcs(curves);
    for (const a of arcs) {
      expect(a.center.x).toBeCloseTo(arcs[1]!.center.x, 9);
      expect(a.center.y).toBeCloseTo(arcs[1]!.center.y, 9);
    }
    expect(arcs.map((a) => a.radius)).toEqual([16, 12, 8]);
    const m = measureHighways(graph, open, 4, curves, { maxWidth: 16 });
    expect(m.bundles).toBe(1);
    expect(m.worstSpacing).toBeLessThanOrEqual(SPACING_LIMIT);
    expect(m.crossings + m.endCrossings).toBe(0);
  });

  it("joins and leaves a bundle with no break of the tangent, and keeps each radius over the smallest", () => {
    const curves = highwayCurves(graph, open, 4, { maxWidth: 16, minRadius: 4 });
    const m = measureHighways(graph, open, 4, curves, { maxWidth: 16, minRadius: 4 });
    expect(m.breaks).toBe(0);
    expect(m.underMin).toBe(0);
    expect(m.minRadius).toBeGreaterThanOrEqual(4);
  });

  it("grows the bend to keep the inner lane at minRadius", () => {
    const arcs = bendArcs(highwayCurves(graph, open, 4, { maxWidth: 16, radius: 6, minRadius: 4 }));
    expect(arcs.map((a) => a.radius)).toEqual([12, 8, 4]);
  });

  it("shrinks a bend so that no lane goes through a box, and keeps one center", () => {
    const space = curveSpace([{ x: 109, y: 5, w: 6, h: 6 }]);
    const curves = highwayCurves(graph, open, 4, { maxWidth: 16, space });
    const arcs = bendArcs(curves);
    expect(arcs[2]!.radius).toBeLessThan(8);
    expect(arcs[0]!.radius - arcs[1]!.radius).toBeCloseTo(4, 9);
    expect(arcs[1]!.radius - arcs[2]!.radius).toBeCloseTo(4, 9);
    expect(measureHighways(graph, open, 4, curves, { maxWidth: 16, space }).through).toBe(0);
  });

  it("gives the curve of arcCurve to a lane in no open bundle", () => {
    const curves = highwayCurves(graph, open, 4, { maxWidth: 16 });
    expect(curves[3]!.segments).toEqual(arcCurve(pathPoints(graph, graph.paths[3]!), { radius: 12 }));
    const closed = highwayCurves(graph, new Set(), 4);
    for (const [i, path] of graph.paths.entries()) expect(closed[i]!.segments).toEqual(arcCurve(pathPoints(graph, path), { radius: 12 }));
  });
});

describe("the S curves of highwayCurves", () => {
  const jogsOf = (options: Parameters<typeof tracedHighwayCurves>[3]): ReturnType<typeof measureJogs> => {
    const t = tracedHighwayCurves(graph, open, 4, options);
    return measureJogs(t.curves, t.jogs, options?.jog);
  };
  it("gives the same curves with the jog biarc as with no jog", () => {
    expect(highwayCurves(graph, open, 4, { maxWidth: 16, jog: "biarc" })).toEqual(highwayCurves(graph, open, 4, { maxWidth: 16 }));
  });

  it("finds the S curves of each lane", () => {
    const { curves, jogs } = tracedHighwayCurves(graph, open, 4, { maxWidth: 16 });
    expect(jogs).toHaveLength(curves.length);
    const m = measureJogs(curves, jogs);
    expect(m.count).toBeGreaterThan(0);
    // A biarc has the curvature 1 / r at its ends and a jump of 2 / r at its inflection.
    expect(m.endJump).toBeGreaterThan(0);
    expect(m.innerJump).toBeGreaterThan(0);
  });

  for (const jog of ["cubic", "quintic"] as const) {
    it(`draws ${jog} S curves with no break of the tangent, and keeps the lanes at the spacing`, () => {
      const { curves, jogs } = tracedHighwayCurves(graph, open, 4, { maxWidth: 16, minRadius: 4, jog });
      const m = measureJogs(curves, jogs, jog);
      expect(m.count).toBe(jogsOf({ maxWidth: 16, minRadius: 4 }).count);
      expect(m.biarcs).toBeLessThan(m.count);
      // Each S curve keeps its curvature at 1 / 4 or less: the radius of the smallest arc of a biarc.
      expect(m.peakMax).toBeLessThanOrEqual(1 / 4 + 1e-3);
      const h = measureHighways(graph, open, 4, curves, { maxWidth: 16, minRadius: 4 });
      expect(h.breaks).toBe(0);
      expect(h.worstSpacing).toBeLessThanOrEqual(SPACING_LIMIT);
      expect(h.crossings + h.endCrossings).toBe(0);
    });
  }

  it("draws quintic S curves with no jump of the curvature", () => {
    const { curves, jogs } = tracedHighwayCurves(graph, open, 4, { maxWidth: 16, jog: "quintic" });
    const m = measureJogs(curves, jogs, "quintic");
    expect(m.biarcs).toBeLessThan(m.count);
    expect(m.endJump).toBeLessThan(1e-9);
    expect(m.innerJump).toBeLessThan(1e-6);
    const one = jogsOf({ maxWidth: 16, jog: "quintic", jogPieces: 1 });
    expect(one.count).toBe(m.count);
  });
});

describe("highwayCurve", () => {
  it("gives the curve of arcCurve", () => {
    const p = [P(0, 0), P(50, 0), P(50, 50)];
    expect(highwayCurve(p)).toEqual(arcCurve(p, { radius: 12 }));
    expect(highwayCurve(p, { radius: 5 })).toEqual(arcCurve(p, { radius: 5 }));
  });
});

describe("the option jogSpan of highwayCurves", () => {
  // Four lanes on two legs of one line. The room of the first leg narrows it, so the lanes shift by 4.5 and 1.5 where the second leg starts.
  const lane = (segment: string, index: number) => ({ segment, reverse: false, lane: index });
  const step: SegmentGraph = {
    segments: [
      { id: "narrow", points: [P(0, 0), P(200, 0)], edges: ["a", "b", "c", "d"], count: 4, room: { left: 4, right: 4 } },
      { id: "wide", points: [P(200, 0), P(400, 0)], edges: ["a", "b", "c", "d"], count: 4 },
    ],
    paths: ["a", "b", "c", "d"].map((edge, i) => ({ edge, segments: [lane("narrow", i), lane("wide", i)] })),
  };
  const open = new Set([runKey(step.segments[0]!.edges)]);
  /** This function gives the place where a lane comes to its widest offset, after the step. */
  const ends = (curve: readonly CurveSegment[]): number => {
    const samples = sampleCurve([...curve], 0.001);
    const widest = Math.max(...samples.map((p) => Math.abs(p.y)));
    return samples.find((p) => Math.abs(p.y) > widest - 1e-6)!.x;
  };

  it("gives each lane at one step the length of the largest shift", () => {
    const own = highwayCurves(step, open, 5, { maxWidth: 30 }).map((c) => ends(c.segments));
    const common = highwayCurves(step, open, 5, { maxWidth: 30, jogSpan: "step" }).map((c) => ends(c.segments));
    expect(Math.max(...own) - Math.min(...own)).toBeGreaterThan(4);
    expect(Math.max(...common) - Math.min(...common)).toBeLessThan(0.5);
    // The largest shift keeps its own length.
    expect(Math.max(...common)).toBeCloseTo(Math.max(...own), 0);
  });

  it("keeps each arc at the wanted radius or more", () => {
    for (const curve of highwayCurves(step, open, 5, { maxWidth: 30, jogSpan: "step" })) {
      for (const s of curve.segments) if (s.kind === "arc") expect(s.radius).toBeGreaterThanOrEqual(12 - 1e-9);
    }
  });

  it("leaves no crossing between the lanes of a step at a bend", () => {
    const bend: SegmentGraph = {
      segments: [step.segments[0]!, { id: "wide", points: [P(200, 0), P(200, 200)], edges: ["a", "b", "c", "d"], count: 4 }],
      paths: step.paths,
    };
    const curves = highwayCurves(bend, open, 5, { maxWidth: 30, jogSpan: "step" });
    expect(crossingPairs(curves.map((c) => ({ edge: c.edge, points: sampleCurve(c.segments, 0.02) }))).size).toBe(0);
  });

  it("changes nothing with the default, on a graph with a merge, a split and a bend", () => {
    const keys = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
    expect(highwayCurves(graph, keys, 5, { jogSpan: "lane" })).toEqual(highwayCurves(graph, keys, 5));
    expect(highwayCurves(step, open, 5, { maxWidth: 30, jogSpan: "lane" })).toEqual(highwayCurves(step, open, 5, { maxWidth: 30 }));
  });
});
