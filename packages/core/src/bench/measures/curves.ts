import type { CurveSegment } from "../../curves/model.ts";
import type { CurveSpace } from "../../curves/space.ts";
import { dist, polylineLength, segmentsCross, turns, type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";
import { TOLERANCE } from "../properties.ts";

const EPS = 1e-9;
const DEG = 180 / Math.PI;

/** A joint of a curve: the end of one drawn segment and the start of the next drawn segment. */
export interface CurveJoint {
  readonly at: Point;
  /** The angle between the tangent at the end of the first segment and the tangent at the start of the second segment, in degrees. */
  readonly angle: number;
  /** The jump of the curvature at the joint, `abs(κ^- - κ^+)`, in 1 / units. */
  readonly jump: number;
  /** The unit tangent at the end of the first segment. */
  readonly before: Point;
  /** The unit tangent at the start of the second segment. */
  readonly after: Point;
}

const unit = (x: number, y: number): Point | undefined => {
  const l = Math.hypot(x, y);
  return l > EPS ? { x: x / l, y: y / l } : undefined;
};

/** This function gives the unit tangent and the curvature at the start (`t = 0`) or at the end (`t = 1`) of a segment that starts at `from`. */
function frame(from: Point, s: CurveSegment, t: 0 | 1): { tangent: Point | undefined; curvature: number } {
  if (s.kind === "line" || s.kind === "move") return { tangent: unit(s.to.x - from.x, s.to.y - from.y), curvature: 0 };
  if (s.kind === "arc") {
    const a = t === 0 ? s.start : s.start + s.sweep;
    const sign = Math.sign(s.sweep) || 1;
    return { tangent: { x: -Math.sin(a) * sign, y: Math.cos(a) * sign }, curvature: s.radius > EPS ? sign / s.radius : 0 };
  }
  // A cubic curve: B'(0) = 3 (c1 - p0), B''(0) = 6 (p0 - 2 c1 + c2), B'(1) = 3 (p3 - c2), B''(1) = 6 (c1 - 2 c2 + p3).
  const [p0, p1, p2, p3] = [from, s.c1, s.c2, s.to];
  const d = t === 0 ? { x: 3 * (p1.x - p0.x), y: 3 * (p1.y - p0.y) } : { x: 3 * (p3.x - p2.x), y: 3 * (p3.y - p2.y) };
  const dd = t === 0 ? { x: 6 * (p0.x - 2 * p1.x + p2.x), y: 6 * (p0.y - 2 * p1.y + p2.y) } : { x: 6 * (p1.x - 2 * p2.x + p3.x), y: 6 * (p1.y - 2 * p2.y + p3.y) };
  const speed = Math.hypot(d.x, d.y);
  if (speed > EPS) return { tangent: { x: d.x / speed, y: d.y / speed }, curvature: (d.x * dd.y - d.y * dd.x) / speed ** 3 };
  // A handle of length 0: the tangent comes from the next control point that differs.
  const fallback = t === 0 ? (unit(p2.x - p0.x, p2.y - p0.y) ?? unit(p3.x - p0.x, p3.y - p0.y)) : (unit(p3.x - p1.x, p3.y - p1.y) ?? unit(p3.x - p0.x, p3.y - p0.y));
  return { tangent: fallback, curvature: 0 };
}

const angleOf = (u: Point, v: Point): number => Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * DEG;

/**
 * This function gives the joints of a curve: each point where one drawn segment ends and the next one starts.
 * A segment of length 0 has no tangent, so the joint skips it. The analytic tangents and curvatures of lines, cubic curves and arcs give the values.
 */
export function curveJoints(segments: readonly CurveSegment[]): CurveJoint[] {
  const out: CurveJoint[] = [];
  let at: Point | undefined;
  let last: { tangent: Point; curvature: number } | undefined;
  for (const s of segments) {
    if (s.kind === "move" || at === undefined) {
      at = s.to;
      last = undefined;
      continue;
    }
    const start = frame(at, s, 0);
    const end = frame(at, s, 1);
    if (start.tangent && end.tangent) {
      if (last) out.push({ at, angle: angleOf(last.tangent, start.tangent), jump: Math.abs(last.curvature - start.curvature), before: last.tangent, after: start.tangent });
      last = { tangent: end.tangent, curvature: end.curvature };
    }
    at = s.to;
  }
  return out;
}

/**
 * This function gives the G1 defect of a curve (C1 of MEAS0): `g1 = max_j angle(T_j^-, T_j^+)` over the joints, in degrees.
 * Lower is better. A curve is G1 when `g1` is 0.5 degrees or less. The cost is linear.
 */
export function g1Defect(segments: readonly CurveSegment[]): number {
  return curveJoints(segments).reduce((m, j) => Math.max(m, j.angle), 0);
}

/**
 * This function gives the G2 defect of a curve (C2 of MEAS0): `g2 = max_j abs(κ_j^- - κ_j^+) · u` over the joints.
 * The value has no unit, and lower is better. `u` is the unit of the board (`boardUnit`). The cost is linear.
 */
export function g2Defect(segments: readonly CurveSegment[], u: number): number {
  return curveJoints(segments).reduce((m, j) => Math.max(m, j.jump * u), 0);
}

/**
 * This function gives the bending energy of a sampled curve (C3 of MEAS0): `E = L · ∫ κ(s)^2 ds`.
 * At each inner sample, `κ = φ / l`, so `E = L · Σ φ_i^2 / l_i`. The length `l_i` is the mean of the two legs, with a limit of `8τ / φ_i`.
 * Thus a sharp corner counts as an arc with a sagitta of `τ`, the tolerance of the samples.
 *
 * The value has no unit, and lower is better. A full circle gives `4π^2`. The cost is linear.
 */
export function bendingEnergy(points: readonly Point[], tolerance = 0.25): number {
  const q: Point[] = [];
  for (const v of points) if (q.length === 0 || dist(q[q.length - 1]!, v) > EPS) q.push(v);
  if (q.length < 3) return 0;
  const phi = turns(q);
  let sum = 0;
  for (let i = 1; i + 1 < q.length; i++) {
    const t = Math.abs(phi[i - 1]!);
    if (t < EPS) continue;
    const l = Math.min((dist(q[i - 1]!, q[i]!) + dist(q[i]!, q[i + 1]!)) / 2, (8 * tolerance) / t);
    sum += (t * t) / l;
  }
  return polylineLength(q) * sum;
}

/** This function tells if a polyline crosses itself. Two legs next to each other do not count. The cost is `n log n`. */
export function crossesItself(p: readonly Point[]): boolean {
  if (p.length < 4) return false;
  const len = polylineLength(p) / (p.length - 1);
  const grid = new Grid<number>(Math.max(1, len * 4));
  for (let i = 1; i < p.length; i++) grid.addSegment(i, p[i - 1]!, p[i]!);
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const hit = grid.someSegment(a, b, 0, (j) => j > i + 1 && segmentsCross(a, b, p[j - 1]!, p[j]!));
    if (hit) return true;
  }
  return false;
}

/** This function tells if a polyline turns back on itself at a vertex: a turn of more than 179 degrees, as at a cusp. */
export function hasCusp(p: readonly Point[]): boolean {
  return turns(p).some((t) => Math.abs(t) * DEG > 179);
}

/** The input of `curveFaults`: one curve and the polyline that it draws. */
export interface CurveCheck {
  /** The polyline of the route. */
  readonly polyline: readonly Point[];
  /** The segments of the curve. */
  readonly segments: readonly CurveSegment[];
  /** The samples of the curve (`sampleCurve`). */
  readonly samples: readonly Point[];
  /** The free space of the board. Without it, the check `clear` gives false. */
  readonly space?: CurveSpace;
  /** With these normals, the check `ends` also examines the direction of the curve at its two ends. */
  readonly startNormal?: Point;
  readonly endNormal?: Point;
  /** With this value, the check `g1` examines the joints. Give it for a curve type that is G1 by its design. */
  readonly smooth?: boolean;
}

/** The faults of one curve: one value for each proposed hard rule of the curves in MEAS0. */
export interface CurveFaults {
  /** `curve-clear`: the curve goes through a box that its polyline avoids (C7). */
  readonly clear: boolean;
  /** `curve-ends`: the curve misses an end of its polyline, or an end tangent is more than 1 degree off its normal (C10). */
  readonly ends: boolean;
  /** `curve-g1`: a joint has a G1 defect of more than 0.5 degrees, and it is not a corner that the free space keeps sharp (C1). */
  readonly g1: boolean;
  /** `curve-simple`: the curve crosses itself or turns back at a cusp, and its polyline does not (C9). */
  readonly simple: boolean;
}

/**
 * This function tells if a joint is a corner that the free space keeps sharp. The joint is a vertex of the polyline,
 * and the curve on one side of it goes along the leg of the polyline.
 */
function keptSharp(j: CurveJoint, polyline: readonly Point[]): boolean {
  for (let i = 1; i + 1 < polyline.length; i++) {
    const v = polyline[i]!;
    if (dist(v, j.at) > 1e-6) continue;
    const a = unit(v.x - polyline[i - 1]!.x, v.y - polyline[i - 1]!.y);
    const b = unit(polyline[i + 1]!.x - v.x, polyline[i + 1]!.y - v.y);
    if ((a && angleOf(a, j.before) <= 0.5) || (b && angleOf(b, j.after) <= 0.5)) return true;
  }
  return false;
}

/** This function checks one curve against the proposed hard rules of the curves of MEAS0. The cost is `n log n` for each curve. */
export function curveFaults(c: CurveCheck): CurveFaults {
  const p = c.polyline;
  const s = c.samples;
  const clear = c.space !== undefined && s.length > 1 && c.space.addsHit(s, p);
  let ends = p.length > 0 && (s.length === 0 || dist(s[0]!, p[0]!) > TOLERANCE || dist(s[s.length - 1]!, p[p.length - 1]!) > TOLERANCE);
  if (!ends && (c.startNormal || c.endNormal)) {
    const joints = drawnFrames(c.segments);
    const n0 = c.startNormal && unit(c.startNormal.x, c.startNormal.y);
    const n1 = c.endNormal && unit(-c.endNormal.x, -c.endNormal.y);
    if (n0 && joints.first && angleOf(n0, joints.first) > 1) ends = true;
    if (n1 && joints.last && angleOf(n1, joints.last) > 1) ends = true;
  }
  const g1 = c.smooth === true && curveJoints(c.segments).some((j) => j.angle > 0.5 && !keptSharp(j, p));
  const simple = !crossesItself(p) && !hasCusp(p) && (crossesItself(s) || hasCusp(s));
  return { clear, ends, g1, simple };
}

/** This function gives the unit tangent at the start of the first drawn segment and at the end of the last drawn segment. */
function drawnFrames(segments: readonly CurveSegment[]): { first: Point | undefined; last: Point | undefined } {
  let at: Point | undefined;
  let first: Point | undefined;
  let last: Point | undefined;
  for (const s of segments) {
    if (s.kind === "move" || at === undefined) {
      at = s.to;
      continue;
    }
    const t0 = frame(at, s, 0).tangent;
    const t1 = frame(at, s, 1).tangent;
    if (first === undefined && t0) first = t0;
    if (t1) last = t1;
    at = s.to;
  }
  return { first, last };
}
