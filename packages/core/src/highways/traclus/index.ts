import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, pointSegmentDistance, polylineLength, type Point } from "../../geom.ts";
import { orderLanes } from "../../segments.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { firstRoutes, nearestPlace, orderAlongRoutes, tidyPlan } from "../base.ts";
import { lengthBetween, memberAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/** The options of the highway strategy `traclus` (HWY-025 of the note on highways). */
export interface TraclusOptions extends Pick<WayOptions, "margin" | "k"> {
  /** Two segments are neighbours when their distance is this value or less, in units of the board. The default is 2. */
  readonly eps: number;
  /** A cluster has segments of this number of edges or more, and a core segment has this number of neighbours or more. The default is 3. */
  readonly minLns: number;
  /** The weight of the perpendicular distance. The default is 1. */
  readonly wPerp: number;
  /** The weight of the parallel distance. The default is 1. */
  readonly wPar: number;
  /** The weight of the angle distance. The default is 1. */
  readonly wTheta: number;
  /** A route keeps a corner when the cost of the line without it is more than this value times the cost with it. The default is 1. */
  readonly mdl: number;
}

/** The default options of the strategy `traclus`. */
export const TRACLUS_DEFAULTS: Readonly<Required<Omit<TraclusOptions, "margin" | "k">>> = Object.freeze({ eps: 2, minLns: 3, wPerp: 1, wPar: 1, wTheta: 1, mdl: 1 });

/** One segment of a partitioned route: the edge, the index of the segment in the route, and its two ends. */
export interface RouteSegment {
  readonly edge: string;
  readonly index: number;
  readonly a: Point;
  readonly b: Point;
}

/** This function gives the distance of the point `p` to the line through `a` and `b`. It also gives the place of its projection as a share of `ab`. */
function project(p: Point, a: Point, b: Point): { perp: number; u: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { perp: dist(p, a), u: 0 };
  const u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return { perp: Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.sqrt(len2), u };
}

/**
 * This function gives the TRACLUS distance of two segments (Lee, Han and Whang 2007): `w_perp d_perp + w_par d_par + w_theta d_theta`.
 * `d_perp` is `(l1² + l2²) / (l1 + l2)` with the distances of the ends of the shorter segment to the line of the longer segment.
 * `d_par` is the gap along the longer segment between the two segments, 0 when they overlap. `d_theta` is `|shorter| sin(theta)`.
 * The segments have no direction, so the angle is 90 degrees or less.
 */
export function segmentDistance(p: { a: Point; b: Point }, q: { a: Point; b: Point }, w: { perp: number; par: number; theta: number }): number {
  const [long, short] = dist(p.a, p.b) >= dist(q.a, q.b) ? [p, q] : [q, p];
  const len = dist(long.a, long.b);
  const s = project(short.a, long.a, long.b);
  const e = project(short.b, long.a, long.b);
  const perp = s.perp + e.perp > 1e-12 ? (s.perp * s.perp + e.perp * e.perp) / (s.perp + e.perp) : 0;
  const lo = Math.min(s.u, e.u);
  const hi = Math.max(s.u, e.u);
  const par = (hi < 0 ? -hi : lo > 1 ? lo - 1 : 0) * len;
  const shortLen = dist(short.a, short.b);
  let theta = 0;
  if (len > 1e-12 && shortLen > 1e-12) {
    const cos = Math.abs(((long.b.x - long.a.x) * (short.b.x - short.a.x) + (long.b.y - long.a.y) * (short.b.y - short.a.y)) / (len * shortLen));
    theta = shortLen * Math.sqrt(Math.max(0, 1 - cos * cos));
  }
  return w.perp * perp + w.par * par + w.theta * theta;
}

/**
 * This function gives the characteristic points of a route by the rule of the minimum description length (MDL) of TRACLUS.
 * A partition from point `i` to point `j` costs `L(H) + L(D|H)`. `L(H)` is the log of its length, and `L(D|H)` the logs of the perpendicular and angle distances of the route parts.
 * The route keeps the point before `j` when that cost is more than `ratio` times the cost of the route parts. The lengths are in units of the board.
 */
export function characteristicPoints(route: readonly Point[], unit: number, ratio: number): Point[] {
  const n = route.length;
  if (n <= 2) return [...route];
  const lg = (x: number): number => Math.log2(1 + x / unit);
  const costs = (i: number, j: number): { par: number; nopar: number } => {
    const a = route[i]!;
    const b = route[j]!;
    let perp = 0;
    let theta = 0;
    let nopar = 0;
    for (let k = i; k < j; k++) {
      const part = { a: route[k]!, b: route[k + 1]! };
      perp += segmentDistance({ a, b }, part, { perp: 1, par: 0, theta: 0 });
      theta += segmentDistance({ a, b }, part, { perp: 0, par: 0, theta: 1 });
      nopar += lg(dist(part.a, part.b));
    }
    return { par: lg(dist(a, b)) + lg(perp) + lg(theta), nopar };
  };
  const out: Point[] = [route[0]!];
  let start = 0;
  let length = 1;
  while (start + length < n) {
    const curr = start + length;
    const c = costs(start, curr);
    if (c.par > ratio * c.nopar && curr - 1 > start) {
      out.push(route[curr - 1]!);
      start = curr - 1;
      length = 1;
    } else length++;
  }
  out.push(route[n - 1]!);
  return out;
}

/**
 * This function gives the clusters of segments of DBSCAN. A segment with `minLns` neighbours or more within `eps` (itself included) is a core segment.
 * A cluster grows from each core segment through its neighbours. A cluster with segments of fewer than `minLns` edges is dropped.
 */
export function segmentClusters(segments: readonly RouteSegment[], eps: number, minLns: number, w: { perp: number; par: number; theta: number }): RouteSegment[][] {
  const n = segments.length;
  // A grid of cells of side `eps` prunes the pairs. Two segments within `eps` have boxes within `eps` of each other in each axis.
  const near: number[][] = segments.map(() => []);
  const box = segments.map((s) => ({ x0: Math.min(s.a.x, s.b.x), y0: Math.min(s.a.y, s.b.y), x1: Math.max(s.a.x, s.b.x), y1: Math.max(s.a.y, s.b.y) }));
  for (let i = 0; i < n; i++) {
    near[i]!.push(i);
    for (let j = i + 1; j < n; j++) {
      const a = box[i]!;
      const b = box[j]!;
      if (a.x0 > b.x1 + eps || b.x0 > a.x1 + eps || a.y0 > b.y1 + eps || b.y0 > a.y1 + eps) continue;
      if (segmentDistance(segments[i]!, segments[j]!, w) <= eps) {
        near[i]!.push(j);
        near[j]!.push(i);
      }
    }
  }
  const label = new Int32Array(n).fill(-1);
  const out: RouteSegment[][] = [];
  for (let i = 0; i < n; i++) {
    if (label[i] !== -1 || near[i]!.length < minLns) continue;
    const id = out.length;
    const members: number[] = [];
    const queue = [i];
    label[i] = id;
    while (queue.length > 0) {
      const k = queue.shift()!;
      members.push(k);
      if (near[k]!.length < minLns) continue;
      for (const j of near[k]!) {
        if (label[j] !== -1) continue;
        label[j] = id;
        queue.push(j);
      }
    }
    out.push(members.sort((a, b) => a - b).map((k) => segments[k]!));
  }
  return out.filter((c) => new Set(c.map((s) => s.edge)).size >= minLns);
}

/**
 * This function gives the representative line of a cluster of segments. The line goes along the mean direction of the segments.
 * A sweep along that direction stops at each end of a segment. Where `minLns` segments or more cover the stop, the point is the mean of their points there.
 * Two points of the line are at least `gap` apart.
 */
export function representative(cluster: readonly RouteSegment[], minLns: number, gap: number): Point[] {
  const first = cluster[0]!;
  const fx = first.b.x - first.a.x;
  const fy = first.b.y - first.a.y;
  let vx = 0;
  let vy = 0;
  for (const s of cluster) {
    let dx = s.b.x - s.a.x;
    let dy = s.b.y - s.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    if (dx * fx + dy * fy < 0) [dx, dy] = [-dx, -dy];
    vx += dx / len;
    vy += dy / len;
  }
  const vl = Math.hypot(vx, vy);
  if (vl < 1e-9) return [];
  const ux = vx / vl;
  const uy = vy / vl;
  const along = (p: Point): number => p.x * ux + p.y * uy;
  const across = (p: Point): number => -p.x * uy + p.y * ux;
  const spans = cluster.map((s) => {
    const [p, q] = along(s.a) <= along(s.b) ? [s.a, s.b] : [s.b, s.a];
    return { x0: along(p), y0: across(p), x1: along(q), y1: across(q) };
  });
  const stops = [...new Set(spans.flatMap((s) => [s.x0, s.x1]))].sort((a, b) => a - b);
  const out: Point[] = [];
  let lastX = -Infinity;
  for (const x of stops) {
    const cover = spans.filter((s) => s.x0 <= x + 1e-9 && s.x1 >= x - 1e-9);
    if (cover.length < minLns) continue;
    if (x - lastX < gap) continue;
    let y = 0;
    for (const s of cover) y += s.x1 - s.x0 > 1e-9 ? s.y0 + ((s.y1 - s.y0) * (x - s.x0)) / (s.x1 - s.x0) : (s.y0 + s.y1) / 2;
    y /= cover.length;
    out.push({ x: x * ux - y * uy, y: x * uy + y * ux });
    lastX = x;
  }
  return out;
}

/** This function gives the distance of the point `p` to the polyline `line`. */
function lineDistance(line: readonly Point[], p: Point): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, pointSegmentDistance(p, line[i - 1]!, line[i]!));
  return best;
}

/** The largest ratio of the length along the spine of a member to the length of its own route between the same ends. */
const DETOUR = 1.25;

/**
 * This function gives the highways of TRACLUS (HWY-025). Each first route breaks into a few long segments by the rule of MDL.
 * DBSCAN puts the segments that are near in distance and angle into clusters. Each cluster with segments of `minLns` edges or more is one highway.
 * The spine is the representative line of the cluster, or a way through the corner graph between its ends when the line hits a box.
 * Each edge of the cluster joins the spine nearest to the first end of its segments. It leaves the spine nearest to the last end.
 * An edge rides only when both ends of its part are within `eps` of the spine.
 * Its length on the spine is also at most 1.25 times the length of its own route there.
 * Each edge rides one highway at most: the highway where it rides the longest length.
 */
export function traclusPlan(input: HighwayInput, o: Readonly<TraclusOptions>): HighwayPlan {
  const graph = input.graph;
  const unit = boardUnit(graph);
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const pad = finder.margin / 2;
  const routes = firstRoutes(input);
  const segments: RouteSegment[] = [];
  const corners = new Map<string, Point[]>();
  for (const e of graph.edges) {
    const route = routes.get(e.id);
    if (!route || route.length < 2) continue;
    const cps = characteristicPoints(route, unit, o.mdl);
    corners.set(e.id, cps);
    for (let i = 1; i < cps.length; i++) if (dist(cps[i - 1]!, cps[i]!) > 1e-9) segments.push({ edge: e.id, index: i - 1, a: cps[i - 1]!, b: cps[i]! });
  }
  const minLns = Math.max(2, Math.round(o.minLns));
  const w = { perp: o.wPerp, par: o.wPar, theta: o.wTheta };
  const eps = o.eps * unit;
  const clusters = segmentClusters(segments, eps, minLns, w);
  type Placed = { edge: string; on: number; off: number; ride: number };
  const found: { spine: Point[]; placed: Placed[] }[] = [];
  for (const cluster of clusters) {
    const line = representative(cluster, minLns, finder.margin);
    if (line.length < 2 || polylineLength(line) <= finder.margin) continue;
    let spine: Point[] | undefined = line;
    if (!finder.obstacles.clearPath(line, pad) || line.some((p) => finder.obstacles.inside(p, pad))) {
      const a = line[0]!;
      const b = line[line.length - 1]!;
      const way = finder.obstacles.inside(a, pad) || finder.obstacles.inside(b, pad) ? undefined : finder.corners.path(a, b);
      spine = way ? finder.corners.pull(way) : undefined;
    }
    if (!spine || spine.length < 2 || polylineLength(spine) <= finder.margin) continue;
    // The part of each edge in the cluster: its first and its last segment in the order of its route.
    const parts = new Map<string, { first: RouteSegment; last: RouteSegment }>();
    for (const s of cluster) {
      const p = parts.get(s.edge);
      if (!p) parts.set(s.edge, { first: s, last: s });
      else {
        if (s.index < p.first.index) p.first = s;
        if (s.index > p.last.index) p.last = s;
      }
    }
    const placed: Placed[] = [];
    for (const [edge, p] of parts) {
      if (lineDistance(spine, p.first.a) > eps || lineDistance(spine, p.last.b) > eps) continue;
      const on = nearestPlace(spine, p.first.a);
      const off = nearestPlace(spine, p.last.b);
      const ride = lengthBetween(spine, Math.min(on, off), Math.max(on, off));
      const own = polylineLength(corners.get(edge)!.slice(p.first.index, p.last.index + 2));
      if (ride > finder.margin && ride <= DETOUR * own + finder.margin) placed.push({ edge, on, off, ride });
    }
    if (placed.length >= 2) found.push({ spine, placed });
  }
  // Each edge keeps the highway where it rides the longest length. The first highway wins a tie.
  const best = new Map<string, { at: number; ride: number }>();
  found.forEach((f, at) => {
    for (const x of f.placed) if ((best.get(x.edge)?.ride ?? -1) < x.ride) best.set(x.edge, { at, ride: x.ride });
  });
  const highways: Highway[] = [];
  found.forEach((f, at) => {
    const placed = f.placed.filter((x) => best.get(x.edge)!.at === at);
    if (placed.length < 2) return;
    const route = f.spine;
    // The lane order reads the plugs of each edge on each side of the spine.
    const trip = (x: Placed): Point[] => {
      const own = routes.get(x.edge)!;
      const [from, to] = [own[0]!, own[own.length - 1]!];
      return x.on <= x.off ? [from, ...route, to] : [to, ...route, from];
    };
    const lanes = orderLanes(
      route,
      placed.map((x) => ({ edge: x.edge, points: trip(x) })),
      "bundle",
    );
    const byEdge = new Map(placed.map((x) => [x.edge, x]));
    const members: HighwayMember[] = lanes.map((edge) => memberAt(route, edge, byEdge.get(edge)!.on, byEdge.get(edge)!.off));
    highways.push({ id: `h${highways.length}`, key: `t${highways.length}`, spine: route, lanes, members });
  });
  return tidyPlan(orderAlongRoutes({ highways }, routes));
}
