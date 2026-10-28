import { dist, type Point } from "../../geom.ts";
import { flowDistance } from "../flow-clusters/index.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The distance of two edges: 1 less their compatibility of FDEB, or the flow distance in 4D of HWY-023. */
export type EdgeDistance = "compatibility" | "flow";

/** The values of `EdgeDistance`. */
export const EDGE_DISTANCES: readonly EdgeDistance[] = Object.freeze(["compatibility", "flow"]);

/** The options of the highway strategy `hdbscan` (HWY-028 of the note on highways). */
export interface HdbscanOptions {
  /** A cluster has this number of edges or more. The default is 3. */
  readonly minClusterSize: number;
  /** The core distance of an edge is the distance to its neighbour of this rank. The default is 3. */
  readonly minSamples: number;
  /** The distance of two edges. The default is `compatibility`. */
  readonly distance: EdgeDistance;
  /** The spine of each cluster. The default is `trunk`: one trunk from one area to the other area. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `hdbscan`. */
export const HDBSCAN_DEFAULTS: Readonly<HdbscanOptions> = Object.freeze({ minClusterSize: 3, minSamples: 3, distance: "compatibility", spine: "trunk" });

/** The largest number of edges in one distance matrix. A larger graph splits into blocks of edges in the order of their sources. */
const BLOCK = 2500;

/**
 * This function gives the compatibility of two edges of FDEB (Holten and van Wijk 2009): `Ca Cs Cp Cv`, from 0 to 1.
 * `Ca` is the angle, `Cs` the scale, `Cp` the position and `Cv` the visibility. The direction of an edge does not change the value.
 */
export function compatibility(p0: Point, p1: Point, q0: Point, q1: Point): number {
  const lp = dist(p0, p1);
  const lq = dist(q0, q1);
  if (lp <= 1e-9 || lq <= 1e-9) return 0;
  const ca = Math.abs(((p1.x - p0.x) * (q1.x - q0.x) + (p1.y - p0.y) * (q1.y - q0.y)) / (lp * lq));
  const avg = (lp + lq) / 2;
  const cs = 2 / (avg / Math.min(lp, lq) + Math.max(lp, lq) / avg);
  const pm = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const qm = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 };
  const cp = avg / (avg + dist(pm, qm));
  const cv = Math.min(visibility(p0, p1, q0, q1), visibility(q0, q1, p0, p1));
  return ca * cs * cp * cv;
}

/** This function gives the visibility of the edge `q` from the edge `p` of FDEB: `max(1 - 2 |pm - im| / |i0 i1|, 0)`. The points `i` are the projection of `q` on the line of `p`. */
function visibility(p0: Point, p1: Point, q0: Point, q1: Point): number {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const l2 = dx * dx + dy * dy;
  const project = (q: Point): Point => {
    const u = ((q.x - p0.x) * dx + (q.y - p0.y) * dy) / l2;
    return { x: p0.x + u * dx, y: p0.y + u * dy };
  };
  const i0 = project(q0);
  const i1 = project(q1);
  const span = dist(i0, i1);
  if (span <= 1e-9) return 0;
  const im = { x: (i0.x + i1.x) / 2, y: (i0.y + i1.y) / 2 };
  const pm = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  return Math.max(1 - (2 * dist(pm, im)) / span, 0);
}

/**
 * This function gives the HDBSCAN clusters of the points of a distance matrix (Campello, Moulavi and Sander 2013). The value -1 is noise.
 * The core distance of a point is the distance to its `minSamples`-th nearest point. The mutual reachability is `max(core(a), core(b), d(a, b))`.
 * The minimum spanning tree of the mutual reachability gives the tree of the clusters. A split with two parts of `minClusterSize` or more gives two clusters.
 * The selection keeps the clusters with the largest stability, `sum (lambda_leave - lambda_birth)`, with `lambda = 1 / distance`. The root is not a cluster.
 */
export function hdbscanLabels(n: number, d: Float64Array, minClusterSize: number, minSamples: number): Int32Array {
  const labels = new Int32Array(n).fill(-1);
  const mcs = Math.max(2, Math.round(minClusterSize));
  if (n < mcs || n < 2) return labels;
  const k = Math.max(1, Math.min(n - 1, Math.round(minSamples)));
  // The core distance of each point.
  const core = new Float64Array(n);
  const row = new Float64Array(n - 1);
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let j = 0; j < n; j++) if (j !== i) row[c++] = d[i * n + j]!;
    row.sort();
    core[i] = row[k - 1]!;
  }
  const reach = (i: number, j: number): number => Math.max(core[i]!, core[j]!, d[i * n + j]!);
  // The minimum spanning tree (Prim), with ties to the lower index.
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const links: { a: number; b: number; w: number }[] = [];
  let cur = 0;
  inTree[0] = 1;
  for (let step = 1; step < n; step++) {
    let next = -1;
    for (let j = 0; j < n; j++) {
      if (inTree[j]) continue;
      const w = reach(cur, j);
      if (w < best[j]!) [best[j], from[j]] = [w, cur];
      if (next < 0 || best[j]! < best[next]!) next = j;
    }
    inTree[next] = 1;
    links.push({ a: from[next]!, b: next, w: best[next]! });
    cur = next;
  }
  links.sort((p, q) => p.w - q.w || p.a - q.a || p.b - q.b);
  // The single linkage tree: the node `n + i` is the merge `i`.
  const parent = new Int32Array(2 * n - 1).fill(-1);
  const left = new Int32Array(n - 1);
  const right = new Int32Array(n - 1);
  const height = new Float64Array(n - 1);
  const size = new Int32Array(2 * n - 1).fill(1);
  const uf = new Int32Array(2 * n - 1);
  for (let i = 0; i < uf.length; i++) uf[i] = i;
  const find = (i: number): number => {
    while (uf[i] !== i) i = uf[i] = uf[uf[i]!]!;
    return i;
  };
  links.forEach((l, i) => {
    const ra = find(l.a);
    const rb = find(l.b);
    const node = n + i;
    left[i] = ra;
    right[i] = rb;
    height[i] = l.w;
    size[node] = size[ra]! + size[rb]!;
    parent[ra] = node;
    parent[rb] = node;
    uf[ra] = node;
    uf[rb] = node;
  });
  const root = 2 * n - 2;
  const lambdaOf = (h: number): number => 1 / Math.max(h, 1e-9);
  const leaves = (node: number): number[] => {
    const out: number[] = [];
    const stack = [node];
    while (stack.length > 0) {
      const x = stack.pop()!;
      if (x < n) out.push(x);
      else stack.push(left[x - n]!, right[x - n]!);
    }
    return out;
  };
  // The condensed tree. Each cluster has a birth lambda, a parent cluster, its stability and the points that leave it at their lambda.
  const birth: number[] = [0];
  const up: number[] = [-1];
  const stability: number[] = [0];
  const fall = new Int32Array(n).fill(0);
  const queue: [node: number, cluster: number][] = [[root, 0]];
  while (queue.length > 0) {
    const [node, c] = queue.shift()!;
    const i = node - n;
    const lambda = lambdaOf(height[i]!);
    const kids = [left[i]!, right[i]!];
    const big = kids.filter((x) => size[x]! >= mcs);
    if (big.length === 2) {
      for (const x of kids) {
        const id = birth.length;
        birth.push(lambda);
        up.push(c);
        stability.push(0);
        stability[c] = stability[c]! + size[x]! * (lambda - birth[c]!);
        queue.push([x, id]);
      }
      continue;
    }
    for (const x of kids) {
      if (big.includes(x)) {
        if (x >= n) queue.push([x, c]);
        else {
          fall[x] = c;
          stability[c] = stability[c]! + (lambda - birth[c]!);
        }
        continue;
      }
      for (const p of leaves(x)) {
        fall[p] = c;
        stability[c] = stability[c]! + (lambda - birth[c]!);
      }
    }
  }
  // The selection by the excess of mass, from the last cluster to the first. A child cluster always has a larger id than its parent.
  const count = birth.length;
  const chosen = new Uint8Array(count);
  const value = [...stability];
  const children: number[][] = Array.from({ length: count }, () => []);
  for (let c = 1; c < count; c++) children[up[c]!]!.push(c);
  for (let c = count - 1; c >= 1; c--) {
    const sub = children[c]!.reduce((s, x) => s + value[x]!, 0);
    if (children[c]!.length > 0 && sub > value[c]!) value[c] = sub;
    else {
      chosen[c] = 1;
      const stack = [...children[c]!];
      while (stack.length > 0) {
        const x = stack.pop()!;
        chosen[x] = 0;
        stack.push(...children[x]!);
      }
    }
  }
  for (let p = 0; p < n; p++) {
    let c = fall[p]!;
    while (c > 0 && !chosen[c]) c = up[c]!;
    labels[p] = c > 0 ? c : -1;
  }
  return labels;
}

/**
 * This function gives the HDBSCAN clusters of the edges (HWY-028). The edges that are noise get no group.
 * Each edge of a cluster gets `flip` when it goes opposite to the first edge of the cluster.
 */
export function hdbscanClusters(input: HighwayInput, o: Readonly<HdbscanOptions>): Map<string, EdgeGroup> {
  const ends = edgePlugs(input.graph).map(({ edge, ps, pt }) => ({ edge: edge.id, s: ps.point, t: pt.point }));
  const groups = new Map<string, EdgeGroup>();
  const order = ends.length > BLOCK ? [...ends].sort((a, b) => a.s.x - b.s.x || a.s.y - b.s.y || (a.edge < b.edge ? -1 : 1)) : ends;
  const between = (a: (typeof ends)[number], b: (typeof ends)[number]): number =>
    o.distance === "flow" ? flowDistance(a.s, a.t, b.s, b.t, false).d : 1 - compatibility(a.s, a.t, b.s, b.t);
  for (let from = 0; from < order.length; from += BLOCK) {
    const block = order.slice(from, from + BLOCK);
    const n = block.length;
    const d = new Float64Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const v = between(block[i]!, block[j]!);
        d[i * n + j] = v;
        d[j * n + i] = v;
      }
    const labels = hdbscanLabels(n, d, o.minClusterSize, o.minSamples);
    const lead = new Map<number, number>();
    block.forEach((e, i) => {
      const c = labels[i]!;
      if (c < 0) return;
      if (!lead.has(c)) lead.set(c, i);
      const l = block[lead.get(c)!]!;
      const flip = (e.t.x - e.s.x) * (l.t.x - l.s.x) + (e.t.y - e.s.y) * (l.t.y - l.s.y) < 0;
      groups.set(e.edge, { key: `c${from}:${c}`, flip });
    });
  }
  return groups;
}

/**
 * This function gives the highways of the HDBSCAN clusters (HWY-028). The clusters that live over a long range of densities are the highways.
 * The number of highways is not fixed, and the noise edges stay alone.
 */
export function hdbscanPlan(input: HighwayInput, o: Readonly<HdbscanOptions>): HighwayPlan {
  return groupedPlan(input, hdbscanClusters(input, o), { spine: o.spine, minSize: Math.max(2, Math.round(o.minClusterSize)) });
}
