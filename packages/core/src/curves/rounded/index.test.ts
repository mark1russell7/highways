import { describe, expect, it } from "vitest";
import { roundCorners } from "../../curves.ts";
import type { Point } from "../../geom.ts";
import { cubicAt, sampleCurve } from "../sample.ts";
import { curveSpace } from "../space.ts";
import { roundedCurve } from "./index.ts";

// An L turn to the south. A small box sits inside the turn, near the corner.
const L: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
const inner = { x: 44, y: 1.5, w: 5, h: 5 };

describe("roundedCurve", () => {
  it("draws the same curves as roundCorners", () => {
    const p: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 90, y: 50 }, { x: 95, y: 0 }];
    const want = roundCorners(p, 12, 4);
    const got: Point[] = [];
    let at = p[0]!;
    for (const s of roundedCurve(p, { radius: 12 })) {
      if (s.kind === "cubic") for (let k = 0; k <= 4; k++) got.push(cubicAt(at, s.c1, s.c2, s.to, k / 4));
      else if (s.kind === "move") got.push(s.to);
      at = s.to;
    }
    got.push(p[p.length - 1]!);
    expect(got).toHaveLength(want.length);
    got.forEach((q, i) => {
      expect(q.x).toBeCloseTo(want[i]!.x, 9);
      expect(q.y).toBeCloseTo(want[i]!.y, 9);
    });
  });
  it("keeps the ends and the first and last legs", () => {
    const c = roundedCurve(L, { radius: 12 });
    expect(c[0]).toEqual({ kind: "move", to: L[0] });
    expect(c[1]).toEqual({ kind: "line", to: { x: 38, y: 0 } });
    expect(c[c.length - 1]).toEqual({ kind: "line", to: L[2] });
  });
  it("makes the radius smaller where the full corner goes through a box", () => {
    const space = curveSpace([inner]);
    expect(space.addsHit(sampleCurve(roundedCurve(L, { radius: 12 }), 0.25), L)).toBe(true);
    const c = roundedCurve(L, { radius: 12, space });
    expect(space.addsHit(sampleCurve(c, 0.25), L)).toBe(false);
    expect(c.some((s) => s.kind === "cubic")).toBe(true);
  });
});
