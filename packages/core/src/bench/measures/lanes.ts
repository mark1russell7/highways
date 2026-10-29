import { dist, frechet, pointSegmentDistance, segmentsCross, type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";
import type { Graph, Result, Route } from "../../model.ts";
import { laneRoutes, runKey, segmentsOf, type SegmentGraph } from "../../segments.ts";
import { measureRouteFaults } from "../links.ts";
import { segmentKey } from "./routes.ts";
import { quantile } from "./stats.ts";

/**
 * The lane width of the lane measures, in units of the board. The room bench opens the lanes at the same width (`spacing` of `measureBoard`).
 * R12 also uses it as the smallest correct distance between two parallel legs.
 */
export const MEASURE_LANE_WIDTH = 4;

/** The routes of a result with each shared segment open: one lane for each edge. */
export interface OpenLanes {
  /** The segments of the result. The shared segments are the runs and the trunks of the bundles. */
  readonly graph: SegmentGraph;
  /** The lane route of each edge, from `laneRoutes`. Without a shared segment, the lane routes are the routes. */
  readonly lanes: readonly Route[];
  /** The distance between two lanes. */
  readonly width: number;
}

/** This function opens each shared segment of a result: each edge of a run or of a trunk gets its own lane, `width` apart. */
export function openLanes(result: Result, width: number = MEASURE_LANE_WIDTH): OpenLanes {
  const graph = segmentsOf(result);
  const open = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  return { graph, lanes: laneRoutes(graph, open, width), width };
}

/** One drawn segment and the sorted ids of the edges that draw it. */
interface Leg {
  readonly a: Point;
  readonly b: Point;
  readonly edges: string;
}

/** This function gives each drawn segment of the routes one time, with the edges that draw it. A segment shorter than the grain of `segmentKey` is not a leg. */
function legsOf(routes: readonly Route[]): Leg[] {
  const byKey = new Map<string, { a: Point; b: Point; edges: Set<string> }>();
  for (const r of routes) {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]!;
      const b = r.points[i]!;
      const k = segmentKey(a, b);
      if (k === undefined) continue;
      const leg = byKey.get(k);
      if (leg) leg.edges.add(r.edge);
      else byKey.set(k, { a, b, edges: new Set([r.edge]) });
    }
  }
  return [...byKey.values()].map((l) => ({ a: l.a, b: l.b, edges: [...l.edges].sort().join("\u0000") }));
}

/** This function gives the distance between the segments `ab` and `cd`. It is 0 when they cross or touch. */
function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** This function gives the length of the union of intervals. */
function unionLength(intervals: [number, number][]): number {
  intervals.sort((p, q) => p[0] - q[0]);
  let sum = 0;
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const [a, b] of intervals) {
    if (a > hi) {
      if (hi > lo) sum += hi - lo;
      lo = a;
      hi = b;
    } else hi = Math.max(hi, b);
  }
  if (hi > lo) sum += hi - lo;
  return sum;
}

/**
 * This function gives the lane separation of the routes (R12 of MEAS0): the share of the ink that runs too near a parallel leg of other edges.
 *
 * A leg is a drawn segment of `S`, and a leg that several routes share counts one time, as in B1. Two legs are near when four things are true.
 * The sets of their edges are different. They are within `maxAngle` degrees of parallel. Their projections overlap. Their distance is less than `near`.
 *
 * `ns = Σ_s length(the part of s that the projections of its near legs cover) / ink(S)`. Each part counts one time, so the scale is 0 to 1.
 * Lower is better. Routes without ink give 0. A grid of buckets finds the near legs, so the cost is `n log n` for an even density.
 */
export function routeSeparation(routes: readonly Route[], near: number = MEASURE_LANE_WIDTH, maxAngle = 5): number {
  const legs = legsOf(routes);
  let ink = 0;
  for (const l of legs) ink += dist(l.a, l.b);
  if (ink <= 0) return 0;
  const grid = new Grid<number>(Math.max(16, 4 * near));
  legs.forEach((l, i) => grid.addSegment(i, l.a, l.b));
  const sin = parallelSine(maxAngle);
  let close = 0;
  legs.forEach((s, i) => {
    const length = dist(s.a, s.b);
    const ux = (s.b.x - s.a.x) / length;
    const uy = (s.b.y - s.a.y) / length;
    const cover: [number, number][] = [];
    grid.querySegment(s.a, s.b, near, (j) => {
      const t = legs[j]!;
      if (j === i || t.edges === s.edges) return;
      const tx = t.b.x - t.a.x;
      const ty = t.b.y - t.a.y;
      const tl = Math.hypot(tx, ty);
      if (Math.abs(ux * ty - uy * tx) > sin * tl) return;
      const p = (t.a.x - s.a.x) * ux + (t.a.y - s.a.y) * uy;
      const q = (t.b.x - s.a.x) * ux + (t.b.y - s.a.y) * uy;
      const lo = Math.max(0, Math.min(p, q));
      const hi = Math.min(length, Math.max(p, q));
      if (hi - lo <= 1e-9 || segmentDistance(s.a, s.b, t.a, t.b) >= near) return;
      cover.push([lo, hi]);
    });
    close += unionLength(cover);
  });
  return Math.min(1, close / ink);
}

/** This function gives the sine of the largest angle between two legs that R12 and R16 count as parallel. */
function parallelSine(maxAngle: number): number {
  return Math.sin((maxAngle * Math.PI) / 180);
}

/** The lane balance of the routes (R16 of MEAS0). */
export interface RouteBalance {
  /** The coefficient of variation of the gaps, weighted by the overlap: the standard deviation over the mean. 0 is even. */
  readonly cv: number;
  /** The share of the overlap with a gap less than half of the weighted median gap. */
  readonly low: number;
  /** The count of the pairs of neighbor legs. */
  readonly pairs: number;
}

/** The distance in units of the board up to which two parallel legs are neighbors for R16. It is 8 lane widths. */
export const MEASURE_BALANCE_REACH: number = 8 * MEASURE_LANE_WIDTH;

/**
 * This function gives the lane balance of the routes (R16 of MEAS0): the spread of the gaps between parallel routes.
 *
 * The legs are the legs of R12. For each leg `s`, its neighbor at each side is the nearest leg `t` of other edges with three properties.
 * It is within `maxAngle` degrees of parallel. Its projection overlaps `s`. Its distance at the middle of the overlap is less than `reach`.
 * Each neighbor pair gives a gap `g` with the weight `w`, the length of the overlap. A pair counts one time.
 * Two legs on one line have the gap 0.
 *
 * `cv = sqrt(Σ w (g − ḡ)² / Σ w) / ḡ`, with `ḡ = Σ w g / Σ w`. Lower is better. Routes without a neighbor pair give 0.
 * R12 counts the parallel ink that is too near. R16 counts uneven gaps, also when each gap is wide.
 */
export function routeBalance(routes: readonly Route[], reach: number = MEASURE_BALANCE_REACH, maxAngle = 5): RouteBalance {
  const legs = legsOf(routes);
  const grid = new Grid<number>(Math.max(16, reach));
  legs.forEach((l, i) => grid.addSegment(i, l.a, l.b));
  const sin = parallelSine(maxAngle);
  // The key of a pair is the two indices in order, so a pair that each leg finds counts one time.
  const gaps = new Map<string, { g: number; w: number }>();
  legs.forEach((s, i) => {
    const length = dist(s.a, s.b);
    if (length <= 0) return;
    const ux = (s.b.x - s.a.x) / length;
    const uy = (s.b.y - s.a.y) / length;
    // The nearest neighbor on each side of `s`: the side +1 is the left of its direction, and -1 is the right. A gap of 0 goes to the side +1.
    const best = new Map<number, { j: number; g: number; w: number }>();
    grid.querySegment(s.a, s.b, reach, (j) => {
      const t = legs[j]!;
      if (j === i || t.edges === s.edges) return;
      const tx = t.b.x - t.a.x;
      const ty = t.b.y - t.a.y;
      // The squared length of `t`. The test of the angle compares squares, so it needs no square root.
      const tl2 = tx * tx + ty * ty;
      const cross = ux * ty - uy * tx;
      if (tl2 <= 0 || cross * cross > sin * sin * tl2) return;
      const p = (t.a.x - s.a.x) * ux + (t.a.y - s.a.y) * uy;
      const q = (t.b.x - s.a.x) * ux + (t.b.y - s.a.y) * uy;
      const lo = Math.max(0, Math.min(p, q));
      const hi = Math.min(length, Math.max(p, q));
      if (hi - lo <= 1e-9) return;
      // The offset of the line of `t` from the middle of the overlap on `s`, along the normal of `s`.
      const m = (lo + hi) / 2;
      const px = s.a.x + ux * m;
      const py = s.a.y + uy * m;
      const k = ((px - t.a.x) * tx + (py - t.a.y) * ty) / tl2;
      const o = (t.a.x + tx * k - px) * -uy + (t.a.y + ty * k - py) * ux;
      const g = Math.abs(o);
      if (g >= reach) return;
      const side = o < -1e-9 ? -1 : 1;
      const now = best.get(side);
      if (!now || g < now.g) best.set(side, { j, g, w: hi - lo });
    });
    for (const n of best.values()) {
      const key = i < n.j ? `${i},${n.j}` : `${n.j},${i}`;
      if (!gaps.has(key)) gaps.set(key, { g: n.g, w: n.w });
    }
  });
  const list = [...gaps.values()];
  const W = list.reduce((sum, x) => sum + x.w, 0);
  if (list.length === 0 || W <= 0) return { cv: 0, low: 0, pairs: 0 };
  const mean = list.reduce((sum, x) => sum + x.w * x.g, 0) / W;
  const variance = list.reduce((sum, x) => sum + x.w * (x.g - mean) ** 2, 0) / W;
  // The weighted median: the gap where the sorted weights reach half of the sum.
  const sorted = [...list].sort((x, y) => x.g - y.g);
  let acc = 0;
  let median = sorted[sorted.length - 1]!.g;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= W / 2) {
      median = x.g;
      break;
    }
  }
  const low = list.filter((x) => x.g < median / 2).reduce((sum, x) => sum + x.w, 0) / W;
  return { cv: mean > 0 ? Math.sqrt(variance) / mean : 0, low, pairs: list.length };
}

/**
 * This function gives the orthogonality of the routes (R14 of MEAS0): `orth = Σ L(legs within maxAngle degrees of an axis) / Σ_e L(r_e)`.
 * Each route counts its own legs, also on a shared segment. The scale is 0 to 1, and higher is better for an orthogonal style.
 * Routes without length give 1. The cost is linear.
 */
export function orthogonality(routes: readonly Route[], maxAngle = 1): number {
  const tan = Math.tan((maxAngle * Math.PI) / 180);
  let total = 0;
  let straight = 0;
  for (const r of routes) {
    for (let i = 1; i < r.points.length; i++) {
      const dx = Math.abs(r.points[i]!.x - r.points[i - 1]!.x);
      const dy = Math.abs(r.points[i]!.y - r.points[i - 1]!.y);
      const l = Math.hypot(dx, dy);
      total += l;
      if (Math.min(dx, dy) <= tan * Math.max(dx, dy)) straight += l;
    }
  }
  return total > 0 ? straight / total : 1;
}

/**
 * This function counts the lane crossings of the segments of a result (B5 of MEAS0): the pairs of edges whose lane order flips.
 * Along the route of each edge `e`, it takes the shared segments in order. On each one, another edge `f` is on the left or on the right of `e`, in the way of `e`.
 *
 * A pair `(e, f)` counts one time when the side of `f` changes from one shared segment of both edges to the next one.
 * Lower is better. A result without shared segments gives 0. The cost is the sum of the squares of the edge counts of the shared segments.
 */
export function laneCrossings(graph: SegmentGraph): number {
  const shared = new Map(graph.segments.filter((s) => s.count > 1).map((s) => [s.id, s] as const));
  const flipped = new Set<string>();
  for (const path of graph.paths) {
    const side = new Map<string, number>();
    for (const ref of path.segments) {
      const s = shared.get(ref.segment);
      if (!s) continue;
      s.edges.forEach((f, lane) => {
        if (f === path.edge) return;
        const now = Math.sign(lane - ref.lane) * (ref.reverse ? -1 : 1);
        const before = side.get(f);
        if (before !== undefined && before !== now) flipped.add(path.edge < f ? `${path.edge}\u0000${f}` : `${f}\u0000${path.edge}`);
        side.set(f, now);
      });
    }
  }
  return flipped.size;
}

/** This function adds the key of each cell of side `u` that the segment `ab` touches, with an exact walk over the cells (Amanatides and Woo, 1987). */
function touchCells(a: Point, b: Point, u: number, cells: Set<string>): void {
  let i = Math.floor(a.x / u);
  let j = Math.floor(a.y / u);
  const iEnd = Math.floor(b.x / u);
  const jEnd = Math.floor(b.y / u);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const deltaX = dx !== 0 ? u / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const deltaY = dy !== 0 ? u / Math.abs(dy) : Number.POSITIVE_INFINITY;
  let maxX = dx !== 0 ? ((sx > 0 ? (i + 1) * u : i * u) - a.x) / dx : Number.POSITIVE_INFINITY;
  let maxY = dy !== 0 ? ((sy > 0 ? (j + 1) * u : j * u) - a.y) / dy : Number.POSITIVE_INFINITY;
  cells.add(`${i},${j}`);
  while (i !== iEnd || j !== jEnd) {
    // At a corner of four cells, the walk steps on both axes, so it does not touch the two side cells.
    const moveX = j === jEnd || (i !== iEnd && maxX <= maxY);
    const moveY = i === iEnd || (j !== jEnd && maxY <= maxX);
    if (moveX) {
      i += sx;
      maxX += deltaX;
    }
    if (moveY) {
      j += sy;
      maxY += deltaY;
    }
    cells.add(`${i},${j}`);
  }
}

/**
 * This function gives the occupied area of the routes (B7 of MEAS0): `moa = cells that S touches / cells that the straight lines touch`.
 * The cells are squares of side `unit` from the origin, and `unit` is `u` of the board (`boardUnit`). The straight line of an edge joins the two ends of its route.
 * The scale is a ratio, and lower is better. Routes without a straight line give 1. The cost is linear in the cells.
 */
export function occupiedArea(routes: readonly Route[], unit: number): number {
  const u = unit > 0 ? unit : 1;
  const drawn = new Set<string>();
  const straight = new Set<string>();
  for (const r of routes) {
    const p = r.points;
    if (p.length < 2) continue;
    for (let i = 1; i < p.length; i++) touchCells(p[i - 1]!, p[i]!, u, drawn);
    touchCells(p[0]!, p[p.length - 1]!, u, straight);
  }
  return straight.size > 0 ? drawn.size / straight.size : 1;
}

/** The run profile of a result (B8 of MEAS0). */
export interface RunProfile {
  /** The number of shared segments: the runs and the trunks of the bundles with two edges or more. */
  readonly runs: number;
  /** The median of the edges of each shared segment. It is 0 without a shared segment. */
  readonly median: number;
  /** The most edges of one shared segment. It is 0 without a shared segment. */
  readonly max: number;
}

/** This function gives the run profile of a result (B8 of MEAS0): the shared segments, and the median and the most edges of each. The cost is linear. */
export function runProfile(graph: SegmentGraph): RunProfile {
  const counts = graph.segments.filter((s) => s.count > 1).map((s) => s.count);
  if (counts.length === 0) return { runs: 0, median: 0, max: 0 };
  return { runs: counts.length, median: quantile(counts, 0.5), max: Math.max(...counts) };
}

/** The lane fidelity of a result (B9 of MEAS0). */
export interface LaneFidelity {
  /** The median of `lf(e)` over the edges with a shared segment. */
  readonly median: number;
  /** The largest `lf(e)`. */
  readonly max: number;
  /** The number of edges with a shared segment. */
  readonly edges: number;
}

/**
 * This function gives the lane fidelity (B9 of MEAS0): `lf(e) = frechet(lane(e), r_e) / (width · k / 2)` for each edge `e` with a shared segment.
 * `lane(e)` is the lane route of `openLanes`, `r_e` is the route, and `k` is the edge count of the widest shared segment of `e`.
 * `frechet` is the discrete Fréchet distance of the points. A value of 1 or less is correct, and lower is better.
 * It gives `undefined` when no edge has a shared segment. The cost is quadratic in the points of each route.
 */
export function laneFidelity(routes: readonly Route[], open: OpenLanes): LaneFidelity | undefined {
  const count = new Map(open.graph.segments.map((s) => [s.id, s.count] as const));
  const lanes = new Map(open.lanes.map((r) => [r.edge, r.points] as const));
  const own = new Map(routes.map((r) => [r.edge, r.points] as const));
  const values: number[] = [];
  for (const path of open.graph.paths) {
    let k = 0;
    for (const ref of path.segments) k = Math.max(k, count.get(ref.segment) ?? 0);
    const lane = lanes.get(path.edge);
    const route = own.get(path.edge);
    if (k < 2 || !lane || !route || open.width <= 0) continue;
    values.push(frechet(lane, route) / ((open.width * k) / 2));
  }
  if (values.length === 0) return undefined;
  return { median: quantile(values, 0.5), max: Math.max(...values), edges: values.length };
}

/**
 * This function counts the lane routes that go through a box that is not one of their ends (M4 of MEAS0).
 * It is the count `laneThrough` of the room bench (`measureBoard`), for the lanes of any result. Lower is better. The cost is `n log n`.
 */
export function lanesThrough(graph: Graph, open: OpenLanes): number {
  return measureRouteFaults(graph, { routes: open.lanes }).through;
}

/**
 * This function gives the area of a result (M1 of MEAS0) for a router: the growth of the board that the open lanes need.
 * The value is the area of the bounding box of the boxes and the lane routes. The function divides it by the area of the bounding box of the boxes.
 *
 * It is the room form `area(open) / area(packed)` with the boxes as they are. The scale is a ratio of 1 or more, and lower is better.
 * A board without area gives 1. The cost is linear.
 */
export function laneArea(graph: Graph, open: OpenLanes): number {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const n of graph.nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  const packed = (x1 - x0) * (y1 - y0);
  if (!(packed > 0)) return 1;
  for (const r of open.lanes)
    for (const p of r.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return ((x1 - x0) * (y1 - y0)) / packed;
}
