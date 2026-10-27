import { dist, polylineLength, type Point } from "../../geom.ts";
import { rng } from "../../fixtures.ts";
import type { Graph, Result, Route } from "../../model.ts";
import { drawnSegments, segmentKey } from "./routes.ts";
import { quantile } from "./stats.ts";

/**
 * This function gives the share of the ink that shared segments save (B1 of MEAS0): `inkSaved = 1 - ink(S) / Σ_e L(r_e)`.
 * `ink(S)` counts a shared segment one time, as `measureQuality` does. The scale is 0 to 1, and higher is better. The cost is `n log n`.
 */
export function inkSaved(routes: readonly Route[]): number {
  let total = 0;
  for (const r of routes) total += polylineLength(r.points);
  if (total <= 0) return 0;
  let ink = 0;
  for (const [a, b] of drawnSegments(routes)) ink += dist(a, b);
  return Math.max(0, 1 - ink / total);
}

/** The ambiguity of a result (B4 of MEAS0). */
export interface Ambiguity {
  /** The share of false neighbours, from 0 to 1. Lower is better. */
  readonly value: number;
  /** This value is true when the value comes from a sample of the nodes. */
  readonly estimated: boolean;
}

/** The options of `ambiguity`. */
export interface AmbiguityOptions {
  /** Up to this number of nodes, the function examines each node. The default is 1000. */
  readonly exact?: number;
  /** Above `exact` nodes, the function examines this number of nodes from a seeded sample. The default is 2000. */
  readonly sample?: number;
  /** The seed of the sample. The default is 1. */
  readonly seed?: number;
}

/**
 * This function measures the ambiguity of the routes (B4 of MEAS0), with one step of neighbours.
 * `N(v)` holds the nodes whose routes share a drawn segment with a route of `v`.
 * `amb = Σ_v count(w in N(v) : no edge v-w) / Σ_v count(N(v))`. The cost is quadratic, so a seeded sample serves above `exact` nodes.
 */
export function ambiguity(graph: Graph, routes: readonly Route[], options: AmbiguityOptions = {}): Ambiguity {
  const n = graph.nodes.length;
  const index = new Map(graph.nodes.map((v, i) => [v.id, i] as const));
  const ends = new Map<string, readonly [number, number]>();
  for (const e of graph.edges) {
    const s = index.get(e.source.node);
    const t = index.get(e.target.node);
    if (s !== undefined && t !== undefined) ends.set(e.id, [s, t]);
  }
  // Each drawn segment gets a number. `keysOf` holds the segments of each edge, and `nodesOf` the distinct end nodes of the edges of each segment.
  const keyIds = new Map<string, number>();
  const nodesOf: number[][] = [];
  const keysOf = new Map<string, number[]>();
  for (const r of routes) {
    const end = ends.get(r.edge);
    if (!end) continue;
    const own: number[] = [];
    for (let i = 1; i < r.points.length; i++) {
      const k = segmentKey(r.points[i - 1]!, r.points[i]!);
      if (k === undefined) continue;
      let id = keyIds.get(k);
      if (id === undefined) {
        id = nodesOf.length;
        keyIds.set(k, id);
        nodesOf.push([]);
      }
      if (own.includes(id)) continue;
      own.push(id);
      nodesOf[id]!.push(end[0], end[1]);
    }
    keysOf.set(r.edge, own);
  }
  const mark = new Int32Array(n).fill(-1);
  nodesOf.forEach((list, k) => {
    let j = 0;
    for (const v of list)
      if (mark[v] !== k) {
        mark[v] = k;
        list[j++] = v;
      }
    list.length = j;
  });
  const incident: string[][] = Array.from({ length: n }, () => []);
  const adjacent: number[][] = Array.from({ length: n }, () => []);
  for (const e of graph.edges) {
    const end = ends.get(e.id);
    if (!end) continue;
    incident[end[0]]!.push(e.id);
    incident[end[1]]!.push(e.id);
    adjacent[end[0]]!.push(end[1]);
    adjacent[end[1]]!.push(end[0]);
  }
  const exact = n <= (options.exact ?? 1000);
  const R = rng(options.seed ?? 1);
  const pick = exact ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: options.sample ?? 2000 }, () => Math.floor(R() * n));
  // The stamps mark the segments, the near nodes and the neighbours of the current node, with no new set for each node.
  const keyStamp = new Int32Array(nodesOf.length).fill(-1);
  const nearStamp = new Int32Array(n).fill(-1);
  const linkStamp = new Int32Array(n).fill(-1);
  let all = 0;
  let wrong = 0;
  pick.forEach((v, step) => {
    for (const w of adjacent[v]!) linkStamp[w] = step;
    nearStamp[v] = step;
    for (const e of incident[v]!)
      for (const k of keysOf.get(e) ?? []) {
        if (keyStamp[k] === step) continue;
        keyStamp[k] = step;
        for (const w of nodesOf[k]!) {
          if (nearStamp[w] === step) continue;
          nearStamp[w] = step;
          all++;
          if (linkStamp[w] !== step) wrong++;
        }
      }
  });
  return { value: all ? wrong / all : 0, estimated: !exact };
}

/** The drawn segments of each route, as keys, in the order of its points. A segment shorter than the grain of `segmentKey` has no key. */
function routeKeys(routes: readonly Route[]): { readonly keys: Map<string, string[]>; readonly users: Map<string, Set<string>> } {
  const keys = new Map<string, string[]>();
  const users = new Map<string, Set<string>>();
  for (const r of routes) {
    const own: string[] = [];
    for (let i = 1; i < r.points.length; i++) {
      const k = segmentKey(r.points[i - 1]!, r.points[i]!);
      if (k === undefined) continue;
      own.push(k);
      let set = users.get(k);
      if (!set) users.set(k, (set = new Set()));
      set.add(r.edge);
    }
    keys.set(r.edge, own);
  }
  return { keys, users };
}

/**
 * This function gives the bundled share of a result (B2 of MEAS0): `count(e : e is in a run or a bundle) / m`.
 * An edge is also in a bundle when its route shares a drawn segment with the route of another edge. Thus a router without `runs` and `bundles` gets a value too.
 * The scale is 0 to 1. A higher value is better only in context. The cost is linear.
 */
export function bundledShare(result: Result): number {
  const routes = result.routes;
  if (routes.length === 0) return 0;
  const shared = new Set<string>();
  for (const run of result.runs ?? []) for (const e of run.edges) shared.add(e);
  for (const b of result.bundles ?? []) if (b.edges.length > 1) for (const e of b.edges) shared.add(e);
  const { keys, users } = routeKeys(routes);
  for (const [edge, own] of keys) if (own.some((k) => (users.get(k)?.size ?? 0) > 1)) shared.add(edge);
  let count = 0;
  for (const r of routes) if (shared.has(r.edge)) count++;
  return count / routes.length;
}

/** The bundle stretch of the routes against base routes (B3 of MEAS0). */
export interface BundleStretch {
  /** The median of `st(e) = L(r_e) / L(r*_e)`. A value of 1 is the length of the base route. Lower is better. */
  readonly median: number;
  /** The `0.95` quantile of `st(e)`: the tail of long detours that the bundles add. */
  readonly q95: number;
  /** The number of edges with a route in both lists and a base route longer than 1 unit. */
  readonly edges: number;
}

/**
 * This function gives the bundle stretch (B3 of MEAS0): `st(e) = L(r_e) / L(r*_e)` for each edge, with `r*_e` the base route of the edge.
 * The base routes are the routes of `corners` on the same input. An edge without a base route, or with a base route of 1 unit or less, does not count.
 * The cost is an extra run of the base router, and then linear.
 */
export function bundleStretch(routes: readonly Route[], base: readonly Route[]): BundleStretch {
  const baseLength = new Map<string, number>();
  for (const r of base) baseLength.set(r.edge, polylineLength(r.points));
  const st: number[] = [];
  for (const r of routes) {
    const b = baseLength.get(r.edge);
    if (b === undefined || b <= 1 || r.points.length < 2) continue;
    st.push(polylineLength(r.points) / b);
  }
  if (st.length === 0) return { median: 1, q95: 1, edges: 0 };
  return { median: quantile(st, 0.5), q95: quantile(st, 0.95), edges: st.length };
}

/**
 * This function gives the merge angle of the routes (B6 of MEAS0): the largest turn of a lane where it joins or leaves a run, in degrees.
 * A run is a drawn segment that the routes of two edges or more share. A route joins or leaves a run at a vertex where the edges on its segment change.
 * One of the two segments at that vertex has two edges or more. The turn is the angle between the two segments.
 * Routes without a shared segment give 0. The scale is 0 to 180 degrees, and lower is better. The cost is linear.
 */
export function mergeAngle(routes: readonly Route[]): number {
  const { users } = routeKeys(routes);
  const sig = new Map<string, string>();
  for (const [k, set] of users) sig.set(k, [...set].sort().join("\u0000"));
  let max = 0;
  for (const r of routes) {
    // The vertices of the route, with each segment that has no key dropped.
    let prev: { readonly k: string; readonly a: Point; readonly b: Point } | undefined;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]!;
      const b = r.points[i]!;
      const k = segmentKey(a, b);
      if (k === undefined) continue;
      if (prev && sig.get(prev.k) !== sig.get(k) && ((users.get(prev.k)?.size ?? 0) > 1 || (users.get(k)?.size ?? 0) > 1)) {
        const ux = prev.b.x - prev.a.x;
        const uy = prev.b.y - prev.a.y;
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
        max = Math.max(max, (turn * 180) / Math.PI);
      }
      prev = { k, a, b };
    }
  }
  return max;
}
