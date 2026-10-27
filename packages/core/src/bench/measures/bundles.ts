import { dist, polylineLength } from "../../geom.ts";
import { rng } from "../../fixtures.ts";
import type { Graph, Route } from "../../model.ts";
import { drawnSegments, segmentKey } from "./routes.ts";

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
