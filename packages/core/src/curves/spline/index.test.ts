import { describe, expect, it } from "vitest";
import { rng } from "../../fixtures.ts";
import type { Point } from "../../geom.ts";
import type { CubicSegment } from "../model.ts";
import { sampleCurve } from "../sample.ts";
import { curveSpace } from "../space.ts";
import { splineCurve } from "./index.ts";

const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

describe("splineCurve", () => {
  it("goes through each point, with one tangent direction on the two sides (property, 200 cases)", () => {
    const R = rng(11);
    for (let k = 0; k < 200; k++) {
      const p: Point[] = Array.from({ length: 3 + Math.floor(R() * 6) }, () => ({ x: 1 + Math.round(R() * 400), y: Math.round(R() * 400) }));
      // Each point is distinct from the point before it.
      for (let i = 1; i < p.length; i++) if (p[i]!.x === p[i - 1]!.x && p[i]!.y === p[i - 1]!.y) p[i] = { x: p[i]!.x + 1, y: p[i]!.y };
      const c = splineCurve(p);
      expect(c[0]!.to).toEqual(p[0]);
      const pieces = c.slice(1) as CubicSegment[];
      pieces.forEach((s, i) => expect(s.to).toEqual(p[i + 1]));
      for (let i = 0; i + 1 < pieces.length; i++) {
        const back = sub(pieces[i]!.to, pieces[i]!.c2);
        const ahead = sub(pieces[i + 1]!.c1, pieces[i]!.to);
        const scale = Math.hypot(back.x, back.y) * Math.hypot(ahead.x, ahead.y);
        if (scale < 1e-9) continue;
        expect(Math.abs(cross(back, ahead)) / scale).toBeLessThan(1e-9);
        expect(dot(back, ahead)).toBeGreaterThan(0);
      }
    }
  });
  it("leaves the first plug along its normal and comes into the last plug against its normal", () => {
    const c = splineCurve([{ x: 0, y: 0 }, { x: 90, y: 60 }], { startNormal: { x: 1, y: 0 }, endNormal: { x: 0, y: -1 } });
    const s = c[1] as CubicSegment;
    const L = Math.hypot(90, 60);
    expect(s.c1.x).toBeCloseTo(L / 3, 9);
    expect(s.c1.y).toBeCloseTo(0, 9);
    expect(s.c2.x).toBeCloseTo(90, 9);
    expect(s.c2.y).toBeCloseTo(60 - L / 3, 9);
  });
  it("gives the polyline at tension 1, and a straight line for two points without normals", () => {
    const p: Point[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }];
    expect(splineCurve(p, { tension: 1 }).map((s) => s.kind)).toEqual(["move", "line", "line"]);
    const s = splineCurve([{ x: 0, y: 0 }, { x: 30, y: 0 }])[1] as CubicSegment;
    expect(s.c1.x).toBeCloseTo(10, 9);
    expect(s.c2.x).toBeCloseTo(20, 9);
    expect(s.c1.y).toBeCloseTo(0, 9);
  });
  it("makes the tangents of a piece shorter where the full piece goes through a box", () => {
    // A zigzag: the spline swings out of the middle leg, toward the box next to it.
    const p: Point[] = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 120, y: 60 }];
    const space = curveSpace([{ x: 62, y: 4, w: 30, h: 20 }]);
    expect(space.addsHit(sampleCurve(splineCurve(p), 0.25), p)).toBe(true);
    const c = splineCurve(p, { space });
    expect(space.addsHit(sampleCurve(c, 0.25), p)).toBe(false);
  });
});
