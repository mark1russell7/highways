import type { Point } from "../../geom.ts";
import { cornerTangent, spiralCorners, type SpiralShape } from "../corner.ts";
import type { CurveSegment } from "../model.ts";
import type { CurveSpace } from "../space.ts";

/** The options of `smoothCurve`. */
export interface SmoothOptions {
  /** The radius of the arc in the middle of each corner: the smallest radius of the corner. The default is 12. */
  readonly radius?: number;
  /** The share of the turn of a corner in its two spirals, from 0 (a circular arc) to 1 (no arc). The default is 0.6. */
  readonly smoothing?: number;
  /** The boxes that the curve must not go through. Without it, each corner gets the largest radius that fits on its legs. */
  readonly space?: CurveSpace;
}

/** The largest turn of one spiral, in radians. A cubic spiral with a larger turn has a curvature that is not monotone. */
export const MAX_SPIRAL_TURN = 1;

/**
 * This function gives the cubic Bezier spiral at the radius 1 with the turn `theta` (F7 of the note CURVES).
 * The first three control points are on the x axis, so the curvature is 0 at the start. The end has the curvature 1 and the tangent angle `theta`.
 * The handles are `a = (2/3) θ (1 - θ²/2)` and `b = (2/3) θ (1 + θ²/5)`, and the middle leg is `g = 1.5 b² / sin θ`.
 * With these handles, the curvature rises monotonically from 0 to 1 for each turn up to `MAX_SPIRAL_TURN`.
 */
export function bezierSpiral(theta: number): { readonly c1: Point; readonly c2: Point; readonly to: Point } {
  const a = (2 / 3) * theta * (1 - (theta * theta) / 2);
  const b = (2 / 3) * theta * (1 + (theta * theta) / 5);
  const g = (1.5 * b * b) / Math.sin(theta);
  return { c1: { x: a, y: 0 }, c2: { x: a + g, y: 0 }, to: { x: a + g + b * Math.cos(theta), y: b * Math.sin(theta) } };
}

/** This function gives the shape of a corner of `smoothCurve` with the turn `turn` at the radius 1. */
export function smoothShape(turn: number, smoothing: number): SpiralShape {
  const theta = Math.min((Math.max(0, Math.min(1, smoothing)) * turn) / 2, MAX_SPIRAL_TURN);
  if (theta < 1e-9) return { tangent: Math.tan(turn / 2), theta: 0, pieces: () => [], end: { x: 0, y: 0 } };
  const spiral = bezierSpiral(theta);
  return { tangent: cornerTangent(turn, theta, spiral.to), theta, pieces: () => [spiral], end: spiral.to };
}

/**
 * This function rounds each inner vertex of a polyline with a cubic spiral, a circular arc and a second cubic spiral.
 * It is the shape of the corner smoothing of Figma (F7 of the note CURVES). The curvature rises from 0 on the leg to `1 / radius` on the arc,
 * so the curve is G2: it has no jump of the curvature. Each spiral turns by `smoothing` times half of the turn, up to `MAX_SPIRAL_TURN`.
 * The ends of each corner stay on the first half of each leg, so the ends of the polyline stay.
 * With `space`, the radius of a corner shrinks until its corner triangle overlaps no box that the polyline avoids.
 */
export function smoothCurve(points: readonly Point[], options: SmoothOptions = {}): CurveSegment[] {
  const smoothing = options.smoothing ?? 0.6;
  return spiralCorners(points, { radius: options.radius ?? 12, ...(options.space ? { space: options.space } : {}) }, (turn) => smoothShape(turn, smoothing));
}
