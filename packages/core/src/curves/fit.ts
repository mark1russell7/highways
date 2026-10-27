import type { Point } from "../geom.ts";

/** One end of a piece of a smooth curve: the point, the unit tangent and the signed curvature. */
export interface CurveEnd {
  readonly p: Point;
  readonly t: Point;
  readonly k: number;
}

/** The control points of a cubic Bezier piece after its start point. */
export interface CubicPiece {
  readonly c1: Point;
  readonly c2: Point;
  readonly to: Point;
}

const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;

/**
 * This function fits one cubic Bezier piece to two ends of a curve with G2 Hermite data.
 * The piece starts at `a.p` along `a.t` with the curvature `a.k`, and it ends at `b.p` along `b.t` with the curvature `b.k`.
 *
 * The handles have the lengths `h0` and `h1`. The curvature at the start is `(2/3) (cross(t0, D) - h1 cross(t0, t1)) / h0^2`,
 * and at the end `(2/3) (cross(D, t1) - h0 cross(t0, t1)) / h1^2`, with `D = b.p - a.p`.
 * Newton steps solve these two equations, from the handles `guess`.
 * The function gives `undefined` when the steps do not converge to two positive handles. The caller then uses the C1 handles.
 */
export function fitG2(a: CurveEnd, b: CurveEnd, guess: readonly [number, number]): CubicPiece | undefined {
  const D = { x: b.p.x - a.p.x, y: b.p.y - a.p.y };
  const s = cross(a.t, b.t);
  const c0 = cross(a.t, D);
  const c1 = cross(D, b.t);
  let [h0, h1] = guess;
  const scale = Math.max(1e-12, Math.hypot(D.x, D.y));
  for (let i = 0; i < 30; i++) {
    const f1 = a.k * h0 * h0 - (2 / 3) * (c0 - h1 * s);
    const f2 = b.k * h1 * h1 - (2 / 3) * (c1 - h0 * s);
    if (Math.abs(f1) < 1e-13 * scale && Math.abs(f2) < 1e-13 * scale) break;
    // The Jacobian of (f1, f2) by (h0, h1).
    const j11 = 2 * a.k * h0;
    const j12 = (2 / 3) * s;
    const j21 = (2 / 3) * s;
    const j22 = 2 * b.k * h1;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-18) return undefined;
    h0 -= (f1 * j22 - f2 * j12) / det;
    h1 -= (j11 * f2 - j21 * f1) / det;
    if (!Number.isFinite(h0) || !Number.isFinite(h1)) return undefined;
  }
  const f1 = a.k * h0 * h0 - (2 / 3) * (c0 - h1 * s);
  const f2 = b.k * h1 * h1 - (2 / 3) * (c1 - h0 * s);
  if (!(h0 > 0 && h1 > 0) || Math.abs(f1) > 1e-9 * scale || Math.abs(f2) > 1e-9 * scale) return undefined;
  // A handle longer than the chord gives a loop or a bulge. The C1 handles are better then.
  if (h0 > 1.5 * scale || h1 > 1.5 * scale) return undefined;
  return { c1: { x: a.p.x + a.t.x * h0, y: a.p.y + a.t.y * h0 }, c2: { x: b.p.x - b.t.x * h1, y: b.p.y - b.t.y * h1 }, to: b.p };
}

/**
 * This function gives `n` cubic Bezier pieces of a smooth curve `at(t)`, with `t` from 0 to 1. The pieces have equal steps of `t`.
 * The function `at` gives the point, the first derivative and the second derivative.
 * Each piece is G2 with its neighbours where `fitG2` finds handles. Elsewhere it has the C1 handles of the derivatives.
 */
export function fitPieces(at: (t: number) => { p: Point; d: Point; dd: Point }, n: number): CubicPiece[] {
  const end = (t: number): CurveEnd & { speed: number } => {
    const { p, d, dd } = at(t);
    const speed = Math.hypot(d.x, d.y);
    return { p, t: { x: d.x / speed, y: d.y / speed }, k: cross(d, dd) / speed ** 3, speed };
  };
  const out: CubicPiece[] = [];
  let a = end(0);
  for (let i = 1; i <= n; i++) {
    const b = end(i / n);
    const h0 = a.speed / (3 * n);
    const h1 = b.speed / (3 * n);
    out.push(fitG2(a, b, [h0, h1]) ?? { c1: { x: a.p.x + a.t.x * h0, y: a.p.y + a.t.y * h0 }, c2: { x: b.p.x - b.t.x * h1, y: b.p.y - b.t.y * h1 }, to: b.p });
    a = b;
  }
  return out;
}
