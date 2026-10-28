import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, type Point } from "../../geom.ts";
import { groupedPlan, weberPoint, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `link-communities` (HWY-030 of the note on highways). */
export interface LinkCommunityOptions {
  /** The cut of the tree of the edges. The value 0 cuts at the best partition density. A value above 0 keeps the joins with this similarity or more. The default is 0. */
  readonly threshold: number;
  /** A community with this number of edges or more gets highways, after the check of the geometry. The default is 2. */
  readonly minSize: number;
  /** The largest distance of an end of an edge to the Weber point of its end of the community, in units of the board. The default is 6. */
  readonly spread: number;
  /** The spine of each community. The default is `shared`. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `link-communities`. */
export const LINK_COMMUNITY_DEFAULTS: Readonly<LinkCommunityOptions> = Object.freeze({ threshold: 0, minSize: 2, spread: 6, spine: "shared" });

/** One pair of edges with a common node, and its similarity. */
interface EdgePair {
  readonly e: number;
  readonly f: number;
  readonly s: number;
}

/** The ends of one edge as node indices. */
export interface LinkEdge {
  readonly u: number;
  readonly v: number;
}

/**
 * This function gives the similarity of each pair of edges with a common node `k` (Ahn, Bagrow and Lehmann 2010).
 * For the edges `(i, k)` and `(j, k)`, the value is `|N+(i) ∩ N+(j)| / |N+(i) ∪ N+(j)|`. `N+(i)` is the node `i` and its neighbours.
 * Two parallel edges get the value 1. A loop has no pair.
 */
function edgePairs(n: number, edges: readonly LinkEdge[]): EdgePair[] {
  const near: Set<number>[] = Array.from({ length: n }, (_, i) => new Set([i]));
  const at: number[][] = Array.from({ length: n }, () => []);
  edges.forEach(({ u, v }, e) => {
    if (u === v) return;
    near[u]!.add(v);
    near[v]!.add(u);
    at[u]!.push(e);
    at[v]!.push(e);
  });
  const jaccard = (i: number, j: number): number => {
    const a = near[i]!;
    const b = near[j]!;
    let both = 0;
    for (const x of a) if (b.has(x)) both++;
    return both / (a.size + b.size - both);
  };
  const out = new Map<string, EdgePair>();
  for (let k = 0; k < n; k++) {
    const list = at[k]!;
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        const e = Math.min(list[x]!, list[y]!);
        const f = Math.max(list[x]!, list[y]!);
        if (e === f) continue;
        const key = `${e},${f}`;
        if (out.has(key)) continue;
        const oe = edges[e]!.u === k ? edges[e]!.v : edges[e]!.u;
        const of = edges[f]!.u === k ? edges[f]!.v : edges[f]!.u;
        out.set(key, { e, f, s: oe === of ? 1 : jaccard(oe, of) });
      }
  }
  return [...out.values()].sort((p, q) => q.s - p.s || p.e - q.e || p.f - q.f);
}

/**
 * This function gives the link communities of the edges: the single linkage of the edges by their similarity.
 * With `threshold` 0, the cut is at the level of the best partition density `D = (2/M) Σ m_c (m_c - n_c + 1) / ((n_c - 2)(n_c - 1))`.
 * When the best `D` is above 0, the first level with it applies. When it is 0 (a forest), the last level applies.
 * The result is the community of each edge, as the index of an edge of the community. A loop is alone.
 */
export function linkCommunities(n: number, edges: readonly LinkEdge[], threshold: number): Int32Array {
  const m = edges.length;
  const pairs = edgePairs(n, edges);
  const parent = new Int32Array(m);
  for (let i = 0; i < m; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  let cut = threshold;
  if (!(threshold > 0)) {
    // The partition density after each level of the tree.
    const edgeCount = new Int32Array(m).fill(1);
    const nodes: Set<number>[] = edges.map(({ u, v }) => new Set([u, v]));
    const term = (c: number): number => {
      const mc = edgeCount[c]!;
      const nc = nodes[c]!.size;
      return nc <= 2 ? 0 : (mc * (mc - nc + 1)) / ((nc - 2) * (nc - 1));
    };
    let sum = 0;
    const levels: { s: number; d: number }[] = [];
    for (let i = 0; i < pairs.length; ) {
      const s = pairs[i]!.s;
      if (s <= 0) break;
      for (; i < pairs.length && pairs[i]!.s === s; i++) {
        const a = find(pairs[i]!.e);
        const b = find(pairs[i]!.f);
        if (a === b) continue;
        sum -= term(a) + term(b);
        const [big, small] = nodes[a]!.size >= nodes[b]!.size ? [a, b] : [b, a];
        parent[small] = big;
        edgeCount[big] = edgeCount[big]! + edgeCount[small]!;
        for (const x of nodes[small]!) nodes[big]!.add(x);
        nodes[small] = new Set();
        sum += term(big);
      }
      levels.push({ s, d: (2 / m) * sum });
    }
    const best = levels.reduce((b, l) => Math.max(b, l.d), 0);
    cut = best > 1e-12 ? levels.find((l) => l.d >= best - 1e-12)!.s : (levels[levels.length - 1]?.s ?? Infinity);
    for (let i = 0; i < m; i++) parent[i] = i;
  }
  for (const p of pairs) {
    if (p.s < cut || p.s <= 0) break;
    const a = find(p.e);
    const b = find(p.f);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  }
  const out = new Int32Array(m);
  for (let i = 0; i < m; i++) out[i] = find(i);
  return out;
}

/**
 * This function gives the edge groups of the link communities (HWY-030). The hub of a community is its node with the most edges.
 * Each edge goes from its end at the hub, or else in the direction of the hub edges. The check of the geometry removes each edge with an end
 * farther than `spread` units from the Weber point of that end of the community. A community with fewer than `minSize` edges after the check gets no group.
 */
export function linkCommunityGroups(input: HighwayInput, o: Readonly<LinkCommunityOptions>): Map<string, EdgeGroup> {
  const graph = input.graph;
  const index = new Map(graph.nodes.map((v, i) => [v.id, i] as const));
  const plugs = edgePlugs(graph);
  const edges: LinkEdge[] = plugs.map(({ edge }) => ({ u: index.get(edge.source.node)!, v: index.get(edge.target.node)! }));
  const label = linkCommunities(graph.nodes.length, edges, o.threshold);
  const limit = Math.max(0, o.spread) * boardUnit(graph);
  const min = Math.max(2, Math.round(o.minSize));
  const members = new Map<number, number[]>();
  label.forEach((c, i) => {
    if (edges[i]!.u === edges[i]!.v) return;
    const list = members.get(c);
    if (list) list.push(i);
    else members.set(c, [i]);
  });
  const groups = new Map<string, EdgeGroup>();
  for (const [c, list] of members) {
    if (list.length < min) continue;
    const degree = new Map<number, number>();
    for (const i of list) for (const x of [edges[i]!.u, edges[i]!.v]) degree.set(x, (degree.get(x) ?? 0) + 1);
    let hub = -1;
    for (const [x, d] of degree) if (hub < 0 || d > degree.get(hub)! || (d === degree.get(hub)! && x < hub)) hub = x;
    // The mean direction of the edges at the hub, out of the hub.
    let dx = 0;
    let dy = 0;
    for (const i of list) {
      const { ps, pt } = plugs[i]!;
      const sign = edges[i]!.u === hub ? 1 : edges[i]!.v === hub ? -1 : 0;
      dx += sign * (pt.point.x - ps.point.x);
      dy += sign * (pt.point.y - ps.point.y);
    }
    const oriented = list.map((i) => {
      const { ps, pt } = plugs[i]!;
      const flip = edges[i]!.u === hub ? false : edges[i]!.v === hub ? true : (pt.point.x - ps.point.x) * dx + (pt.point.y - ps.point.y) * dy < 0;
      const a: Point = flip ? pt.point : ps.point;
      const b: Point = flip ? ps.point : pt.point;
      return { i, flip, a, b };
    });
    const wa = weberPoint(oriented.map((x) => x.a));
    const wb = weberPoint(oriented.map((x) => x.b));
    const kept = oriented.filter((x) => dist(x.a, wa) <= limit && dist(x.b, wb) <= limit);
    if (kept.length < min) continue;
    for (const x of kept) groups.set(plugs[x.i]!.edge.id, { key: `lc${c}`, flip: x.flip });
  }
  return groups;
}

/** This function gives the highways of the link communities of the line graph (HWY-030). Each community that passes the check of the geometry gets highways. */
export function linkCommunityPlan(input: HighwayInput, o: Readonly<LinkCommunityOptions>): HighwayPlan {
  return groupedPlan(input, linkCommunityGroups(input, o), { spine: o.spine, minSize: Math.max(2, Math.round(o.minSize)) });
}
