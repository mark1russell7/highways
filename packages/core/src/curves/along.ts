import type { Point } from "../geom.ts";
import type { CurveSegment } from "./model.ts";
import { cubicAt } from "./sample.ts";

/** The point at a place along a line, and the direction of the line at that point. */
export interface PointAlong {
  readonly point: Point;
  /** The unit vector of the direction of travel at the point. A line of length 0 gives the vector (0, 0). */
  readonly tangent: Point;
}

/** The largest number of steps of one cubic segment for its length. */
const MAX_STEPS = 1024;

/** One piece of a line with a known length. A cubic piece is a step of the parameter of its segment. */
type Piece =
  | { readonly kind: "line"; readonly from: Point; readonly to: Point; readonly length: number }
  | { readonly kind: "arc"; readonly center: Point; readonly radius: number; readonly start: number; readonly sweep: number; readonly length: number }
  | { readonly kind: "cubic"; readonly p: readonly [Point, Point, Point, Point]; readonly t0: number; readonly t1: number; readonly from: Point; readonly to: Point; readonly length: number };

const len = (a: Point, b: Point): number => Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);

/** This function gives the derivative of a cubic Bezier curve at the parameter `t`, divided by 3. */
function slope(p: readonly [Point, Point, Point, Point], t: number): Point {
  const [p0, p1, p2, p3] = p;
  const w = 1 - t;
  return {
    x: w * w * (p1.x - p0.x) + 2 * w * t * (p2.x - p1.x) + t * t * (p3.x - p2.x),
    y: w * w * (p1.y - p0.y) + 2 * w * t * (p2.y - p1.y) + t * t * (p3.y - p2.y),
  };
}

/** The nodes and the weights of the Gauss-Legendre rule of 5 points on the range from -1 to 1. */
const GAUSS: readonly (readonly [number, number])[] = [
  [0, 128 / 225],
  [-Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3, (322 + 13 * Math.sqrt(70)) / 900],
  [Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3, (322 + 13 * Math.sqrt(70)) / 900],
  [-Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3, (322 - 13 * Math.sqrt(70)) / 900],
  [Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3, (322 - 13 * Math.sqrt(70)) / 900],
];

/** This function gives the length of a cubic Bezier curve from the parameter `a` to the parameter `b`, by the Gauss-Legendre rule. */
function cubicLength(p: readonly [Point, Point, Point, Point], a: number, b: number): number {
  const half = (b - a) / 2;
  const mid = (a + b) / 2;
  let sum = 0;
  for (const [x, w] of GAUSS) {
    const d = slope(p, mid + half * x);
    sum += w * Math.sqrt(d.x * d.x + d.y * d.y);
  }
  return 3 * half * sum;
}

/** This function gives the pieces of a polyline or of the segments of a curve, in order. */
function piecesOf(line: readonly Point[] | readonly CurveSegment[], tolerance: number): { readonly first: Point; readonly pieces: Piece[] } {
  const pieces: Piece[] = [];
  const isCurve = (l: readonly Point[] | readonly CurveSegment[]): l is readonly CurveSegment[] => "kind" in l[0]!;
  if (!isCurve(line)) {
    for (let i = 1; i < line.length; i++) pieces.push({ kind: "line", from: line[i - 1]!, to: line[i]!, length: len(line[i - 1]!, line[i]!) });
    return { first: line[0]!, pieces };
  }
  let at: Point | undefined;
  let first: Point | undefined;
  for (const s of line) {
    if (s.kind === "move" || at === undefined) {
      first ??= s.to;
      at = s.to;
      continue;
    }
    if (s.kind === "line") pieces.push({ kind: "line", from: at, to: s.to, length: len(at, s.to) });
    else if (s.kind === "arc") pieces.push({ kind: "arc", center: s.center, radius: s.radius, start: s.start, sweep: s.sweep, length: s.radius * Math.abs(s.sweep) });
    else {
      // The steps are those of `sampleCurve`: the chord of a step of 1/n of the parameter is within 3·D/(4·n²) of the curve.
      // D is the largest second difference. The length of each step comes from the Gauss-Legendre rule, not from the chord.
      const p = [at, s.c1, s.c2, s.to] as const;
      const d = Math.max(len({ x: 0, y: 0 }, { x: at.x - 2 * s.c1.x + s.c2.x, y: at.y - 2 * s.c1.y + s.c2.y }), len({ x: 0, y: 0 }, { x: s.c1.x - 2 * s.c2.x + s.to.x, y: s.c1.y - 2 * s.c2.y + s.to.y }));
      const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.sqrt((3 * d) / (4 * tolerance)))));
      let prev = at;
      for (let k = 1; k <= n; k++) {
        const next = k === n ? s.to : cubicAt(at, s.c1, s.c2, s.to, k / n);
        pieces.push({ kind: "cubic", p, t0: (k - 1) / n, t1: k / n, from: prev, to: next, length: cubicLength(p, (k - 1) / n, k / n) });
        prev = next;
      }
    }
    at = s.to;
  }
  return { first: first!, pieces };
}

/** This function gives the unit vector of `v`, or (0, 0) for a vector of length 0. */
function unit(v: Point): Point {
  const l = Math.sqrt(v.x * v.x + v.y * v.y);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

/** This function gives the point and the tangent at the share `u` (from 0 to 1) of the length of one piece. */
function onPiece(piece: Piece, u: number): PointAlong {
  if (piece.kind === "line") {
    const { from: a, to: b } = piece;
    return { point: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, tangent: unit({ x: b.x - a.x, y: b.y - a.y }) };
  }
  if (piece.kind === "arc") {
    const a = piece.start + piece.sweep * u;
    const s = Math.sign(piece.sweep);
    // The cosine and the sine give only the drawn point and the tangent. No choice of the router reads them.
    const [cos, sin] = [Math.cos(a), Math.sin(a)];
    return { point: { x: piece.center.x + piece.radius * cos, y: piece.center.y + piece.radius * sin }, tangent: { x: -sin * s, y: cos * s } };
  }
  const [p0, p1, p2, p3] = piece.p;
  // The parameter at the length u × length from the start of the step, by bisection. The length grows with the parameter.
  let [lo, hi] = [piece.t0, piece.t1];
  const goal = u * piece.length;
  if (u >= 1) lo = hi;
  else if (u > 0) for (let i = 0; i < 60 && hi - lo > 1e-15; i++) {
    const m = (lo + hi) / 2;
    if (cubicLength(piece.p, piece.t0, m) < goal) lo = m;
    else hi = m;
  }
  const t = u >= 1 ? piece.t1 : lo;
  const d = slope(piece.p, t);
  // A control point on an end gives a derivative of 0 at that end. Then the chord of the step gives the direction.
  const tangent = d.x * d.x + d.y * d.y > (1e-12 * (1 + piece.length)) ** 2 ? unit(d) : unit({ x: piece.to.x - piece.from.x, y: piece.to.y - piece.from.y });
  return { point: t === 1 ? p3 : t === 0 ? p0 : cubicAt(p0, p1, p2, p3, t), tangent };
}

/**
 * This function gives the point at the share `t` of the length of a line, and the direction of the line at that point.
 * The line is a polyline or the segments of a curve (`curveOf`). A share out of the range from 0 to 1 gives the nearest end.
 *
 * The lengths of lines and arcs are exact. A cubic segment has the steps of `sampleCurve` with `tolerance`.
 * The Gauss-Legendre rule of 5 points gives the length of each step, and a bisection gives the parameter at a length.
 *
 * The point of a cubic segment is on the curve. At a corner, the tangent is the direction of the leg after the corner. At the end, it is the direction of the last leg.
 * A renderer uses this function to put a label or an arrow at a place along a route, for example `t = 0.5` for the middle.
 */
export function pointAtFraction(line: readonly Point[] | readonly CurveSegment[], t: number, tolerance = 0.5): PointAlong {
  if (line.length === 0) throw new Error("The line has no point.");
  const { first, pieces } = piecesOf(line, Math.max(1e-6, tolerance));
  const real = pieces.filter((p) => p.length > 0);
  if (real.length === 0) return { point: first, tangent: { x: 0, y: 0 } };
  const total = real.reduce((sum, p) => sum + p.length, 0);
  let left = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < real.length - 1; i++) {
    const piece = real[i]!;
    if (left < piece.length) return onPiece(piece, left / piece.length);
    left -= piece.length;
  }
  const last = real[real.length - 1]!;
  return onPiece(last, Math.min(1, left / last.length));
}
