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
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  // The keys of the drawn segments of each route, and the edges of each key.
  const keysOf = new Map<string, string[]>();
  const edgesOf = new Map<string, string[]>();
  for (const r of routes) {
    if (!edges.has(r.edge)) continue;
    const own = new Set<string>();
    for (let i = 1; i < r.points.length; i++) {
      const k = segmentKey(r.points[i - 1]!, r.points[i]!);
      if (k === undefined || own.has(k)) continue;
      own.add(k);
      const list = edgesOf.get(k);
      if (list) list.push(r.edge);
      else edgesOf.set(k, [r.edge]);
    }
    keysOf.set(r.edge, [...own]);
  }
  const incident = new Map<string, string[]>();
  const linked = new Set<string>();
  for (const e of graph.edges) {
    for (const v of [e.source.node, e.target.node]) {
      const list = incident.get(v);
      if (list) list.push(e.id);
      else incident.set(v, [e.id]);
    }
    linked.add(`${e.source.node}\u0000${e.target.node}`);
    linked.add(`${e.target.node}\u0000${e.source.node}`);
  }
  const exact = graph.nodes.length <= (options.exact ?? 1000);
  const R = rng(options.seed ?? 1);
  const ids = graph.nodes.map((n) => n.id);
  const pick = exact ? ids : Array.from({ length: options.sample ?? 2000 }, () => ids[Math.floor(R() * ids.length)]!);
  let all = 0;
  let wrong = 0;
  for (const v of pick) {
    const near = new Set<string>();
    const keys = new Set<string>();
    for (const e of incident.get(v) ?? []) {
      for (const k of keysOf.get(e) ?? []) {
        if (keys.has(k)) continue;
        keys.add(k);
        for (const f of edgesOf.get(k)!) {
          const g = edges.get(f)!;
          if (g.source.node !== v) near.add(g.source.node);
          if (g.target.node !== v) near.add(g.target.node);
        }
      }
    }
    all += near.size;
    for (const w of near) if (!linked.has(`${v}\u0000${w}`)) wrong++;
  }
  return { value: all ? wrong / all : 0, estimated: !exact };
}
