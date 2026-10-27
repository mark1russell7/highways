import type { Point } from "../geom.ts";

/**
 * A type of curve for a route.
 *
 * - `straight`: the polyline as it is.
 * - `rounded`: a quadratic Bezier curve at each corner, as `roundCorners` draws it.
 * - `spline`: a centripetal Catmull-Rom spline through the points. It does not overshoot or make loops.
 * - `arc`: a circular arc at each corner, tangent to the two legs.
 * - `smooth`: a cubic spiral, an arc and a second cubic spiral at each corner, as the corner smoothing of Figma.
 * - `clothoid`: a clothoid, an arc and a second clothoid at each corner, as a transition curve of a road.
 */
export type CurveType = "straight" | "rounded" | "spline" | "arc" | "smooth" | "clothoid";

/** The curve types, in the order of the benchmark. */
export const CURVE_TYPES: readonly CurveType[] = ["straight", "rounded", "spline", "arc", "smooth", "clothoid"];

/** The start of a curve: the pen goes to `to` and draws nothing. */
export interface MoveSegment {
  readonly kind: "move";
  readonly to: Point;
}

/** A straight line from the end of the segment before to `to`. */
export interface LineSegment {
  readonly kind: "line";
  readonly to: Point;
}

/** A cubic Bezier curve from the end of the segment before to `to`, with the control points `c1` and `c2`. */
export interface CubicSegment {
  readonly kind: "cubic";
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

/**
 * A circular arc from the end of the segment before to `to`. The arc has its center at `center` and the radius `radius`.
 * It starts at the angle `start` and turns by `sweep` radians. A positive `sweep` turns from the x axis to the y axis.
 * On a canvas, `ctx.arc(center.x, center.y, radius, start, start + sweep, sweep < 0)` draws it.
 */
export interface ArcSegment {
  readonly kind: "arc";
  readonly center: Point;
  readonly radius: number;
  readonly start: number;
  readonly sweep: number;
  readonly to: Point;
}

/**
 * A segment of a curve. A curve is a list of segments: one `move` first, then lines, cubic curves and arcs.
 * A renderer maps the list to SVG path data, to canvas calls or to the vertices of a mesh.
 */
export type CurveSegment = MoveSegment | LineSegment | CubicSegment | ArcSegment;

/** This function gives the points of a polyline without the points that are nearer than `eps` to the point before them. */
export function distinctPoints(points: readonly Point[], eps = 1e-9): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (q === undefined || Math.hypot(p.x - q.x, p.y - q.y) > eps) out.push(p);
  }
  return out;
}
