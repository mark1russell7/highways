/**
 * The curve `elastic` (D23-PHYSICAL): an elastic band (Quinlan and Khatib, 1993) on the polyline of a route.
 * Springs between samples of the route pull it taut, and the boxes near the route push it away.
 * The curve keeps its ends and a lead along each plug normal. It goes through no box that the polyline avoids.
 */
import { dist, polylineLength, type Box, type Point } from "../../geom.ts";
import { distinctPoints, type CurveSegment } from "../model.ts";
import { sampleCurve } from "../sample.ts";
import type { CurveSpace } from "../space.ts";
import { splineCurve } from "../spline/index.ts";

/** The options of `elasticCurve`. */
export interface ElasticOptions {
  /** The distance between two samples of the band. The default is 8. */
  readonly step?: number;
  /** The number of steps of the relaxation. 0 keeps the polyline. The default is 40. */
  readonly rounds?: number;
  /** The distance from a box at which the push of the box starts. 0 gives a band with springs only. The default is 12. */
  readonly clearance?: number;
  /** The length of the lead at each end, where the band stays on the polyline. The default is 12. */
  readonly lead?: number;
  /** The outward normal of the plug at the first point. With it, the spline through the band leaves along this normal. */
  readonly startNormal?: Point;
  /** The outward normal of the plug at the last point. With it, the spline through the band comes in against this normal. */
  readonly endNormal?: Point;
  /** The boxes that push the band away, and that the curve must not go through. */
  readonly space?: CurveSpace;
}

/** The defaults of `elasticCurve`. */
export const ELASTIC_DEFAULTS = Object.freeze({ step: 8, rounds: 40, clearance: 12, lead: 12 });

/** The weight of the springs in each step. A Jacobi step of the springs is stable below 0.5. */
const PULL = 0.25;
/** The weight of the push of the boxes in each step. */
const PUSH = 0.5;
/** The weights of the band that the function tries when the full band goes through a box. The last weight 0 gives the polyline. */
const BLENDS = [1, 0.5, 0.25, 0.125, 0];

/** This function gives the point at the distance `s` along the polyline `p`, with the lengths `len` of its legs. */
function pointAt(p: readonly Point[], len: readonly number[], s: number): Point {
  let rest = Math.max(0, s);
  for (let i = 0; i < len.length; i++) {
    const l = len[i]!;
    if (rest <= l || i === len.length - 1) {
      const t = l === 0 ? 0 : Math.min(1, rest / l);
      return { x: p[i]!.x + (p[i + 1]!.x - p[i]!.x) * t, y: p[i]!.y + (p[i + 1]!.y - p[i]!.y) * t };
    }
    rest -= l;
  }
  return p[p.length - 1]!;
}

/**
 * This function gives the samples of a polyline from the distance `from` to the distance `to`, at most `step` apart.
 * The samples include the corners of the polyline.
 * The corners stay samples, so the band starts on the polyline itself.
 */
function samples(p: readonly Point[], len: readonly number[], from: number, to: number, step: number): Point[] {
  const at = new Set<number>([from, to]);
  let s = 0;
  for (const l of len) {
    s += l;
    if (s > from && s < to) at.add(s);
  }
  const marks = [...at].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const a = marks[i]!;
    const b = marks[i + 1]!;
    const k = Math.max(1, Math.ceil((b - a) / step));
    for (let j = 0; j < k; j++) out.push(a + ((b - a) * j) / k);
  }
  out.push(to);
  return out.map((v) => pointAt(p, len, v));
}

/** This function gives the push of the boxes on the point `q`: for each box nearer than `clearance`, `clearance - d` away from its nearest point. */
function push(q: Point, boxes: readonly Box[], clearance: number): Point {
  let fx = 0;
  let fy = 0;
  for (const b of boxes) {
    const nx = Math.max(b.x, Math.min(b.x + b.w, q.x));
    const ny = Math.max(b.y, Math.min(b.y + b.h, q.y));
    const d = Math.hypot(q.x - nx, q.y - ny);
    if (d === 0 || d >= clearance) continue;
    fx += ((q.x - nx) / d) * (clearance - d);
    fy += ((q.y - ny) / d) * (clearance - d);
  }
  return { x: fx, y: fy };
}

/**
 * This function relaxes the inner samples of a band. Sample 0 and the last sample do not move.
 * Each step moves a sample by `PULL` times the spring force to its two neighbors, and `PUSH` times the push of the boxes.
 */
export function relaxBand(band: readonly Point[], boxes: readonly Box[], rounds: number, clearance: number): Point[] {
  let x = band.map((q) => ({ x: q.x, y: q.y }));
  for (let r = 0; r < rounds; r++) {
    x = x.map((q, i) => {
      if (i === 0 || i === x.length - 1) return q;
      const a = x[i - 1]!;
      const b = x[i + 1]!;
      const f = clearance > 0 ? push(q, boxes, clearance) : { x: 0, y: 0 };
      return { x: q.x + PULL * (a.x + b.x - 2 * q.x) + PUSH * f.x, y: q.y + PULL * (a.y + b.y - 2 * q.y) + PUSH * f.y };
    });
  }
  return x;
}

/**
 * This function draws the curve `elastic`. The samples of the polyline between its two leads relax as an elastic band.
 * Then a centripetal spline goes through the band.
 * With `space`, the boxes near the band push it away. If the spline goes through a box that the polyline avoids, the band moves back toward the polyline.
 * When no weight of the band is clear, the result is the polyline as it is.
 */
export function elasticCurve(points: readonly Point[], options: ElasticOptions = {}): CurveSegment[] {
  const p = distinctPoints(points);
  const straight = (): CurveSegment[] => p.map((to, i): CurveSegment => (i === 0 ? { kind: "move", to } : { kind: "line", to }));
  if (p.length < 3) return straight();
  const step = Math.max(1, options.step ?? ELASTIC_DEFAULTS.step);
  const rounds = Math.max(0, Math.floor(options.rounds ?? ELASTIC_DEFAULTS.rounds));
  const clearance = Math.max(0, options.clearance ?? ELASTIC_DEFAULTS.clearance);
  const len = p.slice(1).map((q, i) => dist(p[i]!, q));
  const total = polylineLength(p);
  const lead = Math.min(Math.max(0, options.lead ?? ELASTIC_DEFAULTS.lead), len[0]!, len[len.length - 1]!, total / 4);
  if (rounds === 0 || total - 2 * lead <= step) return straight();
  const band = samples(p, len, lead, total - lead, step);
  const lo = { x: Math.min(...band.map((q) => q.x)) - clearance, y: Math.min(...band.map((q) => q.y)) - clearance };
  const hi = { x: Math.max(...band.map((q) => q.x)) + clearance, y: Math.max(...band.map((q) => q.y)) + clearance };
  const boxes = (options.space?.boxes ?? []).filter((b) => b.x <= hi.x && b.x + b.w >= lo.x && b.y <= hi.y && b.y + b.h >= lo.y);
  const relaxed = relaxBand(band, boxes, rounds, clearance);
  const context = {
    ...(options.startNormal ? { startNormal: options.startNormal } : {}),
    ...(options.endNormal ? { endNormal: options.endNormal } : {}),
  };
  for (const w of BLENDS) {
    if (w === 0) break;
    const mid = band.map((q, i) => ({ x: q.x + (relaxed[i]!.x - q.x) * w, y: q.y + (relaxed[i]!.y - q.y) * w }));
    const curve = splineCurve([p[0]!, ...mid, p[p.length - 1]!], context);
    if (!options.space || !options.space.addsHit(sampleCurve(curve, options.space.tolerance), p)) return curve;
  }
  return straight();
}
