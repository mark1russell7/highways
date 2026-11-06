import { describe, expect, it } from "vitest";
import { pointSegmentDistance, type Point } from "../geom.ts";
import { CURVE_TYPES, curveOf, pointAtFraction, sampleCurve, type CurveSegment } from "./index.ts";

const close = (a: Point, b: Point, eps = 1e-9): void => {
  expect(Math.abs(a.x - b.x), JSON.stringify([a, b])).toBeLessThanOrEqual(eps);
  expect(Math.abs(a.y - b.y), JSON.stringify([a, b])).toBeLessThanOrEqual(eps);
};
const length = (p: readonly Point[]): number => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i]!.x, q.y - p[i]!.y), 0);

describe("pointAtFraction", () => {
  // A made-up route in the shape of an L: 30 to the right, then 10 down. The y axis points down.
  const ell: Point[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }];

  it("gives the point and the tangent at a share of the length of a polyline", () => {
    expect(pointAtFraction(ell, 0.5)).toEqual({ point: { x: 20, y: 0 }, tangent: { x: 1, y: 0 } });
    expect(pointAtFraction(ell, 0.875)).toEqual({ point: { x: 30, y: 5 }, tangent: { x: 0, y: 1 } });
    expect(pointAtFraction(ell, 0)).toEqual({ point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } });
    expect(pointAtFraction(ell, 1)).toEqual({ point: { x: 30, y: 10 }, tangent: { x: 0, y: 1 } });
  });

  it("gives the leg after a corner at the corner, and the nearest end for a share out of range", () => {
    expect(pointAtFraction(ell, 0.75)).toEqual({ point: { x: 30, y: 0 }, tangent: { x: 0, y: 1 } });
    expect(pointAtFraction(ell, -2)).toEqual(pointAtFraction(ell, 0));
    expect(pointAtFraction(ell, 7)).toEqual(pointAtFraction(ell, 1));
  });

  it("skips a leg of length 0, and gives a tangent of 0 for a line of length 0", () => {
    const repeat: Point[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 8 }, { x: 0, y: 8 }];
    expect(pointAtFraction(repeat, 0)).toEqual({ point: { x: 0, y: 0 }, tangent: { x: 0, y: 1 } });
    expect(pointAtFraction(repeat, 1)).toEqual({ point: { x: 0, y: 8 }, tangent: { x: 0, y: 1 } });
    expect(pointAtFraction([{ x: 4, y: 4 }], 0.5)).toEqual({ point: { x: 4, y: 4 }, tangent: { x: 0, y: 0 } });
    expect(() => pointAtFraction([], 0.5)).toThrow();
  });

  it("gives the exact point and tangent on an arc", () => {
    // A quarter of a circle of radius 10 around (0, 0), from the angle 0 to the angle π/2.
    const arc: CurveSegment[] = [{ kind: "move", to: { x: 10, y: 0 } }, { kind: "arc", center: { x: 0, y: 0 }, radius: 10, start: 0, sweep: Math.PI / 2, to: { x: 0, y: 10 } }];
    const mid = pointAtFraction(arc, 0.5);
    close(mid.point, { x: 10 * Math.SQRT1_2, y: 10 * Math.SQRT1_2 });
    close(mid.tangent, { x: -Math.SQRT1_2, y: Math.SQRT1_2 });
    // The same arc, the other way round, turns the tangent.
    const back: CurveSegment[] = [{ kind: "move", to: { x: 0, y: 10 } }, { kind: "arc", center: { x: 0, y: 0 }, radius: 10, start: Math.PI / 2, sweep: -Math.PI / 2, to: { x: 10, y: 0 } }];
    close(pointAtFraction(back, 0.5).tangent, { x: Math.SQRT1_2, y: -Math.SQRT1_2 });
    // A line and the arc: the line is 10 long and the arc 5π long, so the share 10 / (10 + 5π) is the start of the arc.
    const both: CurveSegment[] = [{ kind: "move", to: { x: 20, y: 0 } }, { kind: "line", to: { x: 10, y: 0 } }, arc[1]!];
    close(pointAtFraction(both, 10 / (10 + 5 * Math.PI)).point, { x: 10, y: 0 });
  });

  it("gives the middle of a cubic segment on a straight line, with its direction", () => {
    const cubic: CurveSegment[] = [{ kind: "move", to: { x: 0, y: 0 } }, { kind: "cubic", c1: { x: 10, y: 0 }, c2: { x: 20, y: 0 }, to: { x: 30, y: 0 } }];
    const mid = pointAtFraction(cubic, 0.5);
    close(mid.point, { x: 15, y: 0 });
    close(mid.tangent, { x: 1, y: 0 });
    // A control point on an end gives a derivative of 0 there. The tangent is still the direction of travel.
    const flat: CurveSegment[] = [{ kind: "move", to: { x: 0, y: 0 } }, { kind: "cubic", c1: { x: 0, y: 0 }, c2: { x: 30, y: 0 }, to: { x: 30, y: 0 } }];
    expect(pointAtFraction(flat, 0).tangent).toEqual({ x: 1, y: 0 });
    expect(pointAtFraction(flat, 1).tangent).toEqual({ x: 1, y: 0 });
  });

  it("puts each point on the curve of each type, at the share of a fine length, with a unit tangent", () => {
    const zig: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 90 }];
    for (const type of CURVE_TYPES) {
      const curve = curveOf(zig, { type });
      const fine = sampleCurve(curve, 1e-4);
      const total = length(fine);
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const { point, tangent } = pointAtFraction(curve, t);
        // The point is on the curve: near the fine polyline.
        const off = Math.min(...fine.slice(1).map((b, i) => pointSegmentDistance(point, fine[i]!, b)));
        expect(off, `${type} ${t}`).toBeLessThanOrEqual(1e-3);
        // The length to the point is the share of the fine length. The Gauss-Legendre rule keeps the error under 1e-3 (the probe read 6e-6).
        let along = 0;
        for (let i = 1; i < fine.length; i++) {
          const [a, b] = [fine[i - 1]!, fine[i]!];
          if (pointSegmentDistance(point, a, b) <= 1e-3) {
            along += Math.hypot(point.x - a.x, point.y - a.y);
            break;
          }
          along += Math.hypot(b.x - a.x, b.y - a.y);
        }
        expect(Math.abs(along - t * total), `${type} ${t}`).toBeLessThanOrEqual(1e-3);
        expect(Math.hypot(tangent.x, tangent.y), `${type} ${t}`).toBeCloseTo(1, 9);
      }
    }
  });
});
