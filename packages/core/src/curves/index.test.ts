import { describe, expect, it } from "vitest";
import { pointSegmentDistance, type Point } from "../geom.ts";
import { CURVE_TYPES, curveOf, cubicAt, curveSpace, sampleCurve, toSvgPath, type CurveSegment } from "./index.ts";
import { triangleOverlapsBox } from "./space.ts";

const zig: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 40 }];

// The largest distance from the dense points of a curve to the polyline of its samples.
const gap = (dense: readonly Point[], poly: readonly Point[]): number =>
  Math.max(...dense.map((q) => Math.min(...poly.slice(1).map((b, i) => pointSegmentDistance(q, poly[i]!, b)))));

describe("curveOf", () => {
  it("starts and ends each type at the ends of the polyline", () => {
    for (const type of CURVE_TYPES) {
      const c = curveOf(zig, { type });
      expect(c[0]).toEqual({ kind: "move", to: zig[0] });
      expect(c[c.length - 1]!.to).toEqual(zig[zig.length - 1]);
      const s = sampleCurve(c);
      expect(s[0]).toEqual(zig[0]);
      expect(s[s.length - 1]).toEqual(zig[zig.length - 1]);
    }
  });
});

describe("sampleCurve", () => {
  it("keeps a cubic curve and an arc within the tolerance", () => {
    const P: Point[] = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: -100 }, { x: 100, y: 0 }];
    const cubic: CurveSegment[] = [{ kind: "move", to: P[0]! }, { kind: "cubic", c1: P[1]!, c2: P[2]!, to: P[3]! }];
    const dense = Array.from({ length: 1001 }, (_, k) => cubicAt(P[0]!, P[1]!, P[2]!, P[3]!, k / 1000));
    for (const tol of [2, 0.5, 0.1]) expect(gap(dense, sampleCurve(cubic, tol))).toBeLessThanOrEqual(tol);
    const arc: CurveSegment[] = [{ kind: "move", to: { x: 50, y: 0 } }, { kind: "arc", center: { x: 0, y: 0 }, radius: 50, start: 0, sweep: Math.PI, to: { x: -50, y: 0 } }];
    const round = Array.from({ length: 1001 }, (_, k) => ({ x: 50 * Math.cos((Math.PI * k) / 1000), y: 50 * Math.sin((Math.PI * k) / 1000) }));
    const s = sampleCurve(arc, 0.2);
    expect(gap(round, s)).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(s[s.length - 1]).toEqual({ x: -50, y: 0 });
  });
});

describe("toSvgPath", () => {
  it("writes the commands M, L, C and A", () => {
    const c: CurveSegment[] = [
      { kind: "move", to: { x: 0, y: 0 } },
      { kind: "line", to: { x: 10.123, y: 0 } },
      { kind: "cubic", c1: { x: 12, y: 0 }, c2: { x: 14, y: 2 }, to: { x: 14, y: 4 } },
      { kind: "arc", center: { x: 24, y: 4 }, radius: 10, start: Math.PI, sweep: -Math.PI / 2, to: { x: 24, y: -6 } },
    ];
    expect(toSvgPath(c)).toBe("M 0 0 L 10.12 0 C 12 0 14 2 14 4 A 10 10 0 0 0 24 -6");
  });
});

describe("triangleOverlapsBox", () => {
  const [a, b, c] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  it("finds a box inside the triangle and a box across one side", () => {
    expect(triangleOverlapsBox(a, b, c, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
    expect(triangleOverlapsBox(a, b, c, { x: 4, y: 4, w: 4, h: 4 })).toBe(true);
  });
  it("finds no overlap for a box past the long side or a box that only touches", () => {
    expect(triangleOverlapsBox(a, b, c, { x: 6, y: 6, w: 4, h: 4 })).toBe(false);
    expect(triangleOverlapsBox(a, b, c, { x: -5, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

describe("curveSpace", () => {
  it("tests a corner triangle against the boxes that its polyline does not go through", () => {
    const space = curveSpace([{ x: 6, y: 1, w: 3, h: 3 }, { x: 20, y: -5, w: 4, h: 10 }]);
    expect(space.addsHitTriangle!({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBe(true);
    expect(space.addsHitTriangle!({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -10 })).toBe(false);
    // The polyline goes through the second box, so the triangle can overlap it.
    expect(space.addsHitTriangle!({ x: 15, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 })).toBe(false);
  });
});
