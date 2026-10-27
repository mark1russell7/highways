import { describe, expect, it } from "vitest";
import { curveJoints, g1Defect } from "../../bench/measures/curves.ts";
import type { Point } from "../../geom.ts";
import { arcCurve } from "../arc/index.ts";
import type { ArcSegment, CurveSegment } from "../model.ts";
import { sampleCurve } from "../sample.ts";
import { curveSpace } from "../space.ts";
import { bezierSpiral, MAX_SPIRAL_TURN, smoothCurve } from "./index.ts";

const L: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];

/** This function gives the signed curvature of a cubic piece at `t`. */
function cubicCurvature(p0: Point, c1: Point, c2: Point, p3: Point, t: number): number {
  const s = 1 - t;
  const d = {
    x: 3 * s * s * (c1.x - p0.x) + 6 * s * t * (c2.x - c1.x) + 3 * t * t * (p3.x - c2.x),
    y: 3 * s * s * (c1.y - p0.y) + 6 * s * t * (c2.y - c1.y) + 3 * t * t * (p3.y - c2.y),
  };
  const dd = {
    x: 6 * s * (c2.x - 2 * c1.x + p0.x) + 6 * t * (p3.x - 2 * c2.x + c1.x),
    y: 6 * s * (c2.y - 2 * c1.y + p0.y) + 6 * t * (p3.y - 2 * c2.y + c1.y),
  };
  return (d.x * dd.y - d.y * dd.x) / Math.hypot(d.x, d.y) ** 3;
}

const maxJump = (c: readonly CurveSegment[]): number => curveJoints(c).reduce((m, j) => Math.max(m, j.jump), 0);

describe("bezierSpiral", () => {
  it("starts straight and ends on the unit circle with the turn theta", () => {
    for (const theta of [0.05, 0.3, 0.6, 0.9, MAX_SPIRAL_TURN]) {
      const q = bezierSpiral(theta);
      const o = { x: 0, y: 0 };
      expect(cubicCurvature(o, q.c1, q.c2, q.to, 0)).toBeCloseTo(0, 12);
      expect(cubicCurvature(o, q.c1, q.c2, q.to, 1)).toBeCloseTo(1, 9);
      expect(Math.atan2(q.to.y - q.c2.y, q.to.x - q.c2.x)).toBeCloseTo(theta, 12);
    }
  });
  it("has a curvature that rises monotonically", () => {
    for (const theta of [0.1, 0.5, 0.8, MAX_SPIRAL_TURN]) {
      const q = bezierSpiral(theta);
      let last = -1e-12;
      for (let i = 0; i <= 100; i++) {
        const k = cubicCurvature({ x: 0, y: 0 }, q.c1, q.c2, q.to, i / 100);
        expect(k).toBeGreaterThanOrEqual(last - 1e-9);
        last = k;
      }
    }
  });
});

describe("smoothCurve", () => {
  it("puts a spiral, an arc and a spiral at a right angle, with no jump of the tangent or the curvature", () => {
    const c = smoothCurve(L, { radius: 10 });
    expect(c.map((s) => s.kind)).toEqual(["move", "line", "cubic", "arc", "cubic", "line"]);
    expect((c[3] as ArcSegment).radius).toBe(10);
    expect(g1Defect(c)).toBeLessThan(1e-6);
    expect(maxJump(c)).toBeLessThan(1e-9);
    // The corner is symmetric: the tangent points are at the same distance from the vertex.
    const [p1, p2] = [c[1]!.to, c[4]!.to];
    expect(50 - p1.x).toBeCloseTo(p2.y, 9);
    expect(p1.y).toBeCloseTo(0, 12);
    expect(p2.x).toBeCloseTo(50, 9);
  });
  it("turns the other way with a negative sweep", () => {
    const c = smoothCurve([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -50 }], { radius: 10 });
    const a = c.find((s): s is ArcSegment => s.kind === "arc")!;
    expect(a.sweep).toBeLessThan(0);
    expect(maxJump(c)).toBeLessThan(1e-9);
  });
  it("gives the circular arc of arcCurve with the smoothing 0", () => {
    const c = smoothCurve(L, { radius: 10, smoothing: 0 });
    expect(c).toEqual(arcCurve(L, { radius: 10 }));
  });
  it("gives no arc with the smoothing 1 at a right angle", () => {
    const c = smoothCurve(L, { radius: 10, smoothing: 1 });
    expect(c.map((s) => s.kind)).toEqual(["move", "line", "cubic", "cubic", "line"]);
    expect(maxJump(c)).toBeLessThan(1e-9);
  });
  it("keeps an arc for a sharp turn, because each spiral turns by 1 radian or less", () => {
    const c = smoothCurve([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 10, y: 10 }], { radius: 6, smoothing: 1 });
    expect(c.some((s) => s.kind === "arc")).toBe(true);
    expect(g1Defect(c)).toBeLessThan(1e-6);
    expect(maxJump(c)).toBeLessThan(1e-9);
  });
  it("keeps each corner on the first half of each leg", () => {
    const c = smoothCurve([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }], { radius: 100 });
    expect(c[1]!.to.x).toBeGreaterThanOrEqual(4 - 1e-9);
    expect(c.at(-2)!.to.y).toBeLessThanOrEqual(4 + 1e-9);
  });
  it("keeps a half turn and a straight vertex sharp", () => {
    expect(smoothCurve([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }]).map((s) => s.kind)).toEqual(["move", "line", "line"]);
    expect(smoothCurve([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]).map((s) => s.kind)).toEqual(["move", "line", "line"]);
  });
  it("stays inside its corner triangle", () => {
    const c = smoothCurve(L, { radius: 12 });
    const [a, v, b] = [c[1]!.to, L[1]!, c.at(-2)!.to];
    for (const q of sampleCurve([{ kind: "move", to: a }, ...c.slice(2, -1)], 0.05)) {
      // A point inside the triangle is on the inner side of each of its three sides.
      for (const [p, r] of [[a, v], [v, b], [b, a]] as const) expect((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)).toBeGreaterThanOrEqual(-1e-9);
    }
  });
  it("makes the radius smaller where the corner triangle overlaps a box", () => {
    const space = curveSpace([{ x: 44, y: 1.5, w: 5, h: 5 }]);
    expect(space.addsHit(sampleCurve(smoothCurve(L, { radius: 12 }), 0.25), L)).toBe(true);
    const c = smoothCurve(L, { radius: 12, space });
    expect(space.addsHit(sampleCurve(c, 0.25), L)).toBe(false);
    const a = c.find((s): s is ArcSegment => s.kind === "arc");
    expect(a !== undefined && a.radius > 0 && a.radius < 12).toBe(true);
  });
});
