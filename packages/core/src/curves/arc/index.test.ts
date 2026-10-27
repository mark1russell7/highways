import { describe, expect, it } from "vitest";
import { dist, type Point } from "../../geom.ts";
import type { ArcSegment } from "../model.ts";
import { sampleCurve } from "../sample.ts";
import { curveSpace } from "../space.ts";
import { arcCurve } from "./index.ts";

const L: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];

describe("arcCurve", () => {
  it("puts a quarter circle at a right angle, tangent to both legs", () => {
    const c = arcCurve(L, { radius: 10 });
    expect(c.map((s) => s.kind)).toEqual(["move", "line", "arc", "line"]);
    const a = c[2] as ArcSegment;
    expect(a.radius).toBe(10);
    expect(a.sweep).toBeCloseTo(Math.PI / 2, 12);
    expect(a.center.x).toBeCloseTo(40, 9);
    expect(a.center.y).toBeCloseTo(10, 9);
    expect(c[1]!.to.x).toBeCloseTo(40, 9);
    expect(c[1]!.to.y).toBeCloseTo(0, 9);
    expect(a.to.x).toBeCloseTo(50, 9);
    expect(a.to.y).toBeCloseTo(10, 9);
    for (const q of sampleCurve([{ kind: "move", to: c[1]!.to }, a], 0.1)) expect(dist(q, a.center)).toBeCloseTo(10, 9);
  });
  it("turns the other way with a negative sweep", () => {
    const a = arcCurve([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -50 }], { radius: 10 })[2] as ArcSegment;
    expect(a.sweep).toBeCloseTo(-Math.PI / 2, 12);
    expect(a.center.y).toBeCloseTo(-10, 9);
  });
  it("keeps the arcs on the first half of each leg", () => {
    const c = arcCurve([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }], { radius: 100 });
    const a = c[2] as ArcSegment;
    expect(a.kind).toBe("arc");
    expect(a.radius).toBeCloseTo(4, 9);
  });
  it("keeps a half turn and a straight vertex sharp", () => {
    expect(arcCurve([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }]).map((s) => s.kind)).toEqual(["move", "line", "line"]);
    expect(arcCurve([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]).map((s) => s.kind)).toEqual(["move", "line", "line"]);
  });
  it("makes the radius smaller where the full arc goes through a box", () => {
    const space = curveSpace([{ x: 44, y: 1.5, w: 5, h: 5 }]);
    expect(space.addsHit(sampleCurve(arcCurve(L, { radius: 12 }), 0.25), L)).toBe(true);
    const c = arcCurve(L, { radius: 12, space });
    expect(space.addsHit(sampleCurve(c, 0.25), L)).toBe(false);
    const a = c.find((s): s is ArcSegment => s.kind === "arc");
    expect(a !== undefined && a.radius > 0 && a.radius < 12).toBe(true);
  });
});
