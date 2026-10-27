import { dist, type Point } from "../geom.ts";
import type { CubicPiece } from "./fit.ts";
import { distinctPoints, type CurveSegment } from "./model.ts";
import { fitCorner, type CurveSpace } from "./space.ts";

/**
 * The shape of a symmetric corner with a spiral, an arc and a second spiral, at the smallest radius 1.
 * The local frame of the first spiral starts at the tangent point on the leg in. Its x axis goes along the leg, and its y axis goes to the side of the turn.
 */
export interface SpiralShape {
  /** The tangent length of the corner at the radius 1: the distance from the vertex to each end of the corner. */
  readonly tangent: number;
  /** The turn of each spiral, in radians. The arc turns by the rest of the corner. */
  readonly theta: number;
  /** The cubic pieces of the first spiral at the radius 1, from the origin of the local frame to the start of the arc. */
  readonly pieces: (radius: number) => readonly CubicPiece[];
  /** The end of the first spiral at the radius 1: the start of the arc. */
  readonly end: Point;
}

/** A turn smaller than this angle, in radians, is no corner. A turn nearer to a half turn than this angle stays sharp. */
const FLAT = 1e-6;

/** The options of `spiralCorners`. */
export interface SpiralCornerOptions {
  /** The largest smallest radius of a corner. */
  readonly radius: number;
  /** The boxes that the curve must not go through. Without it, each corner gets the largest radius that fits on its legs. */
  readonly space?: CurveSpace;
}

/**
 * This function puts a symmetric corner at each inner vertex of a polyline: a spiral, an arc and a second spiral.
 * The function `shapeOf` gives the shape of a corner from its turn, at the radius 1. A larger radius scales the shape.
 * The ends of each corner stay on the first half of each leg, so the ends of the polyline stay.
 * With `space`, the radius of a corner shrinks until its corner triangle overlaps no box that the polyline avoids.
 */
export function spiralCorners(points: readonly Point[], options: SpiralCornerOptions, shapeOf: (turn: number) => SpiralShape): CurveSegment[] {
  const p = distinctPoints(points);
  if (p.length === 0) return [];
  const out: CurveSegment[] = [{ kind: "move", to: p[0]! }];
  for (let i = 1; i + 1 < p.length; i++) {
    const a = p[i - 1]!;
    const v = p[i]!;
    const b = p[i + 1]!;
    const la = dist(a, v);
    const lb = dist(v, b);
    const u = { x: (v.x - a.x) / la, y: (v.y - a.y) / la };
    const w = { x: (b.x - v.x) / lb, y: (b.y - v.y) / lb };
    const turn = Math.atan2(u.x * w.y - u.y * w.x, u.x * w.x + u.y * w.y);
    if (Math.abs(turn) < FLAT || Math.PI - Math.abs(turn) < FLAT) {
      out.push({ kind: "line", to: v });
      continue;
    }
    const shape = shapeOf(Math.abs(turn));
    const side = Math.sign(turn);
    const ends = (r: number): [Point, Point] => [
      { x: v.x - u.x * r * shape.tangent, y: v.y - u.y * r * shape.tangent },
      { x: v.x + w.x * r * shape.tangent, y: v.y + w.y * r * shape.tangent },
    ];
    const piece = (r: number): CurveSegment[] => cornerSegments(shape, r, ends(r), u, w, side, Math.abs(turn));
    const r = fitCorner(
      options.space,
      Math.min(Math.max(0, options.radius), Math.min(la, lb) / (2 * shape.tangent)),
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

/**
 * This function gives the segments of one corner at the radius `r`, from the tangent point `p1` to the tangent point `p2`.
 * The first spiral is in the frame of the leg in. The second spiral is the mirror image of the first, in the frame of the leg out, in the reverse order.
 */
function cornerSegments(shape: SpiralShape, r: number, [p1, p2]: [Point, Point], u: Point, w: Point, side: number, turn: number): CurveSegment[] {
  // The y axis of each frame goes to the side of the turn: the left normal of the leg, times the sign of the turn.
  const n1 = { x: -u.y * side, y: u.x * side };
  const n2 = { x: -w.y * side, y: w.x * side };
  const map1 = (q: Point): Point => ({ x: p1.x + (u.x * q.x + n1.x * q.y) * r, y: p1.y + (u.y * q.x + n1.y * q.y) * r });
  const map2 = (q: Point): Point => ({ x: p2.x + (-w.x * q.x + n2.x * q.y) * r, y: p2.y + (-w.y * q.x + n2.y * q.y) * r });
  const out: CurveSegment[] = [];
  const pieces = shape.theta > 0 ? shape.pieces(r) : [];
  for (const q of pieces) out.push({ kind: "cubic", c1: map1(q.c1), c2: map1(q.c2), to: map1(q.to) });
  const sweep = turn - 2 * shape.theta;
  if (sweep > 1e-9) {
    const from = map1(shape.end);
    // The center of the arc is at the distance r from the end of the spiral, to the side of the turn.
    const center = map1({ x: shape.end.x - Math.sin(shape.theta), y: shape.end.y + Math.cos(shape.theta) });
    out.push({ kind: "arc", center, radius: r, start: Math.atan2(from.y - center.y, from.x - center.x), sweep: side * sweep, to: map2(shape.end) });
  }
  for (let k = pieces.length - 1; k >= 0; k--) {
    const q = pieces[k]!;
    const start = k === 0 ? { x: 0, y: 0 } : pieces[k - 1]!.to;
    out.push({ kind: "cubic", c1: map2(q.c2), c2: map2(q.c1), to: k === 0 ? p2 : map2(start) });
  }
  return out;
}

/**
 * This function gives the tangent length of a symmetric corner at the radius 1. The spiral of the corner turns by `theta` and ends at `end`.
 * The center of the arc is on the bisector of the corner: `T = k + (1 + p) tan(turn / 2)`, with the shift `p` and the offset `k` of the arc.
 */
export function cornerTangent(turn: number, theta: number, end: Point): number {
  const k = end.x - Math.sin(theta);
  const p = end.y - (1 - Math.cos(theta));
  return k + (1 + p) * Math.tan(turn / 2);
}
