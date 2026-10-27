import { dist, type Point } from "../../geom.ts";
import { distinctPoints, type CurveSegment } from "../model.ts";
import { fitSize, type CurveSpace } from "../space.ts";

/** The options of `splineCurve`. */
export interface SplineOptions {
  /**
   * The tension of the spline, from 0 to 1. The value 0 gives the centripetal Catmull-Rom spline, and 1 gives the polyline.
   * The default is 0.
   */
  readonly tension?: number;
  /** The outward normal of the plug at the first point. With it, the curve leaves the first point along this normal. */
  readonly startNormal?: Point;
  /** The outward normal of the plug at the last point. With it, the curve comes into the last point against this normal. */
  readonly endNormal?: Point;
  /** The boxes that the curve must not go through. Without it, each piece gets the full tangents. */
  readonly space?: CurveSpace;
}

/**
 * This function draws a centripetal Catmull-Rom spline through the points of a polyline (Yuksel, Schaefer and Keyser, 2011).
 * Each piece between two points is one cubic Bezier curve. The centripetal knots keep the curve free of cusps and loops in a piece.
 * The curve goes through each point. Its tangent at a point keeps one direction on the two sides of the point.
 *
 * With `space`, the function makes the tangents of a piece shorter until the piece goes through no box that its leg avoids.
 * A piece with no tangent is the straight leg.
 */
export function splineCurve(points: readonly Point[], options: SplineOptions = {}): CurveSegment[] {
  const p = distinctPoints(points);
  if (p.length === 0) return [];
  const out: CurveSegment[] = [{ kind: "move", to: p[0]! }];
  const n = p.length;
  if (n === 1) return out;
  const scale = 1 - Math.max(0, Math.min(1, options.tension ?? 0));
  // The knot interval of each leg is the square root of its length.
  const dt = Array.from({ length: n - 1 }, (_, i) => Math.sqrt(dist(p[i]!, p[i + 1]!)));
  const unit = (q: Point): Point => {
    const l = Math.hypot(q.x, q.y);
    return l === 0 ? { x: 0, y: 0 } : { x: q.x / l, y: q.y / l };
  };
  // The tangent at each point, as a speed in the parameter of the knots.
  const m: Point[] = p.map((v, i) => {
    if (i === 0) {
      const leg = { x: p[1]!.x - v.x, y: p[1]!.y - v.y };
      if (!options.startNormal) return { x: leg.x / dt[0]!, y: leg.y / dt[0]! };
      const u = unit(options.startNormal);
      return { x: u.x * dt[0]!, y: u.y * dt[0]! };
    }
    if (i === n - 1) {
      const a = p[i - 1]!;
      const leg = { x: v.x - a.x, y: v.y - a.y };
      if (!options.endNormal) return { x: leg.x / dt[i - 1]!, y: leg.y / dt[i - 1]! };
      const u = unit(options.endNormal);
      return { x: -u.x * dt[i - 1]!, y: -u.y * dt[i - 1]! };
    }
    const a = p[i - 1]!;
    const b = p[i + 1]!;
    const t0 = dt[i - 1]!;
    const t1 = dt[i]!;
    return {
      x: (v.x - a.x) / t0 - (b.x - a.x) / (t0 + t1) + (b.x - v.x) / t1,
      y: (v.y - a.y) / t0 - (b.y - a.y) / (t0 + t1) + (b.y - v.y) / t1,
    };
  });
  for (let i = 0; i + 1 < n; i++) {
    const a = p[i]!;
    const b = p[i + 1]!;
    const h = dt[i]! / 3;
    const piece = (s: number): CurveSegment[] => [
      { kind: "move", to: a },
      { kind: "cubic", c1: { x: a.x + m[i]!.x * h * s, y: a.y + m[i]!.y * h * s }, c2: { x: b.x - m[i + 1]!.x * h * s, y: b.y - m[i + 1]!.y * h * s }, to: b },
    ];
    const s = fitSize(options.space, scale, () => [a, b], piece);
    out.push(s > 0 ? piece(s)[1]! : { kind: "line", to: b });
  }
  return out;
}
