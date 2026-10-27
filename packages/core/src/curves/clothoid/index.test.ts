import { describe, expect, it } from "vitest";
import { curveJoints, g1Defect } from "../../bench/measures/curves.ts";
import type { Point } from "../../geom.ts";
import { arcCurve } from "../arc/index.ts";
import type { ArcSegment, CurveSegment } from "../model.ts";
import { cubicAt, sampleCurve } from "../sample.ts";
import { curveSpace } from "../space.ts";
import { clothoidCurve, clothoidPoint, clothoidShape, MAX_CLOTHOID_PIECES } from "./index.ts";

const L: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];

const maxJump = (c: readonly CurveSegment[]): number => curveJoints(c).reduce((m, j) => Math.max(m, j.jump), 0);

/** This function gives the largest distance from the cubic pieces of a clothoid at the radius `r` to the true clothoid. */
function fitError(turn: number, spiral: number, tolerance: number, r: number): { error: number; pieces: number } {
  const shape = clothoidShape(turn, spiral, tolerance);
  const length = 2 * shape.theta;
  const dense: Point[] = [];
  for (let i = 0; i <= 2000; i++) {
    const p = clothoidPoint((i / 2000) * length, length);
    dense.push({ x: p.x * r, y: p.y * r });
  }
  let error = 0;
  let from: Point = { x: 0, y: 0 };
  const pieces = shape.pieces(r);
  for (const q of pieces) {
    const [c1, c2, to] = [q.c1, q.c2, q.to].map((p) => ({ x: p.x * r, y: p.y * r })) as [Point, Point, Point];
    for (let i = 0; i <= 32; i++) {
      const s = cubicAt(from, c1, c2, to, i / 32);
      error = Math.max(error, Math.min(...dense.map((d) => Math.hypot(d.x - s.x, d.y - s.y))));
    }
    from = to;
  }
  return { error, pieces: pieces.length };
}

describe("clothoidPoint", () => {
  it("matches a numeric integral of the tangent", () => {
    const a2 = 3;
    let x = 0;
    let y = 0;
    const s = 2.5;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const m = ((i + 0.5) / n) * s;
      x += (Math.cos((m * m) / (2 * a2)) * s) / n;
      y += (Math.sin((m * m) / (2 * a2)) * s) / n;
    }
    const p = clothoidPoint(s, a2);
    expect(p.x).toBeCloseTo(x, 7);
    expect(p.y).toBeCloseTo(y, 7);
  });
});

describe("clothoidCurve", () => {
  it("puts a clothoid, an arc and a clothoid at a right angle, with no jump of the tangent or the curvature", () => {
    const c = clothoidCurve(L, { radius: 10 });
    expect(c[0]!.kind).toBe("move");
    expect(c[1]!.kind).toBe("line");
    expect(c.filter((s) => s.kind === "arc")).toHaveLength(1);
    expect((c.find((s) => s.kind === "arc") as ArcSegment).radius).toBe(10);
    expect(g1Defect(c)).toBeLessThan(1e-6);
    expect(maxJump(c) * 10).toBeLessThan(1e-6);
    expect(c.at(-1)!.to).toEqual(L[2]);
  });
  it("keeps the fit of each clothoid within the tolerance", () => {
    for (const [turn, spiral, tolerance, r] of [
      [Math.PI / 2, 0.5, 0.25, 12],
      [Math.PI / 2, 1, 0.05, 48],
      [2.8, 1, 0.05, 48],
      [0.4, 0.3, 1, 6],
    ] as const) {
      const fit = fitError(turn, spiral, tolerance, r);
      expect(fit.error).toBeLessThanOrEqual(tolerance);
      expect(fit.pieces).toBeLessThanOrEqual(MAX_CLOTHOID_PIECES);
    }
  });
  it("uses more pieces for a smaller tolerance", () => {
    expect(fitError(Math.PI / 2, 1, 0.05, 48).pieces).toBeGreaterThan(fitError(Math.PI / 2, 1, 1, 48).pieces);
  });
  it("gives the circular arc of arcCurve with the spiral 0", () => {
    expect(clothoidCurve(L, { radius: 10, spiral: 0 })).toEqual(arcCurve(L, { radius: 10 }));
  });
  it("gives no arc with the spiral 1", () => {
    const c = clothoidCurve(L, { radius: 10, spiral: 1 });
    expect(c.some((s) => s.kind === "arc")).toBe(false);
    expect(g1Defect(c)).toBeLessThan(1e-6);
  });
  it("keeps a half turn and a straight vertex sharp", () => {
    expect(clothoidCurve([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }]).map((s) => s.kind)).toEqual(["move", "line", "line"]);
    expect(clothoidCurve([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]).map((s) => s.kind)).toEqual(["move", "line", "line"]);
  });
  it("makes the radius smaller where the corner triangle overlaps a box", () => {
    const space = curveSpace([{ x: 44, y: 1.5, w: 5, h: 5 }]);
    expect(space.addsHit(sampleCurve(clothoidCurve(L, { radius: 12 }), 0.25), L)).toBe(true);
    const c = clothoidCurve(L, { radius: 12, space });
    expect(space.addsHit(sampleCurve(c, 0.25), L)).toBe(false);
    const a = c.find((s): s is ArcSegment => s.kind === "arc");
    expect(a !== undefined && a.radius > 0 && a.radius < 12).toBe(true);
  });
});
