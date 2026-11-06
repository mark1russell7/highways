import { EPS } from "@mark1russell7/layout-contract";
import { classifySegments, orient2dSign } from "@mark1russell7/predicates";
import {
  bendCount,
  dist,
  frechet,
  inflectionCount,
  polylineLength,
  segmentBoxDistance,
  segmentsCross,
  type Box,
  type Point,
} from "../geom.ts";
import { rng } from "../fixtures.ts";
import { Grid } from "../grid.ts";
import { nodeIndex, type Graph, type Node, type Result } from "../model.ts";

/** The quality of a result. Lower is better for each value except `clearance`. */
export interface Quality {
  /** The length of all drawn lines. A segment that several routes share counts one time. */
  readonly ink: number;
  /** The number of points where two drawn segments cross. */
  readonly crossings: number;
  /** This value is true when `crossings` is an estimate from a sample of the segments. */
  readonly crossingsEstimated: boolean;
  /** The mean number of bends of a route. */
  readonly bends: number;
  /** The mean number of inflections of a route. */
  readonly inflections: number;
  /** The mean distance from a route to the nearest node that is not one of its ends, up to `CLEARANCE_CAP`. */
  readonly clearance: number;
  /** The share of the routes that come closer than 4 units to a node that is not one of their ends. */
  readonly tight: number;
  /** The mean ratio of the length of a route to the distance between its ends. */
  readonly detour: number;
  /** The mean angle, in degrees, between the first or last segment of a route and the normal of the side of its node. */
  readonly plugAngle: number;
}

/** The clearance stops at this distance. */
export const CLEARANCE_CAP = 40;
const TIGHT = 4;
const EXACT_CROSSINGS = 20_000;
const SAMPLE = 2_000;

const key = (p: Point): string => `${Math.round(p.x * 8)},${Math.round(p.y * 8)}`;

/** This function gives the painted segments, one for each distinct pair of ends, and the numbers of the routes that draw each one. */
function paintedSegments(routes: readonly { readonly points: readonly Point[] }[]): { readonly segs: [Point, Point][]; readonly owners: number[][] } {
  const segs: [Point, Point][] = [];
  const owners: number[][] = [];
  const seen = new Map<string, number>();
  routes.forEach((route, n) => {
    const p = route.points;
    for (let i = 1; i < p.length; i++) {
      const ka = key(p[i - 1]!);
      const kb = key(p[i]!);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const at = seen.get(k);
      if (at === undefined) {
        seen.set(k, segs.length);
        segs.push([p[i - 1]!, p[i]!]);
        owners.push([n]);
      } else if (owners[at]![owners[at]!.length - 1] !== n) owners[at]!.push(n);
    }
  });
  return { segs, owners };
}

/** This function measures the quality of a result. */
export function measureQuality(graph: Graph, result: Result): Quality {
  const byId = nodeIndex(graph);
  const nodes = new Grid<Node>(180);
  for (const n of graph.nodes) nodes.add(n, n.box);

  const { segs } = paintedSegments(result.routes);
  let bends = 0;
  let infl = 0;
  let clear = 0;
  let tight = 0;
  let detour = 0;
  let detourN = 0;
  let angle = 0;
  let angleN = 0;
  for (const r of result.routes) {
    const p = r.points;
    bends += bendCount(p);
    infl += inflectionCount(p);
    const ends = endNodes(graph, byId, r.edge);
    let c = CLEARANCE_CAP;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      nodes.querySegment(a, b, c, (n) => {
        if (n !== ends.source && n !== ends.target) c = Math.min(c, segmentBoxDistance(a, b, n.box));
      });
    }
    clear += c;
    if (c < TIGHT) tight++;
    if (p.length >= 2) {
      const d = dist(p[0]!, p[p.length - 1]!);
      if (d > 1) {
        detour += polylineLength(p) / d;
        detourN++;
      }
      for (const [at, next, node] of [
        [p[0]!, p[1]!, ends.source],
        [p[p.length - 1]!, p[p.length - 2]!, ends.target],
      ] as const) {
        if (!node) continue;
        const a = sideAngle(node.box, at, next);
        if (a !== undefined) {
          angle += a;
          angleN++;
        }
      }
    }
  }
  const n = Math.max(1, result.routes.length);
  let ink = 0;
  for (const [a, b] of segs) ink += dist(a, b);
  const [crossings, crossingsEstimated] = countCrossings(segs);
  return {
    ink,
    crossings,
    crossingsEstimated,
    bends: bends / n,
    inflections: infl / n,
    clearance: clear / n,
    tight: tight / n,
    detour: detourN ? detour / detourN : 1,
    plugAngle: angleN ? angle / angleN : 0,
  };
}

interface Ends {
  readonly source: Node | undefined;
  readonly target: Node | undefined;
}

function endNodes(graph: Graph, byId: Map<string, Node>, edgeId: string): Ends {
  const e = edgeIndex(graph).get(edgeId);
  return { source: e && byId.get(e.source.node), target: e && byId.get(e.target.node) };
}

const edgeIndexes = new WeakMap<Graph, Map<string, Graph["edges"][number]>>();
function edgeIndex(graph: Graph): Map<string, Graph["edges"][number]> {
  let m = edgeIndexes.get(graph);
  if (!m) {
    m = new Map();
    for (const e of graph.edges) m.set(e.id, e);
    edgeIndexes.set(graph, m);
  }
  return m;
}

/**
 * This function gives an angle in degrees: the angle between the segment from `at` to `next` and the outward normal.
 * The normal is the normal of the side of the box nearest to `at`. A route that starts inside the box (an interior route) gives no angle.
 */
export function sideAngle(box: Box, at: Point, next: Point): number | undefined {
  const d = [
    [Math.abs(at.y - box.y), 0, -1],
    [Math.abs(at.x - (box.x + box.w)), 1, 0],
    [Math.abs(at.y - (box.y + box.h)), 0, 1],
    [Math.abs(at.x - box.x), -1, 0],
  ].sort((a, b) => a[0]! - b[0]!)[0]!;
  if (d[0]! > 1) return undefined;
  const vx = next.x - at.x;
  const vy = next.y - at.y;
  const l = Math.hypot(vx, vy);
  if (l === 0) return undefined;
  const cos = Math.max(-1, Math.min(1, (vx * d[1]! + vy * d[2]!) / l));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** The options of `countCrossings`. The defaults give the count of `route.crossings`. */
export interface CountCrossingsOptions {
  /** The largest number of segments for a full count. Above it, a sample of 2 000 segments gives an estimate. The default is 20 000. */
  readonly limit?: number;
  /** The seed of the draw of the sample. The default is the number of segments. */
  readonly seed?: number;
}

/**
 * This function counts the crossings of a set of segments with a grid of buckets.
 * Above 20 000 segments, it counts the crossings of a seeded sample of 2 000 segments and scales the count.
 */
export function countCrossings(segs: readonly (readonly [Point, Point])[], options: CountCrossingsOptions = {}): [number, boolean] {
  if (segs.length < 2) return [0, false];
  const len = segs.reduce((s, [a, b]) => s + dist(a, b), 0) / segs.length;
  const grid = new Grid<number>(Math.max(20, len));
  segs.forEach(([a, b], i) => grid.addSegment(i, a, b));
  const exact = segs.length <= (options.limit ?? EXACT_CROSSINGS);
  const R = rng(options.seed ?? segs.length);
  const pick = exact ? segs.map((_, i) => i) : Array.from({ length: SAMPLE }, () => Math.floor(R() * segs.length));
  let count = 0;
  for (const i of pick) {
    const [a, b] = segs[i]!;
    grid.querySegment(a, b, 0, (j) => {
      if (exact && j <= i) return;
      if (j === i) return;
      const [c, d] = segs[j]!;
      if (segmentsCross(a, b, c, d)) count++;
    });
  }
  return exact ? [count, false] : [Math.round((count * segs.length) / (2 * pick.length)), true];
}

/** The change between two results of the same graph: the Fréchet distance between the two routes of each edge. */
export interface Stability {
  readonly mean: number;
  readonly max: number;
  /** The share of the routes that moved more than 1 unit. */
  readonly moved: number;
}

/** This function measures how much the routes changed between two results. */
export function measureStability(before: Result, after: Result): Stability {
  const prev = new Map(before.routes.map((r) => [r.edge, r.points] as const));
  let sum = 0;
  let max = 0;
  let moved = 0;
  let n = 0;
  for (const r of after.routes) {
    const p = prev.get(r.edge);
    if (!p) continue;
    const f = frechet(p, r.points);
    sum += f;
    max = Math.max(max, f);
    if (f > 1) moved++;
    n++;
  }
  return { mean: n ? sum / n : 0, max, moved: n ? moved / n : 0 };
}

/** The crossings between pairs of routes (ROUTE-PAIRS). */
export interface RoutePairCrossings {
  /** The number of crossings between two different routes. A pair that crosses twice counts two. `proper` and `contact` add up to this value. */
  readonly pairs: number;
  /** The crossings where the segments of two routes cross between their vertices. */
  readonly proper: number;
  /** The crossings at a shared vertex, and on a shared stretch that two routes leave on opposite sides. */
  readonly contact: number;
  /** This value is true when the count is an estimate. The estimate comes from a sample of the routes, or `contact` comes from a sample of the pairs. */
  readonly estimated: boolean;
}

/** The options of `routePairCrossings` (BENCH-PAIRS-HEAP). */
export interface RoutePairOptions {
  /**
   * The count reads all routes up to this number of route points. The memory of the count grows with the points.
   * Above the limit, the count reads a seeded sample of the routes and scales the count to all pairs. With no limit, the count reads all routes.
   */
  readonly maxPoints?: number;
  /** The seed of the sample of the routes. The default seed is the number of route points. */
  readonly seed?: number;
}

/** The steps of the grid of `routePairCrossings` in one unit. The grid is the tolerance `EPS` of the contract. */
const PAIR_SNAP = Math.round(1 / EPS);
/** A vertex that lies at most this number of grid steps from a segment is a vertex of that segment. */
const PAIR_ON_SEGMENT = 1;
/** The count reads each pair of routes up to this number of pairs at shared vertices. Above it, the count takes a seeded sample. */
const PAIR_LIMIT = 20_000_000;

/** The routes on the grid: the coordinates of each vertex, and the path of each route as vertex numbers. */
interface SnappedPaths {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  readonly paths: readonly (readonly number[])[];
}

function snapPaths(routes: readonly { readonly points: readonly Point[] }[]): SnappedPaths {
  const ids = new Map<string, number>();
  const xs: number[] = [];
  const ys: number[] = [];
  const paths = routes.map((route) => {
    const path: number[] = [];
    for (const p of route.points) {
      const [x, y] = [Math.round(p.x * PAIR_SNAP), Math.round(p.y * PAIR_SNAP)];
      const k = `${x},${y}`;
      let id = ids.get(k);
      if (id === undefined) {
        id = xs.length;
        ids.set(k, id);
        xs.push(x);
        ys.push(y);
      }
      if (path[path.length - 1] !== id) path.push(id);
    }
    return path;
  });
  return { xs, ys, paths };
}

/** This function adds to each path each vertex on one of its segments. Thus two routes on one stretch share all vertices of the stretch. */
function splitAtVertices({ xs, ys, paths }: SnappedPaths): SnappedPaths {
  const count = xs.length;
  const at = (i: number): Point => ({ x: xs[i]! / PAIR_SNAP, y: ys[i]! / PAIR_SNAP });
  const grid = new Grid<number>(40);
  for (let i = 0; i < count; i++) grid.add(i, { ...at(i), w: 0, h: 0 });
  const cache = new Map<number, readonly number[]>();
  const pad = (2 * PAIR_ON_SEGMENT) / PAIR_SNAP;
  const inner = (u: number, v: number): readonly number[] => {
    const key = u * count + v;
    let out = cache.get(key);
    if (out) return out;
    const [dx, dy] = [xs[v]! - xs[u]!, ys[v]! - ys[u]!];
    const square = dx * dx + dy * dy;
    const limit = PAIR_ON_SEGMENT * Math.sqrt(square);
    const found: [number, number][] = [];
    grid.querySegment(at(u), at(v), pad, (w) => {
      if (w === u || w === v) return;
      const [ex, ey] = [xs[w]! - xs[u]!, ys[w]! - ys[u]!];
      const along = ex * dx + ey * dy;
      if (along > 0 && along < square && Math.abs(dx * ey - dy * ex) <= limit) found.push([along, w]);
    });
    out = found.sort((a, b) => a[0] - b[0]).map((f) => f[1]);
    cache.set(key, out);
    return out;
  };
  const split = paths.map((path) => {
    const out: number[] = path.slice(0, 1);
    for (let i = 1; i < path.length; i++) {
      out.push(...inner(path[i - 1]!, path[i]!), path[i]!);
    }
    return out;
  });
  return { xs, ys, paths: split };
}

/** This function counts the proper crossings of two different routes: each pair of crossing segments, times the routes on each segment. */
function properPairCrossings({ xs, ys, paths }: SnappedPaths): number {
  const count = xs.length;
  const index = new Map<number, number>();
  const atoms: { readonly u: number; readonly v: number; readonly routes: number[] }[] = [];
  paths.forEach((path, route) => {
    for (let i = 1; i < path.length; i++) {
      const [u, v] = path[i - 1]! < path[i]! ? [path[i - 1]!, path[i]!] : [path[i]!, path[i - 1]!];
      const key = u * count + v;
      let a = index.get(key);
      if (a === undefined) {
        a = atoms.length;
        index.set(key, a);
        atoms.push({ u, v, routes: [] });
      }
      atoms[a]!.routes.push(route);
    }
  });
  if (atoms.length < 2) return 0;
  const at = (i: number): Point => ({ x: xs[i]! / PAIR_SNAP, y: ys[i]! / PAIR_SNAP });
  const mean = atoms.reduce((s, a) => s + dist(at(a.u), at(a.v)), 0) / atoms.length;
  const grid = new Grid<number>(Math.max(20, mean));
  atoms.forEach((a, i) => grid.addSegment(i, at(a.u), at(a.v)));
  let total = 0;
  atoms.forEach((s, i) => {
    grid.querySegment(at(s.u), at(s.v), 0, (j) => {
      if (j <= i) return;
      const t = atoms[j]!;
      if (s.u === t.u || s.u === t.v || s.v === t.u || s.v === t.v) return;
      const relation = classifySegments(xs[s.u]!, ys[s.u]!, xs[s.v]!, ys[s.v]!, xs[t.u]!, ys[t.u]!, xs[t.v]!, ys[t.v]!).relation;
      if (relation === "cross") total += s.routes.length * t.routes.length - shared(s.routes, t.routes);
    });
  });
  return total;
}

/** This function gives the pairs of one route on both sorted lists. Each route adds its count on the first list times its count on the second list. */
function shared(a: readonly number[], b: readonly number[]): number {
  let [i, j, sum] = [0, 0, 0];
  while (i < a.length && j < b.length) {
    if (a[i]! < b[j]!) i++;
    else if (a[i]! > b[j]!) j++;
    else {
      const route = a[i]!;
      let [n, m] = [0, 0];
      while (a[i] === route) (i++, n++);
      while (b[j] === route) (j++, m++);
      sum += n * m;
    }
  }
  return sum;
}

/**
 * This function counts the crossings of two different routes at the vertices that they share.
 * Each interior vertex of a route is one pass, with the vertex before it and the vertex after it. A route does not cross at its own end.
 */
function contactPairCrossings({ xs, ys, paths }: SnappedPaths): { readonly total: number; readonly estimated: boolean } {
  const facing = (v: number, p: number, q: number): boolean => (xs[p]! - xs[v]!) * (xs[q]! - xs[v]!) + (ys[p]! - ys[v]!) * (ys[q]! - ys[v]!) > 0;
  const turn = (v: number, p: number, q: number): number => orient2dSign(xs[v]!, ys[v]!, xs[p]!, ys[p]!, xs[q]!, ys[q]!);
  // The side of the ray from `v` to `r`, for a path through `v`: 1 on the side from `out` to `back` in turn order, -1 on the other side, 0 on the path.
  const side = (back: number, v: number, out: number, r: number): number => {
    const a = turn(v, out, r);
    const b = turn(v, r, back);
    if ((a === 0 && facing(v, out, r)) || (b === 0 && facing(v, back, r))) return 0;
    const c = turn(v, out, back);
    if (c > 0) return a > 0 && b > 0 ? 1 : -1;
    if (c < 0) return a > 0 || b > 0 ? 1 : -1;
    if (facing(v, back, out)) return 0;
    return a > 0 ? 1 : -1;
  };
  // This function walks the shared stretch from the pass `i` of the route `a` and the pass `j` of the route `b`, which goes in the direction `way`.
  const stretch = (a: readonly number[], i: number, b: readonly number[], j: number, way: 1 | -1): number => {
    const first = side(a[i - 1]!, a[i]!, a[i + 1]!, b[j - way]!);
    if (first === 0) return 0;
    let t = 1;
    while (a[i + t + 1] !== undefined && a[i + t + 1] === b[j + way * (t + 1)]) t++;
    const [next, other] = [a[i + t + 1], b[j + way * (t + 1)]];
    if (next === undefined || other === undefined) return 0;
    const last = side(a[i + t - 1]!, a[i + t]!, next, other);
    return last !== 0 && last !== first ? 1 : 0;
  };

  interface Group {
    readonly back: number;
    readonly out: number;
    readonly routes: number[];
    readonly at: number[];
  }
  const count = xs.length;
  const groups = new Map<number, Map<number, Group>>();
  paths.forEach((path, route) => {
    for (let i = 1; i < path.length - 1; i++) {
      const [back, v, out] = [path[i - 1]!, path[i]!, path[i + 1]!];
      let of = groups.get(v);
      if (!of) groups.set(v, (of = new Map()));
      const key = back * count + out;
      let g = of.get(key);
      if (!g) of.set(key, (g = { back, out, routes: [], at: [] }));
      g.routes.push(route);
      g.at.push(i);
    }
  });

  const isStretch = (g: Group, h: Group): boolean => g.out === h.out || (g.back !== h.back && (g.out === h.back) !== (g.back === h.out));
  let reads = 0;
  for (const of of groups.values()) {
    const list = [...of.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (isStretch(list[i]!, list[j]!)) reads += list[i]!.routes.length * list[j]!.routes.length;
      }
    }
  }
  const rate = reads > PAIR_LIMIT ? PAIR_LIMIT / reads : 1;
  const random = rng(reads);
  // This function adds the stretches of the groups `g` and `h`. The route of `g` is the route that the walk follows.
  const walk = (g: Group, h: Group, way: 1 | -1): number => {
    const one = (x: number, y: number): number => {
      const [ra, rb] = [g.routes[x]!, h.routes[y]!];
      // A stretch of two opposite routes shows at both of its ends, so the route with the lower number walks.
      if (ra === rb || (way === -1 && ra > rb)) return 0;
      return stretch(paths[ra]!, g.at[x]!, paths[rb]!, h.at[y]!, way);
    };
    const size = g.routes.length * h.routes.length;
    let sum = 0;
    if (rate === 1) {
      for (let x = 0; x < g.routes.length; x++) for (let y = 0; y < h.routes.length; y++) sum += one(x, y);
      return sum;
    }
    const draws = Math.ceil(size * rate);
    for (let d = 0; d < draws; d++) sum += one(Math.floor(random() * g.routes.length), Math.floor(random() * h.routes.length));
    return (sum * size) / draws;
  };

  let total = 0;
  for (const [v, of] of groups) {
    const list = [...of.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [g, h] = [list[i]!, list[j]!];
        if (g.back === h.back) continue;
        if (g.out === h.out) total += walk(g, h, 1);
        else if (g.out === h.back && g.back === h.out) continue;
        else if (g.out === h.back) total += walk(g, h, -1);
        else if (g.back === h.out) total += walk(h, g, -1);
        else {
          const first = side(g.back, v, g.out, h.back);
          const last = side(g.back, v, g.out, h.out);
          if (first !== 0 && last !== 0 && first !== last) total += g.routes.length * h.routes.length - shared(g.routes, h.routes);
        }
      }
    }
  }
  return { total: rate === 1 ? total : Math.round(total), estimated: rate !== 1 };
}

/**
 * This function counts the crossings between pairs of routes on the grid `EPS`. `measureQuality` keeps one segment for each pair of ends, so its `crossings` counts two trunks once.
 * This count multiplies a crossing of two trunks by their routes. It also counts two routes that cross at a shared vertex, or that share a stretch and leave it on opposite sides.
 * A crossing of a route with itself does not count.
 *
 * The count of a set of routes is the sum of the counts of its pairs. So above `options.maxPoints`, the count of a uniform sample of `m` routes
 * times `n (n - 1) / (m (m - 1))` is an estimate with no bias, for `n` routes.
 */
export function routePairCrossings(routes: readonly { readonly points: readonly Point[] }[], options: RoutePairOptions = {}): RoutePairCrossings {
  const points = routes.reduce((sum, r) => sum + r.points.length, 0);
  const limit = options.maxPoints;
  if (limit !== undefined && points > limit && routes.length > 2) {
    const n = routes.length;
    const m = Math.min(n, Math.max(2, Math.floor((n * limit) / points)));
    const part = countRoutePairs(sampleRoutes(routes, m, options.seed ?? points));
    const scale = (n * (n - 1)) / (m * (m - 1));
    const [proper, contact] = [Math.round(part.proper * scale), Math.round(part.contact * scale)];
    return { pairs: proper + contact, proper, contact, estimated: m < n || part.estimated };
  }
  return countRoutePairs(routes);
}

/** This function counts the crossings between pairs of the routes, with no sample of the routes. */
function countRoutePairs(routes: readonly { readonly points: readonly Point[] }[]): RoutePairCrossings {
  const paths = splitAtVertices(snapPaths(routes));
  const proper = properPairCrossings(paths);
  const contact = contactPairCrossings(paths);
  return { pairs: proper + contact.total, proper, contact: contact.total, estimated: contact.estimated };
}

/** This function gives a seeded uniform sample of `m` of the routes, with no route two times, in the order of the routes. */
function sampleRoutes<R>(routes: readonly R[], m: number, seed: number): R[] {
  const random = rng(seed);
  const order = routes.map((_, i) => i);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(random() * (order.length - i));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order
    .slice(0, m)
    .sort((a, b) => a - b)
    .map((i) => routes[i]!);
}

/**
 * The painted crossings that the pair count can leave out (R1-PAIRS-RELATION).
 * The relation is `crossings - self - touch <= pairs`, for the routes of one result with no sample.
 */
export interface PaintedOutsidePairs {
  /** The painted crossings, with no sample. Up to 20 000 segments, this value equals `crossings` of `measureQuality`. */
  readonly crossings: number;
  /** The crossings of two segments that one route alone draws. The pair count leaves out a route that crosses itself. */
  readonly self: number;
  /** The other crossings that are not strict on the grid `EPS`: the segments touch, or an end of one lies on the other. */
  readonly touch: number;
}

/** This function tells if the vertex `w` lies on the open segment from `u` to `v`, by the rule of `splitAtVertices`. All values are grid steps. */
function onGridSegment(wx: number, wy: number, ux: number, uy: number, vx: number, vy: number): boolean {
  const [dx, dy] = [vx - ux, vy - uy];
  const [ex, ey] = [wx - ux, wy - uy];
  const along = ex * dx + ey * dy;
  const square = dx * dx + dy * dy;
  return along > 0 && along < square && Math.abs(dx * ey - dy * ex) <= PAIR_ON_SEGMENT * Math.sqrt(square);
}

/** This function tells if two segments cross strictly on the grid `EPS`, with no end of one on the other. */
function crossesOnGrid(s: readonly [Point, Point], t: readonly [Point, Point]): boolean {
  const [ax, ay, bx, by, cx, cy, dx, dy] = [s[0].x, s[0].y, s[1].x, s[1].y, t[0].x, t[0].y, t[1].x, t[1].y].map((v) => Math.round(v * PAIR_SNAP)) as [number, number, number, number, number, number, number, number];
  if (classifySegments(ax, ay, bx, by, cx, cy, dx, dy).relation !== "cross") return false;
  return !onGridSegment(cx, cy, ax, ay, bx, by) && !onGridSegment(dx, dy, ax, ay, bx, by) && !onGridSegment(ax, ay, cx, cy, dx, dy) && !onGridSegment(bx, by, cx, cy, dx, dy);
}

/** This function reads each painted crossing and gives the two classes that the pair count can leave out. */
export function paintedOutsidePairs(routes: readonly { readonly points: readonly Point[] }[]): PaintedOutsidePairs {
  const { segs, owners } = paintedSegments(routes);
  if (segs.length < 2) return { crossings: 0, self: 0, touch: 0 };
  const grid = new Grid<number>(Math.max(20, segs.reduce((sum, [a, b]) => sum + dist(a, b), 0) / segs.length));
  segs.forEach(([a, b], i) => grid.addSegment(i, a, b));
  let [crossings, self, touch] = [0, 0, 0];
  segs.forEach((s, i) => {
    grid.querySegment(s[0], s[1], 0, (j) => {
      if (j <= i || !segmentsCross(s[0], s[1], segs[j]![0], segs[j]![1])) return;
      crossings++;
      if (owners[i]!.length === 1 && owners[j]!.length === 1 && owners[i]![0] === owners[j]![0]) self++;
      else if (!crossesOnGrid(s, segs[j]!)) touch++;
    });
  });
  return { crossings, self, touch };
}
