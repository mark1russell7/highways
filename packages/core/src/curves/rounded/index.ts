import { dist, type Point } from "../../geom.ts";
import { distinctPoints, type CurveSegment } from "../model.ts";
import { fitSize, type CurveSpace } from "../space.ts";

/** The options of `roundedCurve`. */
export interface RoundedOptions {
  /** The largest distance from a corner to the start and to the end of its curve. The default is 12. */
  readonly radius?: number;
  /** The boxes that the curve must not go through. Without it, each corner gets the full radius. */
  readonly space?: CurveSpace;
}

/**
 * This function rounds each inner vertex of a polyline with a quadratic Bezier curve, as `roundCorners` does.
 * The curve of a corner starts and ends at most `radius` from the vertex, and at most half of each leg. The ends of the polyline stay.
 * The function gives each quadratic curve as the same cubic curve. With `space`, it makes the radius of a corner smaller until the curve
 * goes through no box that the polyline avoids.
 */
export function roundedCurve(points: readonly Point[], options: RoundedOptions = {}): CurveSegment[] {
  const p = distinctPoints(points);
  if (p.length === 0) return [];
  const radius = options.radius ?? 12;
  const out: CurveSegment[] = [{ kind: "move", to: p[0]! }];
  for (let i = 1; i + 1 < p.length; i++) {
    const a = p[i - 1]!;
    const v = p[i]!;
    const b = p[i + 1]!;
    const la = dist(a, v);
    const lb = dist(v, b);
    const ends = (r: number): [Point, Point] => [
      { x: v.x + ((a.x - v.x) * r) / la, y: v.y + ((a.y - v.y) * r) / la },
      { x: v.x + ((b.x - v.x) * r) / lb, y: v.y + ((b.y - v.y) * r) / lb },
    ];
    const piece = (r: number): CurveSegment[] => {
      const [p1, p2] = ends(r);
      // A quadratic curve with the control point v is the cubic curve with the control points 2/3 of the way to v.
      return [{ kind: "cubic", c1: { x: p1.x + (2 * (v.x - p1.x)) / 3, y: p1.y + (2 * (v.y - p1.y)) / 3 }, c2: { x: p2.x + (2 * (v.x - p2.x)) / 3, y: p2.y + (2 * (v.y - p2.y)) / 3 }, to: p2 }];
    };
    const r = fitSize(
      options.space,
      Math.min(radius, la / 2, lb / 2),
      (s) => [ends(s)[0], v, ends(s)[1]],
      (s) => [{ kind: "move", to: ends(s)[0] }, ...piece(s)],
    );
    if (r <= 0) {
      out.push({ kind: "line", to: v });
      continue;
    }
    const [p1] = ends(r);
    if (dist(p1, at(out)) > 1e-9) out.push({ kind: "line", to: p1 });
    out.push(...piece(r));
  }
  if (p.length > 1) out.push({ kind: "line", to: p[p.length - 1]! });
  return out;
}

/** This function gives the end of the last segment. */
function at(segments: readonly CurveSegment[]): Point {
  return segments[segments.length - 1]!.to;
}
