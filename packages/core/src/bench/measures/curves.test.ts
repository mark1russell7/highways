import { describe, expect, it } from "vitest";
import { arcCurve, roundedCurve, sampleCurve, straightCurve, type CurveSegment } from "../../curves/index.ts";
import { bendingEnergy, crossesItself, curveFaults, curveJoints, g1Defect, g2Defect, hasCusp } from "./curves.ts";

const P = (x: number, y: number) => ({ x, y });
const L = [P(0, 0), P(40, 0), P(40, 40)];

describe("g1Defect (C1) and g2Defect (C2)", () => {
  it("gives the angle of the corner for a straight curve", () => {
    expect(g1Defect(straightCurve(L))).toBeCloseTo(90);
    expect(g2Defect(straightCurve(L), 10)).toBe(0);
  });

  it("gives 0 for the G1 curve types", () => {
    expect(g1Defect(roundedCurve(L))).toBeLessThan(0.5);
    expect(g1Defect(arcCurve(L))).toBeLessThan(0.5);
  });

  it("gives the jump of the curvature where a line meets an arc", () => {
    // A line, then a quarter circle of radius 5 that is tangent to it.
    const segments: CurveSegment[] = [
      { kind: "move", to: P(0, 0) },
      { kind: "line", to: P(10, 0) },
      { kind: "arc", center: P(10, 5), radius: 5, start: -Math.PI / 2, sweep: Math.PI / 2, to: P(15, 5) },
    ];
    expect(curveJoints(segments)).toHaveLength(1);
    expect(g1Defect(segments)).toBeCloseTo(0);
    expect(g2Defect(segments, 10)).toBeCloseTo(2);
    // The arc of `arcCurve` at radius 12 on a board of unit 12 gives a jump of 1.
    expect(g2Defect(arcCurve(L, { radius: 12 }), 12)).toBeCloseTo(1);
  });
});

describe("bendingEnergy (C3)", () => {
  it("gives 4π² for a full circle and 0 for a line", () => {
    const circle = Array.from({ length: 2001 }, (_, i) => P(10 * Math.cos((2 * Math.PI * i) / 2000), 10 * Math.sin((2 * Math.PI * i) / 2000)));
    expect(bendingEnergy(circle)).toBeCloseTo(4 * Math.PI ** 2, 0);
    expect(bendingEnergy([P(0, 0), P(5, 0), P(10, 0)])).toBe(0);
  });

  it("gives less energy to a rounded corner than to a sharp corner", () => {
    const sharp = bendingEnergy(sampleCurve(straightCurve(L), 0.25));
    const round = bendingEnergy(sampleCurve(roundedCurve(L), 0.25));
    expect(round).toBeGreaterThan(0);
    expect(round).toBeLessThan(sharp);
  });
});

describe("curveFaults (the proposed rules of the curves)", () => {
  it("finds no fault on a rounded corner", () => {
    const segments = roundedCurve(L);
    expect(curveFaults({ polyline: L, segments, samples: sampleCurve(segments, 0.25), smooth: true, startNormal: P(1, 0), endNormal: P(0, -1) })).toEqual({
      clear: false,
      ends: false,
      g1: false,
      simple: false,
    });
  });

  it("finds a kink away from the corners, a wrong end and a loop", () => {
    const segments: CurveSegment[] = [
      { kind: "move", to: P(0, 0) },
      { kind: "line", to: P(20, 0) },
      { kind: "line", to: P(30, 10) },
      { kind: "line", to: P(30, -10) },
      { kind: "line", to: P(25, -10) },
      { kind: "line", to: P(25, 15) },
      { kind: "line", to: P(40, 40) },
    ];
    const samples = sampleCurve(segments, 0.25);
    const f = curveFaults({ polyline: L, segments, samples, smooth: true });
    expect(f.g1).toBe(true);
    expect(f.simple).toBe(true);
    expect(f.ends).toBe(false);
    expect(curveFaults({ polyline: L, segments, samples: samples.slice(1) }).ends).toBe(true);
    // The end normal of the target points out of the box, so the curve must arrive along its inverse.
    expect(curveFaults({ polyline: L, segments: straightCurve(L), samples: L, endNormal: P(0, -1) }).ends).toBe(false);
    expect(curveFaults({ polyline: L, segments: straightCurve(L), samples: L, endNormal: P(-1, 0) }).ends).toBe(true);
  });

  it("keeps a corner that the curve leaves sharp out of the rule curve-g1", () => {
    expect(curveFaults({ polyline: L, segments: straightCurve(L), samples: L, smooth: true }).g1).toBe(false);
  });

  it("tells a loop and a cusp", () => {
    expect(crossesItself([P(0, 0), P(10, 0), P(10, 10), P(5, -5)])).toBe(true);
    expect(crossesItself(L)).toBe(false);
    expect(hasCusp([P(0, 0), P(10, 0), P(0, 0.01)])).toBe(true);
    expect(hasCusp(L)).toBe(false);
  });
});
