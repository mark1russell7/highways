import { dist, type Point } from "./geom.ts";
import type { Result, Route } from "./model.ts";

/** A piece of drawn way. A shared segment carries several edges, in lane order. A private segment carries one edge. */
export interface Segment {
  readonly id: string;
  readonly points: readonly Point[];
  /** The edges in lane order. Lane 0 is on the left of the segment, from its first point to its last. The y axis points down. */
  readonly edges: readonly string[];
  /** The number of edges. A renderer shows it on a fat edge. */
  readonly count: number;
}

/** One step of a path: a segment, the way through it, and the lane of the edge in it. */
export interface SegmentRef {
  readonly segment: string;
  /** This value is true when the edge goes from the last point of the segment to its first point. */
  readonly reverse: boolean;
  readonly lane: number;
}

/** The route of one edge as a list of segments. */
export interface Path {
  readonly edge: string;
  readonly segments: readonly SegmentRef[];
}

/** The routes of a result as shared geometry. A renderer can draw each segment one time, with a count. */
export interface SegmentGraph {
  readonly segments: readonly Segment[];
  readonly paths: readonly Path[];
}

const SAME = 1e-6;

/** This function gives the index where `p` holds the points of `part` in a row, from `from` on, or -1. */
function indexOf(p: readonly Point[], part: readonly Point[], from: number): number {
  for (let i = from; i + part.length <= p.length; i++) {
    let ok = true;
    for (let j = 0; ok && j < part.length; j++) ok = dist(p[i + j]!, part[j]!) <= SAME;
    if (ok) return i;
  }
  return -1;
}

/**
 * This function breaks each route into segments. The runs and the trunks of the bundles become shared segments.
 * The other parts of each route become private segments. The segments of a path, in order, give the points of its route again.
 */
export function segmentsOf(result: Result): SegmentGraph {
  const shared = [
    ...(result.runs ?? []).map((r) => ({ id: r.id, points: r.points, edges: r.edges })),
    ...(result.bundles ?? []).map((b) => ({ id: b.id, points: b.trunk, edges: b.edges })),
  ].filter((s) => s.points.length >= 2);
  const onEdge = new Map<string, { id: string; points: readonly Point[]; lane: number }[]>();
  for (const s of shared) {
    s.edges.forEach((edge, lane) => {
      const list = onEdge.get(edge);
      if (list) list.push({ id: s.id, points: s.points, lane });
      else onEdge.set(edge, [{ id: s.id, points: s.points, lane }]);
    });
  }
  const segments: Segment[] = shared.map((s) => ({ id: s.id, points: s.points, edges: s.edges, count: s.edges.length }));
  const paths: Path[] = [];
  for (const route of result.routes) {
    const p = route.points;
    // The place of each shared segment in the route, in the order of the route.
    const found: { at: number; end: number; ref: SegmentRef }[] = [];
    for (const s of onEdge.get(route.edge) ?? []) {
      let at = indexOf(p, s.points, 0);
      let reverse = false;
      if (at < 0) {
        at = indexOf(p, [...s.points].reverse(), 0);
        reverse = true;
      }
      if (at >= 0) found.push({ at, end: at + s.points.length - 1, ref: { segment: s.id, reverse, lane: s.lane } });
    }
    found.sort((a, b) => a.at - b.at);
    const refs: SegmentRef[] = [];
    let i = 0;
    const own = (to: number): void => {
      if (to <= i) return;
      const id = `${route.edge}/${refs.length}`;
      segments.push({ id, points: p.slice(i, to + 1), edges: [route.edge], count: 1 });
      refs.push({ segment: id, reverse: false, lane: 0 });
    };
    for (const f of found) {
      if (f.at < i) continue;
      own(f.at);
      refs.push(f.ref);
      i = f.end;
    }
    own(p.length - 1);
    paths.push({ edge: route.edge, segments: refs });
  }
  return { segments, paths };
}

/** This function gives the points of a path, with the segments in the order and the way of the path. */
export function pathPoints(graph: SegmentGraph, path: Path): Point[] {
  const byId = new Map(graph.segments.map((s) => [s.id, s]));
  const out: Point[] = [];
  for (const ref of path.segments) {
    const s = byId.get(ref.segment);
    if (!s) continue;
    const pts = ref.reverse ? [...s.points].reverse() : s.points;
    for (const q of pts) if (out.length === 0 || dist(q, out[out.length - 1]!) > SAME) out.push(q);
  }
  return out;
}

/**
 * This function moves each point of a polyline by `d` to the left, in a frame with the y axis down.
 * At an inner point, it moves along the bisector, at most 2 × `d` far.
 */
export function offsetPolyline(p: readonly Point[], d: number): Point[] {
  if (d === 0 || p.length < 2) return [...p];
  const normals: Point[] = [];
  for (let i = 1; i < p.length; i++) {
    const dx = p[i]!.x - p[i - 1]!.x;
    const dy = p[i]!.y - p[i - 1]!.y;
    const l = Math.hypot(dx, dy);
    normals.push(l > 0 ? { x: dy / l, y: -dx / l } : (normals[normals.length - 1] ?? { x: 0, y: 0 }));
  }
  return p.map((q, i) => {
    const a = normals[Math.max(0, i - 1)]!;
    const b = normals[Math.min(normals.length - 1, i)]!;
    const mx = a.x + b.x;
    const my = a.y + b.y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-9) return { x: q.x + a.x * d, y: q.y + a.y * d };
    const cos = (mx * a.x + my * a.y) / ml;
    const k = Math.min(2, 1 / Math.max(cos, 1e-9)) * d;
    return { x: q.x + (mx / ml) * k, y: q.y + (my / ml) * k };
  });
}

/** The options of `pullApart`. */
export interface PullApartOptions {
  /** The distance between two lanes. */
  readonly spacing: number;
  /** The largest width of a segment, from its outer lane on the left to its outer lane on the right. */
  readonly maxWidth: number;
}

/**
 * This function pulls the lanes of each shared segment apart, and gives a route for each edge.
 * The lanes keep the lane order, so they do not cross in a segment. The two ends of each route stay at their plugs.
 */
export function pullApart(graph: SegmentGraph, options: PullApartOptions): Route[] {
  return lanePaths(graph, (s) => (s.count > 1 ? Math.min(options.spacing, options.maxWidth / (s.count - 1)) : 0));
}

/** This function gives the key of a shared run: the ids of its edges, sorted and joined with commas. */
export function runKey(edges: readonly string[]): string {
  return [...edges].sort().join(",");
}

/**
 * This function opens the shared segments whose key is in `open`: each edge of an open segment gets its own lane.
 * The lanes are `laneWidth` apart, and an open segment is at most `maxWidth` wide. The other segments stay as one way.
 *
 * Lane 0 is on the left of the segment, from its first point to its last, with the y axis down.
 * The function takes a result or its segments. It gives a route for each edge, with the ends at their plugs.
 * The key of a segment is `runKey` of its edges.
 */
export function laneRoutes(source: Result | SegmentGraph, open: ReadonlySet<string>, laneWidth: number, maxWidth: number = Infinity): Route[] {
  const graph = "paths" in source ? source : segmentsOf(source);
  if (open.size === 0) return graph.paths.map((path) => ({ edge: path.edge, points: pathPoints(graph, path) }));
  return lanePaths(graph, (s) => (s.count > 1 && open.has(runKey(s.edges)) ? Math.min(laneWidth, maxWidth / (s.count - 1)) : 0));
}

/** This function gives the route of each path, with the lanes of each segment at the spacing that `spacingOf` gives. */
function lanePaths(graph: SegmentGraph, spacingOf: (s: Segment) => number): Route[] {
  const byId = new Map(graph.segments.map((s) => [s.id, s]));
  const routes: Route[] = [];
  for (const path of graph.paths) {
    const ends = pathPoints(graph, path);
    const out: Point[] = [];
    for (const ref of path.segments) {
      const s = byId.get(ref.segment);
      if (!s) continue;
      const spacing = spacingOf(s);
      const moved = offsetPolyline(s.points, ((s.count - 1) / 2 - ref.lane) * spacing);
      for (const q of ref.reverse ? moved.reverse() : moved) if (out.length === 0 || dist(q, out[out.length - 1]!) > SAME) out.push(q);
    }
    if (out.length >= 2 && ends.length >= 2) {
      out[0] = ends[0]!;
      out[out.length - 1] = ends[ends.length - 1]!;
    }
    routes.push({ edge: path.edge, points: out });
  }
  return routes;
}

/** The angle, from -π to π, of the turn at `base` from the direction `from` → `base` to the point `to`. */
function turn(from: Point, base: Point, to: Point): number {
  const dx = base.x - from.x;
  const dy = base.y - from.y;
  const vx = to.x - base.x;
  const vy = to.y - base.y;
  return Math.atan2(dx * vy - dy * vx, dx * vx + dy * vy);
}

/**
 * This function gives the lane order of the edges on a shared way `run` (metro-line order). Two routes go on together
 * past the last point of the run until they part. The route that turns more to the left there gets the lane more to the left.
 * Two routes can part only before the first point. Then the route that comes from more to the left gets the lane more to the left.
 * A route that does not hold the run goes last.
 */
export function orderLanes(run: readonly Point[], routes: readonly Route[]): string[] {
  const placed: { edge: string; p: readonly Point[]; s: number; e: number }[] = [];
  const lost: string[] = [];
  for (const r of routes) {
    let at = indexOf(r.points, run, 0);
    if (at >= 0) placed.push({ edge: r.edge, p: r.points, s: at, e: at + run.length - 1 });
    else {
      const p = [...r.points].reverse();
      at = indexOf(p, run, 0);
      if (at >= 0) placed.push({ edge: r.edge, p, s: at, e: at + run.length - 1 });
      else lost.push(r.edge);
    }
  }
  const same = (a: Point, b: Point): boolean => dist(a, b) <= SAME;
  placed.sort((P, Q) => {
    for (let j = 1; ; j++) {
      const a = P.p[P.e + j];
      const b = Q.p[Q.e + j];
      if (a === undefined || b === undefined) break;
      if (!same(a, b)) {
        const d = turn(P.p[P.e + j - 2]!, P.p[P.e + j - 1]!, a) - turn(P.p[P.e + j - 2]!, P.p[P.e + j - 1]!, b);
        if (d !== 0) return d;
        break;
      }
    }
    for (let j = 1; ; j++) {
      const a = P.p[P.s - j];
      const b = Q.p[Q.s - j];
      if (a === undefined || b === undefined) break;
      if (!same(a, b)) {
        // Seen backward, the left side is the right side. Thus the order turns around.
        const d = turn(P.p[P.s - j + 2]!, P.p[P.s - j + 1]!, b) - turn(P.p[P.s - j + 2]!, P.p[P.s - j + 1]!, a);
        if (d !== 0) return d;
        break;
      }
    }
    return P.edge < Q.edge ? -1 : P.edge > Q.edge ? 1 : 0;
  });
  return [...placed.map((x) => x.edge), ...lost.sort()];
}
