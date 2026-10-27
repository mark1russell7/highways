import { dist, type Point } from "../../geom.ts";
import { distinctPoints, type CurveSegment } from "../model.ts";
import { fitSize, type CurveSpace } from "../space.ts";

/** The options of `arcCurve`. */
export interface ArcOptions {
  /** The largest radius of the arc at a corner. The default is 12. */
  readonly radius?: number;
  /** The boxes that the curve must not go through. Without it, each corner gets the largest radius that fits on its legs. */
  readonly space?: CurveSpace;
}

/** A turn smaller than this angle, in radians, is no corner. A turn nearer to a half turn than this angle stays sharp. */
const FLAT = 1e-6;

/**
 * This function puts a circular arc at each inner vertex of a polyline. The arc is tangent to the two legs of its corner.
 * The tangent points stay on the first half of each leg, so the ends of the polyline stay.
 * With `space`, the function makes the radius of a corner smaller until the arc goes through no box that the polyline avoids.
 * On a polyline with only horizontal and vertical legs, each arc is a quarter circle.
 */
export function arcCurve(points: readonly Point[], options: ArcOptions = {}): CurveSegment[] {
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
    const ux = (v.x - a.x) / la;
    const uy = (v.y - a.y) / la;
    const wx = (b.x - v.x) / lb;
    const wy = (b.y - v.y) / lb;
    const turn = Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy);
    if (Math.abs(turn) < FLAT || Math.PI - Math.abs(turn) < FLAT) {
      out.push({ kind: "line", to: v });
      continue;
    }
    // The tangent points are r·tan(|turn|/2) from the vertex.
    const k = Math.tan(Math.abs(turn) / 2);
    const side = Math.sign(turn);
    const ends = (r: number): [Point, Point] => [
      { x: v.x - ux * r * k, y: v.y - uy * r * k },
      { x: v.x + wx * r * k, y: v.y + wy * r * k },
    ];
    const piece = (r: number): CurveSegment[] => {
      const [p1, p2] = ends(r);
      // The center is on the side of the turn, at the distance r from the first leg.
      const center = { x: p1.x - side * uy * r, y: p1.y + side * ux * r };
      return [{ kind: "arc", center, radius: r, start: Math.atan2(p1.y - center.y, p1.x - center.x), sweep: turn, to: p2 }];
    };
    const r = fitSize(
      options.space,
      Math.min(radius, Math.min(la, lb) / (2 * k)),
      (s) => [ends(s)[0], v, ends(s)[1]],
      (s) => [{ kind: "move", to: ends(s)[0] }, ...piece(s)],
    );
    if (r <= 0) {
      out.push({ kind: "line", to: v });
      continue;
    }
    const [p1] = ends(r);
    if (dist(p1, out[out.length - 1]!.to) > 1e-9) out.push({ kind: "line", to: p1 });
    out.push(...piece(r));
  }
  if (p.length > 1) out.push({ kind: "line", to: p[p.length - 1]! });
  return out;
}
