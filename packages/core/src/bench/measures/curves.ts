import type { CurveSegment } from "../../curves/model.ts";
import { sampleCurve } from "../../curves/sample.ts";
import type { CurveSpace } from "../../curves/space.ts";
import { dist, frechet, polylineLength, segmentsCross, turns, type Box, type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";
import { nearestOnLine } from "../../highways/sbeb/index.ts";
import type { Route } from "../../model.ts";
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

/**
 * This function gives the curvature variation of a sampled curve (C4 of MEAS0, Moreton 1993): `V = L^3 · ∫ (dκ/ds)^2 ds`.
 * Each inner sample gets the curvature `κ = φ / l` of `bendingEnergy`, with its sign. `L` is the length of the curve.
 * The sum is `L^3 · Σ (κ_(i+1) - κ_i)^2 / d_i`, with `d_i` the distance of two inner samples in sequence.
 *
 * The value has no unit, and lower is better. A straight line and an arc of a circle give 0. Fewer than 4 points give 0. The cost is linear.
 */
export function curvatureVariation(points: readonly Point[], tolerance = 0.25): number {
  const q: Point[] = [];
  for (const v of points) if (q.length === 0 || dist(q[q.length - 1]!, v) > EPS) q.push(v);
  if (q.length < 4) return 0;
  const phi = turns(q);
  const kappa: number[] = [];
  for (let i = 1; i + 1 < q.length; i++) {
    const t = phi[i - 1]!;
    const l = Math.min((dist(q[i - 1]!, q[i]!) + dist(q[i]!, q[i + 1]!)) / 2, (8 * tolerance) / Math.max(EPS, Math.abs(t)));
    kappa.push(Math.abs(t) < EPS ? 0 : t / l);
  }
  let sum = 0;
  for (let i = 0; i + 1 < kappa.length; i++) sum += (kappa[i + 1]! - kappa[i]!) ** 2 / dist(q[i + 1]!, q[i + 2]!);
  return polylineLength(q) ** 3 * sum;
}

/** This function gives the points of a polyline with no leg longer than `step`. It keeps each vertex. */
function densify(points: readonly Point[], step: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const b = points[i]!;
    if (i > 0) {
      const a = points[i - 1]!;
      const n = Math.ceil(dist(a, b) / step);
      for (let k = 1; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    out.push(b);
  }
  return out;
}

/** The most points of each of the two lists of `curveDeviation`. More points give a longer step. */
const DEVIATION_POINTS = 400;

/**
 * This function gives the deviation of a curve from its route (C8 of MEAS0).
 * The value is the Fréchet distance of the samples of the curve and the polyline of the route.
 * Each list gets points with no leg longer than `step`, or longer when a list has more than 400 points. Then the discrete Fréchet distance is near the true distance.
 *
 * The value is in units of the board, and lower is better. The caller divides it by the unit of the board. The cost is quadratic for each route.
 */
export function curveDeviation(samples: readonly Point[], polyline: readonly Point[], step: number): number {
  const long = Math.max(polylineLength(samples), polylineLength(polyline));
  const h = Math.max(step, long / DEVIATION_POINTS, EPS);
  return frechet(densify(samples, h), densify(polyline, h));
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

/** The options of `curveAgreement`. */
export interface CurveAgreementOptions {
  /** Two curves with a gap larger than this value show as two lines. The default is 1 unit. */
  readonly apart?: number;
  /** The tolerance of `sampleCurve` for the samples of each curve. The default is 0.25. */
  readonly tolerance?: number;
  /** The largest distance between two places of a shared segment where the function reads the gap. The default is 1 unit. */
  readonly step?: number;
  /**
   * The length at each end of a run that the function does not read. The default is 0, and then the function reads each run in full.
   * At the end of a run, the routes part, and each curve turns in its own direction. A caller gives the radius of its corners to read only the part between them.
   */
  readonly ends?: number;
}

/** The agreement of the curves of routes on their shared runs (C12 of MEAS0). */
export interface CurveAgreement {
  /** The count of the shared runs. With the value 0, the routes share no run, and the other values give no read. */
  readonly runs: number;
  /** The length of the shared runs. A run of three routes or more counts one time. */
  readonly length: number;
  /** The length of the parts of the runs that the function read. Without the option `ends`, this value is `length`. */
  readonly read: number;
  /** The length of the read parts where the gap is larger than the option `apart`. */
  readonly apart: number;
  /** The value `apart` over `read`, from 0 to 1. Lower is better. Routes with no read part give 0. */
  readonly share: number;
  /** The largest gap at a read place of a run, in units of the board. */
  readonly max: number;
}

/** The first reach of the search for the sample nearest to a place. The reach doubles until the search finds the sample. */
const NEAREST_REACH = 8;

/** The samples of the curve of one route, as legs in a grid of buckets. */
interface SampledCurve {
  /** Each leg goes from its lower end to its higher end. Thus two equal legs in opposite directions give the same nearest point. */
  readonly legs: readonly (readonly [Point, Point])[];
  readonly grid: Grid<number>;
  /** The bounds of the samples. */
  readonly box: Box;
}

/** This function gives the legs of the samples of a curve, with their grid and their bounds. A curve of one sample has one leg of length 0. */
function sampledCurve(samples: readonly Point[]): SampledCurve {
  const legs: [Point, Point][] = [];
  const grid = new Grid<number>(2 * NEAREST_REACH);
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < samples.length; i++) {
    const b = samples[i]!;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x);
    y1 = Math.max(y1, b.y);
    if (i === 0 && samples.length > 1) continue;
    const a = samples[Math.max(0, i - 1)]!;
    grid.addSegment(legs.length, a, b);
    legs.push(a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a]);
  }
  return { legs, grid, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/**
 * This function gives the point of the samples of a curve nearest to `p`. A curve with no sample gives `undefined`.
 * Among legs at the same distance, the first leg of the curve gives the point.
 */
function nearestSample(c: SampledCurve, p: Point): Point | undefined {
  if (c.legs.length === 0) return undefined;
  const best = { point: undefined as Point | undefined, d: Number.POSITIVE_INFINITY, leg: -1 };
  const take = (i: number): void => {
    const q = nearestOnLine(c.legs[i]!, p);
    const d = dist(p, q);
    if (d < best.d || (d === best.d && i < best.leg)) {
      best.point = q;
      best.d = d;
      best.leg = i;
    }
  };
  // A leg nearer than `reach` has a bucket in the box of the query. Thus a point within `reach` is the nearest point.
  // A reach of `far` or more holds the bounds of the samples, and then the search reads each leg.
  const far = Math.max(p.x - c.box.x, c.box.x + c.box.w - p.x, p.y - c.box.y, c.box.y + c.box.h - p.y);
  for (let reach = NEAREST_REACH; reach < far; reach *= 2) {
    c.grid.query({ x: p.x - reach, y: p.y - reach, w: 2 * reach, h: 2 * reach }, take);
    if (best.d <= reach) return best.point;
  }
  for (let i = 0; i < c.legs.length; i++) take(i);
  return best.point;
}

/** A segment that two routes or more share, with the points of its first route and the indexes of its routes in ascending order. */
interface SharedSegment {
  readonly a: Point;
  readonly b: Point;
  readonly routes: number[];
}

/**
 * This function gives the agreement of the drawn curves of routes on the runs that the routes share (C12 of MEAS0).
 * Routes that share a run of points must show one line on the run. A curve through the points of each route does not always do so.
 *
 * Two points are equal when they have the same place. A point takes the oldest place within `TOLERANCE`, or else it makes a new place.
 * A shared segment is a pair of points in sequence that two routes or more have, in the same direction or in the opposite direction.
 * A shared run is the longest sequence of shared segments in sequence in their first route, with the same set of routes.
 * Thus a run of two routes is the longest sequence of two or more equal points in sequence. No two runs share a segment.
 *
 * The function `curve` gives the drawn curve of a route, for example with `curveOf`. `sampleCurve` gives its samples with the option `tolerance`.
 * The function reads the gap at places of each shared segment, at a distance of `step` or less.
 *
 * Each route of the segment gives its sample point nearest to the place. The gap at the place is the largest distance between two of these points.
 * Between two places, the gap is linear. Each sample is within `tolerance` of its curve, so a small `tolerance` gives a gap near the true gap.
 *
 * Two routes part at the end of a run, and there the two curves turn to different sides. Thus a curve with round corners has a gap there.
 * The option `ends` keeps the two ends of each run out of the read. Then `read` tells the length that the function read.
 *
 * The cost is linear in the count of the places for an even density: grids of buckets find the equal points and the near samples.
 * A place on a segment of `k` routes reads `k` nearest points and `k (k - 1) / 2` distances.
 */
export function curveAgreement(routes: readonly Route[], curve: (route: Route) => readonly CurveSegment[], options: CurveAgreementOptions = {}): CurveAgreement {
  const limit = options.apart ?? 1;
  const tolerance = options.tolerance ?? 0.25;
  const step = options.step !== undefined && options.step > 0 ? options.step : 1;
  const ends = Math.max(0, options.ends ?? 0);
  // The places of the points. The grid gives the places near a point.
  const places: Point[] = [];
  const found = new Grid<number>(16);
  const placeOf = (p: Point): number => {
    let id = places.length;
    found.query({ x: p.x - TOLERANCE, y: p.y - TOLERANCE, w: 2 * TOLERANCE, h: 2 * TOLERANCE }, (i) => {
      if (i < id && dist(places[i]!, p) <= TOLERANCE) id = i;
    });
    if (id === places.length) {
      places.push(p);
      found.add(id, { x: p.x, y: p.y, w: 0, h: 0 });
    }
    return id;
  };
  // The segments of each route, without the segments between two points of one place.
  const byPlaces = new Map<string, SharedSegment>();
  const segments = routes.map((r, index) => {
    const ids = r.points.map(placeOf);
    const out: SharedSegment[] = [];
    for (let i = 1; i < ids.length; i++) {
      const u = ids[i - 1]!;
      const v = ids[i]!;
      if (u === v) continue;
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      let s = byPlaces.get(key);
      if (s === undefined) {
        s = { a: r.points[i - 1]!, b: r.points[i]!, routes: [] };
        byPlaces.set(key, s);
      }
      if (s.routes[s.routes.length - 1] !== index) s.routes.push(index);
      out.push(s);
    }
    return out;
  });
  // The samples of a curve, only for a route on a shared segment.
  const sampled: (SampledCurve | undefined)[] = [];
  const samplesOf = (index: number): SampledCurve => (sampled[index] ??= sampledCurve(sampleCurve(curve(routes[index]!), tolerance)));
  const gapAt = (curves: readonly SampledCurve[], p: Point): number => {
    const near: Point[] = [];
    for (const c of curves) {
      const q = nearestSample(c, p);
      if (q !== undefined) near.push(q);
    }
    let gap = 0;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) gap = Math.max(gap, dist(near[i]!, near[j]!));
    return gap;
  };
  // The shared runs. Each route gives the runs of the segments that it draws first, in its direction.
  const runs: SharedSegment[][] = [];
  const done = new Set<SharedSegment>();
  segments.forEach((list, index) => {
    let run: SharedSegment[] | undefined;
    for (const s of list) {
      if (s.routes.length < 2 || s.routes[0] !== index || done.has(s)) {
        run = undefined;
        continue;
      }
      done.add(s);
      const before = run?.[run.length - 1];
      if (run !== undefined && before !== undefined && before.routes.length === s.routes.length && before.routes.every((r, i) => r === s.routes[i])) run.push(s);
      else {
        run = [s];
        runs.push(run);
      }
    }
  });
  let length = 0;
  let read = 0;
  let apart = 0;
  let max = 0;
  for (const run of runs) {
    const total = run.reduce((sum, s) => sum + dist(s.a, s.b), 0);
    length += total;
    let curves: SampledCurve[] | undefined;
    let before = 0;
    for (const s of run) {
      const l = dist(s.a, s.b);
      // The part of the segment that is not within `ends` of an end of the run.
      const from = ends > 0 ? Math.max(0, ends - before) : 0;
      const to = ends > 0 ? Math.min(l, total - ends - before) : l;
      before += l;
      if (to <= from) continue;
      curves ??= s.routes.map(samplesOf);
      const n = Math.max(1, Math.ceil((to - from) / step));
      read += to - from;
      let last = 0;
      for (let k = 0; k <= n; k++) {
        const t = from + ((to - from) * k) / n;
        const p = t <= 0 ? s.a : t >= l ? s.b : { x: s.a.x + (s.b.x - s.a.x) * (t / l), y: s.a.y + (s.b.y - s.a.y) * (t / l) };
        const gap = gapAt(curves, p);
        max = Math.max(max, gap);
        if (k > 0) {
          // The share of the step where the linear gap is above the limit.
          const low = Math.min(last, gap);
          const high = Math.max(last, gap);
          apart += ((to - from) / n) * (low > limit ? 1 : high > limit ? (high - limit) / (high - low) : 0);
        }
        last = gap;
      }
    }
  }
  return { runs: runs.length, length, read, apart, share: read > 0 ? Math.min(1, apart / read) : 0, max };
}
