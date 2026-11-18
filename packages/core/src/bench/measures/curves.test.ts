import { describe, expect, it } from "vitest";
import { arcCurve, curveOf, roundedCurve, sampleCurve, straightCurve, type CurveOptions, type CurveSegment } from "../../curves/index.ts";
import type { Route } from "../../model.ts";
import { bendingEnergy, crossesItself, curveAgreement, curveFaults, curveJoints, g1Defect, g2Defect, hasCusp } from "./curves.ts";

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

describe("curveAgreement (C12)", () => {
  const route = (edge: string, ...points: [number, number][]): Route => ({ edge, points: points.map(([x, y]) => P(x, y)) });
  // Two routes come from two sides and share their last three points: a run of 200 units from (200, 100) to (400, 100).
  const one = route("one", [0, 0], [100, 0], [200, 100], [300, 100], [400, 100]);
  const two = route("two", [0, 200], [100, 200], [200, 100], [300, 100], [400, 100]);
  const drawn =
    (options: CurveOptions) =>
    (r: Route): CurveSegment[] =>
      curveOf(r.points, options);
  const straight = drawn({ type: "straight" });
  const spline = drawn({ type: "spline" });
  const smooth = drawn({ type: "smooth" });

  it("gives exactly 0 for straight curves on a shared run", () => {
    expect(curveAgreement([one, two], straight)).toEqual({ runs: 1, length: 200, read: 200, apart: 0, share: 0, max: 0 });
  });

  it("finds splines apart on a large part of the run", () => {
    // Each spline goes through the points of its route, so the two splines swing to the two sides of the run.
    const a = curveAgreement([one, two], spline);
    expect(a.runs).toBe(1);
    expect(a.length).toBe(200);
    expect(a.read).toBe(200);
    expect(a.max).toBeGreaterThan(11);
    expect(a.max).toBeLessThan(11.7);
    expect(a.share).toBeGreaterThan(0.4);
    expect(a.share).toBeLessThan(0.47);
    expect(a.apart).toBeCloseTo(a.share * 200, 9);
    // A finer sample gives nearly the same values.
    const fine = curveAgreement([one, two], spline, { tolerance: 0.05 });
    expect(Math.abs(fine.share - a.share)).toBeLessThan(0.01);
    expect(Math.abs(fine.max - a.max)).toBeLessThan(0.1);
    // A limit above the largest gap gives no part apart.
    expect(curveAgreement([one, two], spline, { apart: 20 })).toMatchObject({ runs: 1, apart: 0, share: 0, max: a.max });
  });

  it("finds smooth curves apart only at the corner where the routes part", () => {
    // At (200, 100), the two routes turn to the two sides, so the two round corners are on the two sides of the run.
    const full = curveAgreement([one, two], smooth);
    expect(full.max).toBeGreaterThan(1.5);
    expect(full.max).toBeLessThan(3);
    expect(full.share).toBeLessThan(0.02);
    // Off the corner, the gap stays below 1 unit and no part is apart.
    const off = curveAgreement([one, two], smooth, { ends: 4 });
    expect(off).toMatchObject({ runs: 1, length: 200, read: 192, apart: 0, share: 0 });
    expect(off.max).toBeLessThan(1);
    // Past the radius of the corner, the two curves are one line.
    expect(curveAgreement([one, two], smooth, { ends: 12 }).max).toBeLessThan(1e-9);
    // The splines are apart between the corners too.
    const swing = curveAgreement([one, two], spline, { ends: 12 });
    expect(swing.read).toBe(176);
    expect(swing.share).toBeGreaterThan(0.4);
  });

  it("orders the curve types on the same run", () => {
    const rounded = curveAgreement([one, two], drawn({ type: "rounded", radius: 18 }));
    expect(rounded.max).toBeGreaterThan(6);
    expect(rounded.max).toBeLessThan(6.6);
    expect(rounded.share).toBeGreaterThan(0.04);
    expect(rounded.share).toBeLessThan(0.08);
    expect(curveAgreement([one, two], smooth).share).toBeLessThan(rounded.share);
    expect(rounded.share).toBeLessThan(curveAgreement([one, two], spline).share);
  });

  it("gives 0 for two equal routes", () => {
    for (const curve of [straight, spline, smooth]) {
      const a = curveAgreement([one, { ...one, edge: "same" }], curve);
      expect(a).toEqual({ runs: 1, length: a.length, read: a.length, apart: 0, share: 0, max: 0 });
      expect(a.length).toBeCloseTo(300 + Math.sqrt(20000), 9);
    }
  });

  it("finds a run in the opposite direction", () => {
    const back: Route = { edge: "back", points: [...two.points].reverse() };
    expect(curveAgreement([one, back], straight)).toEqual({ runs: 1, length: 200, read: 200, apart: 0, share: 0, max: 0 });
    const a = curveAgreement([one, back], spline);
    const b = curveAgreement([one, two], spline);
    expect(a.runs).toBe(1);
    expect(a.length).toBe(200);
    expect(a.share).toBeCloseTo(b.share, 9);
    expect(a.max).toBeCloseTo(b.max, 9);
  });

  it("gives no run for routes without two common points in sequence", () => {
    const none = { runs: 0, length: 0, read: 0, apart: 0, share: 0, max: 0 };
    expect(curveAgreement([], spline)).toEqual(none);
    expect(curveAgreement([one], spline)).toEqual(none);
    expect(curveAgreement([one, route("far", [0, 500], [400, 500])], spline)).toEqual(none);
    // The two routes have only the point (200, 100) in common.
    expect(curveAgreement([one, route("cross", [200, 0], [200, 100], [200, 200])], spline)).toEqual(none);
  });

  it("counts the length of a run of three routes one time", () => {
    const three = route("three", [0, 100], [100, 100], [200, 100], [300, 100], [400, 100]);
    expect(curveAgreement([one, two, three], straight)).toEqual({ runs: 1, length: 200, read: 200, apart: 0, share: 0, max: 0 });
    expect(curveAgreement([one, two, three], spline)).toMatchObject({ runs: 1, length: 200, read: 200 });
    // The third route comes onto the run at (300, 100). The set of routes changes there, so the run ends and a new run starts.
    const tail = route("tail", [300, 300], [300, 100], [400, 100]);
    expect(curveAgreement([one, two, tail], straight)).toEqual({ runs: 2, length: 200, read: 200, apart: 0, share: 0, max: 0 });
  });

  it("takes points within the tolerance as equal", () => {
    const near = route("near", [0, 200], [100, 200], [200.3, 100], [300, 100.3], [400, 99.8]);
    const a = curveAgreement([one, near], straight);
    expect(a).toMatchObject({ runs: 1, length: 200, read: 200, apart: 0, share: 0 });
    expect(a.max).toBeCloseTo(0.3, 3);
    // A point 2 units away is a different point.
    expect(curveAgreement([one, route("off", [0, 200], [100, 200], [200, 102], [300, 102], [400, 102])], straight).runs).toBe(0);
  });

  it("tells when the ends leave no part of a run to read", () => {
    expect(curveAgreement([one, two], spline, { ends: 100 })).toEqual({ runs: 1, length: 200, read: 0, apart: 0, share: 0, max: 0 });
  });

  it("samples only the curves of the routes on a shared run", () => {
    const asked: string[] = [];
    curveAgreement([one, route("far", [0, 500], [400, 500]), two], (r) => {
      asked.push(r.edge);
      return curveOf(r.points, { type: "spline" });
    });
    expect(asked).toEqual(["one", "two"]);
  });

  it("gives the same bytes for the same input", () => {
    const three = route("three", [0, 100], [100, 100], [200, 100], [300, 100], [400, 100]);
    const first = JSON.stringify(curveAgreement([one, two, three], spline));
    expect(JSON.stringify(curveAgreement([one, two, three], spline))).toBe(first);
    expect(JSON.stringify(curveAgreement([one, two, three], drawn({ type: "spline" })))).toBe(first);
  });
});
