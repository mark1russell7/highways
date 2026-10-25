import { dist, type Point } from "./geom.ts";

/** The options of the inflection rule. */
export interface InflectionOptions {
  /** The half width of the axis and diagonal bands, in radians. The default is 7°. */
  readonly tol?: number;
  /** The number of segments of the curve. The default is 24. */
  readonly samples?: number;
  /** The largest angle between the tangent and the chord, in radians. The default is 1.35 (approximately 77°). */
  readonly maxAngle?: number;
}

/**
 * This function gives the number of inflections that the rule asks for a chord at the angle `angle` (radians).
 * It gives 0 near an axis, 1 near a diagonal and 2 between them. The bands are `tol` wide on each side.
 */
export function inflectionSector(angle: number, tol: number = (7 * Math.PI) / 180): 0 | 1 | 2 {
  const q = Math.PI / 2;
  const mod = ((angle % q) + q) % q;
  if (mod < tol || q - mod < tol) return 0;
  if (Math.abs(mod - q / 2) < tol) return 1;
  return 2;
}

/**
 * This function draws the curve of the inflection rule from the plug `p0` to `target`.
 * The curve leaves `p0` along `normal`. In the frame of the chord, its side offset f has f(0) = f(L) = 0 and f'(0) = tan θ.
 * Here θ is the angle from the chord to the normal. A polynomial of degree 2, 3 or 4 gives 0, 1 or 2 inflections,
 * at 1/2, or at 1/3 and 2/3, of the chord.
 */
export function inflectionCurve(p0: Point, normal: Point, target: Point, options: InflectionOptions = {}): Point[] {
  const L = dist(p0, target);
  if (L === 0) return [p0, target];
  const ux = (target.x - p0.x) / L;
  const uy = (target.y - p0.y) / L;
  const k = inflectionSector(Math.atan2(uy, ux), options.tol);
  const maxAngle = options.maxAngle ?? 1.35;
  const th = -Math.atan2(normal.x * uy - normal.y * ux, normal.x * ux + normal.y * uy);
  const d = Math.tan(Math.max(-maxAngle, Math.min(maxAngle, th)));
  const f =
    k === 0
      ? (s: number): number => (-d / L) * s * s + d * s
      : k === 1
        ? (s: number): number => ((12 * d) / (L * L)) * (s ** 3 / 6 - (L * s * s) / 4) + d * s
        : (s: number): number => ((-36 * d) / L ** 3) * (s ** 4 / 12 - (L * s ** 3) / 6 + (L * L * s * s) / 9) + d * s;
  const n = Math.max(2, options.samples ?? 24);
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    if (i === n) {
      out.push(target);
      break;
    }
    const s = (L * i) / n;
    const o = f(s);
    out.push({ x: p0.x + ux * s - uy * o, y: p0.y + uy * s + ux * o });
  }
  out[0] = p0;
  return out;
}

/**
 * This function rounds each inner vertex of a polyline with a quadratic Bézier curve.
 * The curve starts and ends at most `radius` from the vertex, and at most half of each segment. The ends of the polyline stay.
 */
export function roundCorners(p: readonly Point[], radius: number, steps = 4): Point[] {
  if (p.length < 3 || radius <= 0) return [...p];
  const out: Point[] = [p[0]!];
  for (let i = 1; i + 1 < p.length; i++) {
    const a = p[i - 1]!;
    const v = p[i]!;
    const b = p[i + 1]!;
    const la = dist(a, v);
    const lb = dist(v, b);
    const r = Math.min(radius, la / 2, lb / 2);
    if (r <= 0) {
      out.push(v);
      continue;
    }
    const p1 = { x: v.x + ((a.x - v.x) * r) / la, y: v.y + ((a.y - v.y) * r) / la };
    const p2 = { x: v.x + ((b.x - v.x) * r) / lb, y: v.y + ((b.y - v.y) * r) / lb };
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({ x: u * u * p1.x + 2 * u * t * v.x + t * t * p2.x, y: u * u * p1.y + 2 * u * t * v.y + t * t * p2.y });
    }
  }
  out.push(p[p.length - 1]!);
  return out;
}
