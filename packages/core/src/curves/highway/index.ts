import type { Point } from "../../geom.ts";
import type { Result } from "../../model.ts";
import { laneRoutes, runKey, segmentsOf, type Segment, type SegmentGraph } from "../../segments.ts";
import { arcCurve } from "../arc/index.ts";
import { distinctPoints, type CurveSegment } from "../model.ts";
import { sampleCurve } from "../sample.ts";
import type { CurveSpace } from "../space.ts";

/** The options of `highwayCurves`. */
export interface HighwayOptions {
  /** The radius at a bend of the center line of a bundle, at a lone corner, and at a merge or a split. The default is 12. */
  readonly radius?: number;
  /** The smallest radius of each lane at a bend, a merge or a split. A bend of a bundle grows to keep its inner lane at this radius. The default is 4. */
  readonly minRadius?: number;
  /** The largest width of an open segment, from its outer lane on the left to its outer lane on the right, as in `laneRoutes`. The default is `Infinity`. */
  readonly maxWidth?: number;
  /** The boxes that the lanes must not go through, from `curveSpace`. With it, no lane goes through a box that its lane of `laneRoutes` avoids. */
  readonly space?: CurveSpace;
}

/** The curve of the lane of one edge: a list of segments for any renderer, as `curveOf` gives. */
export interface LaneCurve {
  readonly edge: string;
  readonly segments: CurveSegment[];
}

/** A turn smaller than this angle, in radians, is no corner. A turn nearer to a half turn than this angle stays sharp. */
const FLAT = 1e-6;
const SAME = 1e-6;
/** A turn nearer to a half turn than this angle, in radians, is a spike: the route goes back on itself. */
const SPIKE = 0.01;
/** A miter point farther from its vertex than this multiple of the offset gives two corners in place of one. */
const BEVEL = 4;
/** The number of halvings of the search for a clear size. */
const STEPS = 8;

/** One leg of the route of an edge, in the order of the route, with the offset of the lane on it. */
interface Leg {
  readonly a: Point;
  readonly b: Point;
  /** The unit direction. */
  readonly u: Point;
  /** The unit normal on the left, in a frame with the y axis down. */
  readonly n: Point;
  readonly len: number;
  /** The offset of the lane to the left of the leg. */
  readonly off: number;
  /** The number of lanes of the segment of the leg. A leg of a closed or private segment has 1. */
  readonly lanes: number;
  readonly segment: string;
  /** The indexes of the ends of the leg in the distinct points of its segment. */
  readonly from: number;
  readonly to: number;
}

/** A vertex of the lane polyline, with the radius of its arc. A radius of 0 keeps the vertex sharp. */
interface LaneVertex {
  readonly p: Point;
  readonly r: number;
  /** A fixed arc keeps its radius when an arc next to it on a short leg must shrink. The bends of a bundle are fixed. */
  readonly fixed?: boolean;
}

/** A shift of the lane from one offset to another on one end of a leg: two arcs in an S. */
interface Jog {
  /** The offset before the shift and after it. */
  readonly from: number;
  readonly to: number;
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const along = (p: Point, u: Point, s: number, n: Point, o: number): Point => ({ x: p.x + u.x * s + n.x * o, y: p.y + u.y * s + n.y * o });

/** The signed turn from the direction `u` to the direction `w`, from -π to π. A positive turn goes from the x axis to the y axis. */
const turnOf = (u: Point, w: Point): number => Math.atan2(cross(u, w), dot(u, w));

/** The point where the lines at the offset `o` of two legs meet: the miter point of the vertex `v`. */
function miter(v: Point, nA: Point, nB: Point, o: number): Point {
  const c = 1 + dot(nA, nB);
  if (c < FLAT) return along(v, nA, 0, nA, o);
  return { x: v.x + ((nA.x + nB.x) * o) / c, y: v.y + ((nA.y + nB.y) * o) / c };
}

/**
 * This function gives the length along the leg of an S of two arcs with the radius `r` that shifts a lane by `shift`.
 * It gives also the angle of each arc. A radius smaller than half of the shift makes two quarter circles and a straight piece.
 */
function jogShape(r: number, shift: number): { readonly length: number; readonly angle: number } {
  const d = Math.abs(shift);
  if (d < SAME) return { length: 0, angle: 0 };
  if (r <= 0) return { length: 0, angle: Math.PI / 2 };
  if (r < d / 2) return { length: 2 * r, angle: Math.PI / 2 };
  const angle = Math.acos(1 - d / (2 * r));
  return { length: 2 * r * Math.sin(angle), angle };
}

/** This function finds the largest size from `max` down to 0 for which `clear` is true. It halves the interval `STEPS` times. */
function largestClear(max: number, clear: (size: number) => boolean): number {
  if (max <= 0 || clear(max)) return Math.max(0, max);
  let lo = 0;
  let hi = max;
  for (let i = 0; i < STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * This function gives the segments of a polyline with an arc at each vertex. The arc of a vertex has the radius of the vertex.
 * The arc is tangent to the two legs, so the curve has no break of its tangent. A vertex with the radius 0 stays sharp.
 */
function filletPolyline(vertices: readonly LaneVertex[]): CurveSegment[] {
  const v: LaneVertex[] = [];
  for (const q of vertices) {
    const last = v[v.length - 1];
    if (last && Math.hypot(q.p.x - last.p.x, q.p.y - last.p.y) <= SAME) v[v.length - 1] = { ...last, r: Math.max(last.r, q.r) };
    else v.push(q);
  }
  if (v.length === 0) return [];
  const out: CurveSegment[] = [{ kind: "move", to: v[0]!.p }];
  if (v.length === 1) return out;
  const unit = (a: Point, b: Point): Point => {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const len = (i: number): number => Math.hypot(v[i + 1]!.p.x - v[i]!.p.x, v[i + 1]!.p.y - v[i]!.p.y);
  // The tangent length of each inner vertex. Two arcs on one leg must not overlap, so a pair that is too long shrinks.
  const tan: number[] = v.map((q, i) => {
    if (i === 0 || i === v.length - 1 || q.r <= 0) return 0;
    const t = Math.abs(turnOf(unit(v[i - 1]!.p, q.p), unit(q.p, v[i + 1]!.p)));
    if (t < FLAT || Math.PI - t < FLAT) return 0;
    return q.r * Math.tan(t / 2);
  });
  for (let i = 0; i + 1 < v.length; i++) {
    const l = len(i);
    const sum = tan[i]! + tan[i + 1]!;
    if (sum <= l + 1e-9) continue;
    const a = v[i]!.fixed === true;
    const b = v[i + 1]!.fixed === true;
    // A fixed arc keeps its tangent when the arc on the other end of the leg can shrink.
    // The other arc keeps at least a quarter of the leg, so that it has a radius and the curve has no break.
    if (a && !b) {
      tan[i + 1] = Math.min(tan[i + 1]!, Math.max(l - tan[i]!, l / 4));
      tan[i] = Math.min(tan[i]!, l - tan[i + 1]!);
    } else if (b && !a) {
      tan[i] = Math.min(tan[i]!, Math.max(l - tan[i + 1]!, l / 4));
      tan[i + 1] = Math.min(tan[i + 1]!, l - tan[i]!);
    }
    if (tan[i]! + tan[i + 1]! > l + 1e-9) {
      const k = l / (tan[i]! + tan[i + 1]!);
      tan[i] = tan[i]! * k;
      tan[i + 1] = tan[i + 1]! * k;
    }
  }
  const at = (): Point => out[out.length - 1]!.to;
  for (let i = 1; i + 1 < v.length; i++) {
    const q = v[i]!.p;
    const t = tan[i]!;
    if (t <= 0) {
      out.push({ kind: "line", to: q });
      continue;
    }
    const u = unit(v[i - 1]!.p, q);
    const w = unit(q, v[i + 1]!.p);
    const turn = turnOf(u, w);
    const k = Math.tan(Math.abs(turn) / 2);
    const r = t / k;
    const side = Math.sign(turn);
    const p1 = along(q, u, -t, u, 0);
    const p2 = along(q, w, t, w, 0);
    // The center is on the side of the turn, at the distance r from the first leg.
    const center = { x: p1.x - side * u.y * r, y: p1.y + side * u.x * r };
    if (Math.hypot(p1.x - at().x, p1.y - at().y) > 1e-9) out.push({ kind: "line", to: p1 });
    out.push({ kind: "arc", center, radius: r, start: Math.atan2(p1.y - center.y, p1.x - center.x), sweep: turn, to: p2 });
  }
  out.push({ kind: "line", to: v[v.length - 1]!.p });
  return out;
}

/** The radius of the center line at each bend of the bundles, by the key of the bend from `bendKey`. */
type Bends = ReadonlyMap<string, number>;

/** The key of the bend between two legs. The lanes that go from one leg to the other bend with one center. */
const bendKey = (A: Leg, B: Leg): string => `${A.segment}:${A.to}>${B.segment}:${B.from}@${B.a.x},${B.a.y}`;

/** One bend of the lanes of bundles: the leg before it, the leg after it, and the offset and the polyline of each lane. */
interface BendGroup {
  readonly A: Leg;
  readonly B: Leg;
  readonly lanes: { readonly offset: number; readonly polyline: readonly Point[] }[];
}

/** The legs of the route of one lane, with no spike, and the offset of the lane at each vertex of the route. */
interface LanePlan {
  readonly legs: readonly Leg[];
  readonly at: readonly number[];
}

/**
 * This function gives the offset of the lane at each vertex of its route. At a merge or a split, it is the offset on the leg with more lanes.
 * So a bundle keeps its spacing up to the vertex, and the lane shifts on the other leg.
 */
function offsetsAt(legs: readonly Leg[]): number[] {
  const at: number[] = new Array<number>(legs.length + 1).fill(0);
  for (let j = 1; j < legs.length; j++) {
    const A = legs[j - 1]!;
    const B = legs[j]!;
    at[j] = A.lanes < B.lanes ? B.off : A.off;
  }
  return at;
}

/**
 * This function gives the curve of one polyline as a lane alone: an arc at each corner, as `arcCurve` gives.
 * A lane alone has no merge and no split, so the curve strategy `highway` gives this curve for one polyline.
 */
export function highwayCurve(points: readonly Point[], options: Pick<HighwayOptions, "radius" | "space"> = {}): CurveSegment[] {
  return arcCurve(points, { radius: options.radius ?? 12, ...(options.space ? { space: options.space } : {}) });
}

/**
 * This function gives the curve of each lane of `laneRoutes`. The lanes of one open segment bend as one highway.
 *
 * At each bend of an open segment, the lanes are arcs with one center. The radius of a lane is the radius of the center line,
 * plus or minus its offset. So the lanes stay at the lane spacing through the bend. The bend grows to keep the inner lane at `minRadius`,
 * and it shrinks to fit on the legs and in the free space.
 *
 * A lane joins (merges) or leaves (splits) a bundle on an S of two arcs on the leg with fewer lanes.
 * The radius of these arcs is `radius` or less.
 * Each curve has no break of its tangent where each radius is more than 0.
 * A lane that is in no open segment gets the curve of `arcCurve`.
 *
 * The function takes the same input as `laneRoutes`, and it gives the curves in the order of `laneRoutes`.
 * The output is a list of segments for any renderer. `toSvgPath` writes it as SVG path data, and `sampleCurve` gives points.
 */
export function highwayCurves(source: Result | SegmentGraph, open: ReadonlySet<string>, laneWidth: number, options: HighwayOptions = {}): LaneCurve[] {
  const graph = "paths" in source ? source : segmentsOf(source);
  const radius = Math.max(0, options.radius ?? 12);
  const minRadius = Math.max(0, options.minRadius ?? 4);
  const maxWidth = options.maxWidth ?? Infinity;
  const space = options.space;
  const byId = new Map(graph.segments.map((s) => [s.id, s]));
  const spacingOf = (s: Segment): number => (s.count > 1 && open.has(runKey(s.edges)) ? Math.min(laneWidth, maxWidth / (s.count - 1)) : 0);
  // The polylines of `laneRoutes`: the free space keeps each curve out of the boxes that its polyline avoids.
  const polylines = laneRoutes(graph, open, laneWidth, maxWidth);
  const centers = new Map<string, Point[]>();
  const centerOf = (s: Segment): Point[] => {
    let c = centers.get(s.id);
    if (!c) {
      c = distinctPoints(s.points, SAME);
      centers.set(s.id, c);
    }
    return c;
  };
  const plans = graph.paths.map((path): LanePlan | undefined => {
    const legs: Leg[] = [];
    for (const ref of path.segments) {
      const s = byId.get(ref.segment);
      if (!s) continue;
      const sp = spacingOf(s);
      const c = centerOf(s);
      const offset = ((s.count - 1) / 2 - ref.lane) * sp;
      const off = ref.reverse ? -offset : offset;
      const n = c.length;
      for (let j = 0; j + 1 < n; j++) {
        const from = ref.reverse ? n - 1 - j : j;
        const to = ref.reverse ? n - 2 - j : j + 1;
        const a = c[from]!;
        const b = c[to]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len <= SAME) continue;
        const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
        legs.push({ a, b, u, n: { x: u.y, y: -u.x }, len, off, lanes: sp > 0 ? s.count : 1, segment: s.id, from, to });
      }
    }
    if (legs.every((l) => l.lanes < 2)) return undefined;
    const kept = withoutSpikes(legs);
    return { legs: kept, at: offsetsAt(kept) };
  });
  // The lanes that go from one leg of a bundle to the next leg of a bundle bend about one center.
  const groups = new Map<string, BendGroup>();
  plans.forEach((plan, i) => {
    if (!plan) return;
    for (let j = 1; j < plan.legs.length; j++) {
      const A = plan.legs[j - 1]!;
      const B = plan.legs[j]!;
      if (A.lanes < 2 || B.lanes < 2) continue;
      const key = bendKey(A, B);
      const group = groups.get(key) ?? { A, B, lanes: [] };
      // A lane that goes the other way through the bend has its offset on the other side of its own direction.
      const same = dot(A.u, group.A.u) > 0;
      group.lanes.push({ offset: same ? plan.at[j]! : -plan.at[j]!, polyline: polylines[i]!.points });
      groups.set(key, group);
    }
  });
  const bends = bendRadii(groups, radius, minRadius, space);
  return graph.paths.map((path, i): LaneCurve => {
    const polyline = polylines[i]!.points;
    const plan = plans[i];
    if (!plan) return { edge: path.edge, segments: highwayCurve(polyline, { radius, ...(space ? { space } : {}) }) };
    if (plan.legs.length === 0) return { edge: path.edge, segments: [{ kind: "move", to: polyline[0]! }] };
    return { edge: path.edge, segments: laneCurve(plan, bends, polyline, radius, minRadius, space) };
  });
}

/**
 * This function gives the radius of the center line at each bend of the bundles.
 * The radius is `radius`, or more to keep the inner lane at `minRadius`. It shrinks so that each tangent point stays on the half of its leg.
 * It also shrinks so that no lane goes through a box that its polyline avoids.
 */
function bendRadii(groups: ReadonlyMap<string, BendGroup>, radius: number, minRadius: number, space: CurveSpace | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, { A, B, lanes }] of groups) {
    const turn = turnOf(A.u, B.u);
    if (Math.abs(turn) < FLAT || Math.PI - Math.abs(turn) < FLAT) continue;
    const k = Math.tan(Math.abs(turn) / 2);
    const side = Math.sign(turn);
    const v = B.a;
    const half = Math.max(...lanes.map((l) => Math.abs(l.offset)));
    const max = Math.min(Math.max(radius, half + minRadius), A.len / (2 * k), B.len / (2 * k));
    const clear = (R: number): boolean => {
      if (!space) return true;
      return lanes.every(({ offset, polyline }) => {
        const r = R + side * offset;
        if (r <= 0) return true;
        const W = miter(v, A.n, B.n, offset);
        const piece = filletPolyline([
          { p: along(W, A.u, -r * k, A.u, 0), r: 0 },
          { p: W, r },
          { p: along(W, B.u, r * k, B.u, 0), r: 0 },
        ]);
        return !space.addsHit(sampleCurve(piece, space.tolerance), polyline);
      });
    };
    out.set(key, largestClear(max, clear));
  }
  return out;
}

/**
 * This function removes each place where the route goes back on itself: a leg, then a leg in the opposite direction.
 * Such a spike is a split point past the turn of a route. A lane cannot follow it with no break of its tangent.
 */
function withoutSpikes(input: readonly Leg[]): Leg[] {
  const legs = [...input];
  for (let i = 1; i < legs.length; ) {
    const A = legs[i - 1]!;
    const B = legs[i]!;
    if (Math.PI - Math.abs(turnOf(A.u, B.u)) >= SPIKE) {
      i++;
      continue;
    }
    // The route goes from A.a to the tip and back to B.b. The rest is the part of the longer leg past B.b or past A.a.
    const rest = A.len - B.len;
    const keep: Leg[] = [];
    if (rest > SAME) keep.push({ ...A, b: B.b, len: rest, to: -1 });
    else if (-rest > SAME) keep.push({ ...B, a: A.a, len: -rest, from: -1 });
    legs.splice(i - 1, 2, ...keep);
    i = Math.max(1, i - 1);
  }
  return legs;
}

/** This function gives the curve of the lane of one edge from its legs. */
function laneCurve(
  plan: LanePlan,
  bends: Bends,
  polyline: readonly Point[],
  radius: number,
  minRadius: number,
  space: CurveSpace | undefined,
): CurveSegment[] {
  const { legs, at } = plan;
  const L = legs.length;
  // The shifts on the ends of each leg, from the offset at a vertex to the offset of the leg.
  const startJog: (Jog | undefined)[] = new Array<Jog | undefined>(L).fill(undefined);
  const endJog: (Jog | undefined)[] = new Array<Jog | undefined>(L).fill(undefined);
  for (let j = 0; j < L; j++) {
    const leg = legs[j]!;
    if (Math.abs(at[j]! - leg.off) > SAME) startJog[j] = { from: at[j]!, to: leg.off };
    if (Math.abs(at[j + 1]! - leg.off) > SAME) endJog[j] = { from: leg.off, to: at[j + 1]! };
  }
  // The fixed radius of a lane at a bend of bundles: the radius of the center line, plus or minus the offset.
  const fixed = (j: number): number | undefined => {
    const A = legs[j - 1]!;
    const B = legs[j]!;
    if (A.lanes < 2 || B.lanes < 2) return undefined;
    const R = bends.get(bendKey(A, B)) ?? 0;
    const r = R + Math.sign(turnOf(A.u, B.u)) * at[j]!;
    return R > 0 && r > 0 ? r : undefined;
  };

  /** The shape of the lane near one vertex of the route. */
  interface Near {
    /** The vertices of the shift at the end of the leg before the vertex, the corner, and the shift on the leg after it. */
    readonly vertices: readonly LaneVertex[];
    /** The distance along each leg that the shape uses. */
    readonly back: number;
    readonly ahead: number;
  }
  // The shape near the vertex `j` for the scale `s` of the wanted radius. The radius of each arc is at least `floor`.
  // The arcs of a short leg shrink in `filletPolyline`, so a large floor keeps each tangent and does not make an arc too large for its leg.
  const near = (j: number, s: number, floor: number, loose: boolean): Near => {
    const A = j > 0 ? legs[j - 1] : undefined;
    const B = j < L ? legs[j] : undefined;
    const v = B ? B.a : A!.b;
    const c = at[j]!;
    const want = Math.max(radius * s, floor);
    const corner: LaneVertex[] = [];
    let xA = 0;
    let xB = 0;
    let t = 0;
    if (!A || !B) corner.push({ p: v, r: 0 });
    else {
      const turn = turnOf(A.u, B.u);
      const f = loose ? undefined : fixed(j);
      const W = miter(v, A.n, B.n, c);
      if (Math.abs(turn) < FLAT) {
        // A straight vertex has no corner.
      } else if (Math.hypot(W.x - v.x, W.y - v.y) > BEVEL * Math.abs(c)) {
        // A turn near a half turn puts the miter point far away. The lane turns at two points on the offset lines.
        corner.push({ p: along(v, A.n, 0, A.n, c), r: want }, { p: along(v, B.n, 0, B.n, c), r: want });
      } else {
        xA = dot(sub(W, v), A.u);
        xB = dot(sub(W, v), B.u);
        const r = f ?? want;
        corner.push(f === undefined ? { p: W, r } : { p: W, r, fixed: true });
        t = r * Math.tan(Math.abs(turn) / 2);
      }
    }
    // The arcs of a shift have the wanted radius too. So the radius of each arc of the lane is at least `floor`.
    const shift = (leg: Leg, jog: Jog | undefined, start: number, sign: 1 | -1): LaneVertex[] => {
      if (!jog) return [];
      const { length, angle } = jogShape(want, jog.to - jog.from);
      const k = want < Math.abs(jog.to - jog.from) / 2 ? want : want * Math.tan(angle / 2);
      // On the leg after the vertex, the shift goes forward from `start`. On the leg before it, it goes back from `start`.
      const p1 = along(v, leg.u, sign * (start + k), leg.n, sign === 1 ? jog.from : jog.to);
      const p2 = along(v, leg.u, sign * (start + length - k), leg.n, sign === 1 ? jog.to : jog.from);
      return sign === 1 ? [{ p: p1, r: want }, { p: p2, r: want }] : [{ p: p2, r: want }, { p: p1, r: want }];
    };
    const lenOf = (jog: Jog | undefined): number => (jog ? jogShape(want, jog.to - jog.from).length : 0);
    return {
      vertices: [...(A ? shift(A, endJog[j - 1], t - xA, -1) : []), ...corner, ...(B ? shift(B, startJog[j], xB + t, 1) : [])],
      back: A ? Math.max(0, t - xA) + lenOf(endJog[j - 1]) : 0,
      ahead: B ? Math.max(0, xB + t) + lenOf(startJog[j]) : 0,
    };
  };
  // The vertices of the lane near `j`, between the middles of its two legs. The free space tests this piece.
  const piece = (j: number, s: number, floor: number, loose: boolean): LaneVertex[] => {
    const A = j > 0 ? legs[j - 1] : undefined;
    const B = j < L ? legs[j] : undefined;
    const v = B ? B.a : A!.b;
    const head = A ? [{ p: along(v, A.u, -A.len / 2, A.n, A.off), r: 0 }] : [];
    const tail = B ? [{ p: along(v, B.u, B.len / 2, B.n, B.off), r: 0 }] : [];
    return [...head, ...near(j, s, floor, loose).vertices, ...tail];
  };
  // Each vertex gets the half of each leg next to it. The scale of the radii is the largest that fits, then the largest that is clear.
  // A bend of bundles keeps its fixed radius. It is loose, with the radii of a lane alone, only when the fixed arc does not fit or is not clear.
  // The smallest radius shrinks only as far as a short leg or the free space needs. A radius of 0 makes a sharp corner.
  const vertices: LaneVertex[] = [];
  for (let j = 0; j <= L; j++) {
    const fits = (s: number, f: number, loose: boolean): boolean => {
      const q = near(j, s, f, loose);
      return (j === 0 || q.back <= legs[j - 1]!.len / 2 + 1e-9) && (j === L || q.ahead <= legs[j]!.len / 2 + 1e-9);
    };
    let floor = minRadius;
    let loose = !fits(0, floor, false);
    const fitFloor = (): void => {
      if (!fits(0, floor, loose) && fits(0, 0, loose)) floor = largestClear(floor, (f) => fits(0, f, loose));
    };
    const most = (): number => (fits(1, floor, loose) ? 1 : largestClear(1, (x) => fits(x, floor, loose)));
    fitFloor();
    let s = most();
    if (space) {
      const clear = (x: number, f: number): boolean => !space.addsHit(sampleCurve(filletPolyline(piece(j, x, f, loose)), space.tolerance), polyline);
      s = largestClear(s, (x) => clear(x, floor));
      if (!loose && !clear(s, floor)) {
        loose = true;
        fitFloor();
        s = largestClear(most(), (x) => clear(x, floor));
      }
      if (!clear(s, floor)) {
        const f = largestClear(floor, (x) => clear(s, x));
        if (clear(s, f)) floor = f;
      }
    }
    vertices.push(...near(j, s, floor, loose).vertices);
  }
  return filletPolyline(vertices);
}
