import { dist, type Point } from "../../geom.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The linkage of the hierarchical clustering: the distance of two clusters from the distances of their edges. */
export type Linkage = "average" | "complete" | "single";

/** The values of `Linkage`. */
export const LINKAGES: readonly Linkage[] = Object.freeze(["average", "complete", "single"]);

/** The options of the highway strategy `flow-clusters` (HWY-023 of the note on highways). */
export interface FlowClusterOptions {
  /** Two clusters join while their distance is this value or less. The distance is a share of the length of the shorter edge. The default is 0.3. */
  readonly tau: number;
  /** The linkage. The default is `average`. */
  readonly linkage: Linkage;
  /** With `true`, the source of one edge only compares with the source of the other edge. The default is `false`. */
  readonly directed: boolean;
  /** A cluster with this number of edges or more gets highways. The default is 2. */
  readonly minSize: number;
  /** The spine of each cluster. The default is `trunk`: one flow line from one area to the other area. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `flow-clusters`. */
export const FLOW_CLUSTER_DEFAULTS: Readonly<FlowClusterOptions> = Object.freeze({ tau: 0.3, linkage: "average", directed: false, minSize: 2, spine: "trunk" });

/** The largest number of edges in one distance matrix. A larger graph splits into blocks of edges in the order of their sources. */
const BLOCK = 2500;

/**
 * This function gives the flow distance of two edges (Zhu and Guo 2014): `max(|s_e - s_f|, |t_e - t_f|) / min(len e, len f)`.
 * Without `directed`, it is the smaller value of the two directions of `f`, and `flip` is `true` when the opposite direction is smaller.
 */
export function flowDistance(s1: Point, t1: Point, s2: Point, t2: Point, directed: boolean): { d: number; flip: boolean } {
  const len = Math.max(1e-9, Math.min(dist(s1, t1), dist(s2, t2)));
  const direct = Math.max(dist(s1, s2), dist(t1, t2)) / len;
  if (directed) return { d: direct, flip: false };
  const back = Math.max(dist(s1, t2), dist(t1, s2)) / len;
  return back < direct ? { d: back, flip: true } : { d: direct, flip: false };
}

/**
 * This function clusters the points of a distance matrix with the chain of nearest neighbours. The linkage is reducible, so the chain gives the same tree as the greedy order.
 * The clusters join while their distance is `tau` or less. The function gives the cluster of each point, as the index of a point of the cluster.
 */
function chainClusters(n: number, d: Float64Array, tau: number, linkage: Linkage): Int32Array {
  const size = new Int32Array(n).fill(1);
  const alive = new Uint8Array(n).fill(1);
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  // A cluster that has no neighbour within `tau` is done: under a reducible linkage, its distances only grow.
  const done = new Uint8Array(n);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const chain: number[] = [];
  for (;;) {
    if (chain.length === 0) {
      let start = -1;
      for (let i = 0; i < n && start < 0; i++) if (alive[i] && !done[i]) start = i;
      if (start < 0) break;
      chain.push(start);
    }
    const a = chain[chain.length - 1]!;
    let b = -1;
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === a || !alive[j] || done[j]) continue;
      const v = d[a * n + j]!;
      if (v < best || (v === best && j < b)) [best, b] = [v, j];
    }
    const prev = chain.length >= 2 ? chain[chain.length - 2]! : -1;
    if (b < 0 || best > tau) {
      done[a] = 1;
      chain.length = 0;
      continue;
    }
    if (prev >= 0 && d[a * n + prev]! <= best) {
      // `a` and `prev` are nearest neighbours of each other: they join.
      chain.length -= 2;
      const [i, j] = a < prev ? [a, prev] : [prev, a];
      for (let k = 0; k < n; k++) {
        if (!alive[k] || k === i || k === j) continue;
        const di = d[i * n + k]!;
        const dj = d[j * n + k]!;
        const v = linkage === "single" ? Math.min(di, dj) : linkage === "complete" ? Math.max(di, dj) : (size[i]! * di + size[j]! * dj) / (size[i]! + size[j]!);
        d[i * n + k] = v;
        d[k * n + i] = v;
      }
      size[i] = size[i]! + size[j]!;
      alive[j] = 0;
      parent[j] = i;
      continue;
    }
    chain.push(b);
  }
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = find(i);
  return out;
}

/**
 * This function gives the flow clusters of the edges (HWY-023). It clusters the edges as points in 4D, with the cut at `tau`.
 * Each edge of a cluster gets the key of the cluster. It gets `flip` when it goes opposite to the first edge of the cluster.
 */
export function flowClusters(input: HighwayInput, o: Readonly<FlowClusterOptions>): Map<string, EdgeGroup> {
  const ends = edgePlugs(input.graph).map(({ edge, ps, pt }) => ({ edge: edge.id, s: ps.point, t: pt.point }));
  const groups = new Map<string, EdgeGroup>();
  // A large graph splits into blocks of `BLOCK` edges, in the order of the x of the sources.
  const order = ends.length > BLOCK ? [...ends].sort((a, b) => a.s.x - b.s.x || a.s.y - b.s.y || (a.edge < b.edge ? -1 : 1)) : ends;
  for (let from = 0; from < order.length; from += BLOCK) {
    const block = order.slice(from, from + BLOCK);
    const n = block.length;
    const d = new Float64Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const v = flowDistance(block[i]!.s, block[i]!.t, block[j]!.s, block[j]!.t, o.directed).d;
        d[i * n + j] = v;
        d[j * n + i] = v;
      }
    const cluster = chainClusters(n, d, o.tau, o.linkage);
    const first = new Map<number, number>();
    block.forEach((e, i) => {
      const c = cluster[i]!;
      if (!first.has(c)) first.set(c, i);
      const lead = block[first.get(c)!]!;
      const flip = i === first.get(c) ? false : flowDistance(lead.s, lead.t, e.s, e.t, o.directed).flip;
      groups.set(e.edge, { key: `f${from + first.get(c)!}`, flip });
    });
  }
  return groups;
}

/**
 * This function gives the highways of the flow clusters (HWY-023). The clusters of `flowClusters` with `minSize` edges or more get highways.
 * With the spine `trunk`, each cluster gets one trunk from one area to the other area. With `shared`, the edges of a cluster share their ways.
 */
export function flowClusterPlan(input: HighwayInput, o: Readonly<FlowClusterOptions>): HighwayPlan {
  return groupedPlan(input, flowClusters(input, o), { spine: o.spine, minSize: o.minSize });
}
