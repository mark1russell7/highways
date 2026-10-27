import type { Point } from "../../geom.ts";
import { cornerTangent, spiralCorners, type SpiralShape } from "../corner.ts";
import { fitPieces, type CubicPiece } from "../fit.ts";
import type { CurveSegment } from "../model.ts";
import { cubicAt } from "../sample.ts";
import type { CurveSpace } from "../space.ts";

/** The options of `clothoidCurve`. */
export interface ClothoidOptions {
  /** The radius of the arc in the middle of each corner: the smallest radius of the corner. The default is 12. */
  readonly radius?: number;
  /** The share of the turn of a corner in its two clothoids, from 0 (a circular arc) to 1 (no arc). The default is 0.5. */
  readonly spiral?: number;
  /** The largest distance from the cubic pieces to the true clothoid, in units of the plane. The default is 0.25. */
  readonly tolerance?: number;
  /** The boxes that the curve must not go through. Without it, each corner gets the largest radius that fits on its legs. */
  readonly space?: CurveSpace;
}

/** The largest number of cubic pieces of one clothoid. */
export const MAX_CLOTHOID_PIECES = 8;

/**
 * This function gives the point at the arc length `s` of the clothoid that starts at the origin along the x axis.
 * The tangent angle is `θ(s) = s² / (2 a2)`, so the curvature `s / a2` grows linearly with the length.
 * The Fresnel integrals give the point. Their power series converge fast for the turns of a corner.
 */
export function clothoidPoint(s: number, a2: number): Point {
  const theta = (s * s) / (2 * a2);
  const t2 = theta * theta;
  let x = 0;
  let y = 0;
  // The term of x is (-1)^n θ^(2n) / ((2n)! (4n + 1)). The term of y is (-1)^n θ^(2n+1) / ((2n+1)! (4n + 3)).
  let px = 1;
  let py = theta;
  for (let n = 0; n < 40; n++) {
    const tx = px / (4 * n + 1);
    const ty = py / (4 * n + 3);
    x += tx;
    y += ty;
    if (Math.abs(tx) < 1e-17 && Math.abs(ty) < 1e-17) break;
    px *= -t2 / ((2 * n + 1) * (2 * n + 2));
    py *= -t2 / ((2 * n + 2) * (2 * n + 3));
  }
  return { x: s * x, y: s * y };
}

/** The cubic pieces of one clothoid at the radius 1, and their largest distance to the clothoid. */
interface ClothoidFit {
  readonly pieces: readonly CubicPiece[];
  readonly error: number;
}

/** The fits of the clothoids of recent corners, by the turn and the spiral share. Each fit comes when a corner first needs it. The cache empties when it gets large. */
const fits = new Map<string, (n: number) => ClothoidFit>();

/** The number of points of the dense polyline that measures the error of a fit. */
const DENSE = 256;

/** This function gives the distance from the point `q` to the part of the polyline `p` from the index `from` to the index `to`. */
function distanceTo(q: Point, p: readonly Point[], from: number, to: number): number {
  let best = Infinity;
  for (let i = Math.max(1, from); i <= Math.min(p.length - 1, to); i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y));
  }
  return best;
}

/**
 * This function gives the fits of the clothoid that turns by `theta` and ends with the curvature 1, with 1 to `MAX_CLOTHOID_PIECES` pieces.
 * Each piece is G2 with its neighbours. The error of a fit is the largest distance from 16 samples of each piece to a dense polyline of the clothoid.
 * A sample looks only at the part of the polyline near its arc length. A smaller part gives a larger distance, so the error does not get smaller.
 */
function clothoidFits(theta: number): (n: number) => ClothoidFit {
  const length = 2 * theta;
  const a2 = length;
  const at = (t: number): { p: Point; d: Point; dd: Point } => {
    const s = t * length;
    const angle = (s * s) / (2 * a2);
    const k = s / a2;
    const d = { x: length * Math.cos(angle), y: length * Math.sin(angle) };
    return { p: clothoidPoint(s, a2), d, dd: { x: -d.y * length * k, y: d.x * length * k } };
  };
  const dense: Point[] = [];
  for (let i = 0; i <= DENSE; i++) dense.push(clothoidPoint((i / DENSE) * length, a2));
  const done: ClothoidFit[] = [];
  return (n) => {
    const known = done[n];
    if (known) return known;
    const pieces = fitPieces(at, n);
    const window = Math.ceil(DENSE / n / 2) + 8;
    let error = 0;
    let from: Point = { x: 0, y: 0 };
    pieces.forEach((q, k) => {
      for (let i = 1; i < 16; i++) {
        const mid = Math.round(((k + i / 16) / n) * DENSE);
        error = Math.max(error, distanceTo(cubicAt(from, q.c1, q.c2, q.to, i / 16), dense, mid - window, mid + window));
      }
      from = q.to;
    });
    const fit = { pieces, error };
    done[n] = fit;
    return fit;
  };
}

/** This function gives the shape of a corner of `clothoidCurve` with the turn `turn` at the radius 1. */
export function clothoidShape(turn: number, spiral: number, tolerance: number): SpiralShape {
  const theta = (Math.max(0, Math.min(1, spiral)) * turn) / 2;
  if (theta < 1e-9) return { tangent: Math.tan(turn / 2), theta: 0, pieces: () => [], end: { x: 0, y: 0 } };
  const key = `${turn}|${spiral}`;
  let all = fits.get(key);
  if (all === undefined) {
    if (fits.size >= 256) fits.clear();
    all = clothoidFits(theta);
    fits.set(key, all);
  }
  const fit = all;
  const end = clothoidPoint(2 * theta, 2 * theta);
  return {
    tangent: cornerTangent(turn, theta, end),
    theta,
    end,
    // The error of a fit scales with the radius. The corner takes the fewest pieces that keep the error within the tolerance.
    pieces: (radius) => {
      for (let n = 1; n < MAX_CLOTHOID_PIECES; n++) if (fit(n).error * radius <= tolerance) return fit(n).pieces;
      return fit(MAX_CLOTHOID_PIECES).pieces;
    },
  };
}

/**
 * This function rounds each inner vertex of a polyline with a clothoid, a circular arc and a second clothoid (F6 of the note CURVES).
 * The curvature of a clothoid grows linearly with its length, from 0 on the leg to `1 / radius` on the arc. This is the transition curve of roads and railways.
 * Each clothoid turns by `spiral` times half of the turn. G2 cubic pieces draw it within `tolerance` of the true clothoid.
 *
 * The ends of each corner stay on the first half of each leg, so the ends of the polyline stay.
 * With `space`, the radius of a corner shrinks until its corner triangle overlaps no box that the polyline avoids.
 */
export function clothoidCurve(points: readonly Point[], options: ClothoidOptions = {}): CurveSegment[] {
  const spiral = options.spiral ?? 0.5;
  const tolerance = Math.max(1e-3, options.tolerance ?? 0.25);
  return spiralCorners(points, { radius: options.radius ?? 12, ...(options.space ? { space: options.space } : {}) }, (turn) => clothoidShape(turn, spiral, tolerance));
}
