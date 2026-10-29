/**
 * The highway strategy `approval` (WILD-031): approval corridors, after approval voting (Brams and Fishburn, 1978) and the greedy set cover (Chvátal, 1979).
 * Each edge approves each link of the corner graph that lies on a way within `1 + eps` of its shortest way. The links with the most approvals become corridors.
 */
import { dist, type Point } from "../../geom.ts";
import type { CornerGraph } from "../../visibility.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The rule that picks the corridor links: the links with the most approvals, or a greedy cover of the edges. */
export type ApprovalPick = "score" | "cover";

/** The values of `ApprovalPick`. */
export const APPROVAL_PICKS: readonly ApprovalPick[] = Object.freeze(["score", "cover"]);

/** The options of the highway strategy `approval` (WILD-031). */
export interface ApprovalOptions extends Pick<WayOptions, "margin" | "k"> {
  /** An edge approves the links of its ways within `1 + eps` of its shortest way, from 0.05 to 0.5. The default is 0.2. */
  readonly eps: number;
  /** The second pass gives each corridor link this discount, as a share of its length, from 0.3 to 0.9. The default is 0.5. */
  readonly discount: number;
  /** The largest share of the approved links that become corridor links, from 0.05 to 0.5. The default is 0.2. */
  readonly budget: number;
  /** A corridor link has this number of approvals or more, and a highway has this number of edges or more, from 2 to 16. The default is 2. */
  readonly minSize: number;
  /** The rule that picks the corridor links. The default is `score`. */
  readonly pick: ApprovalPick;
}

/** The default options of the strategy `approval`. */
export const APPROVAL_DEFAULTS: Readonly<Required<Omit<ApprovalOptions, "margin" | "k">>> = Object.freeze({ eps: 0.2, discount: 0.5, budget: 0.2, minSize: 2, pick: "score" });

/** The number of corners near an end that a search starts from or ends at. */
const ENDS = 8;

/** A small binary min-heap of (key, value) pairs. Equal keys come out by value, so the order is deterministic. */
class Heap {
  readonly #k: number[] = [];
  readonly #v: number[] = [];

  get size(): number {
    return this.#k.length;
  }

  get topKey(): number {
    return this.#k[0]!;
  }

  #less(a: number, b: number): boolean {
    return this.#k[a]! < this.#k[b]! || (this.#k[a] === this.#k[b] && this.#v[a]! < this.#v[b]!);
  }

  #swap(a: number, b: number): void {
    [this.#k[a], this.#k[b]] = [this.#k[b]!, this.#k[a]!];
    [this.#v[a], this.#v[b]] = [this.#v[b]!, this.#v[a]!];
  }

  push(key: number, value: number): void {
    this.#k.push(key);
    this.#v.push(value);
    let i = this.#k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.#less(i, p)) break;
      this.#swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.#v[0]!;
    const last = this.#k.length - 1;
    this.#swap(0, last);
    this.#k.pop();
    this.#v.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.#k.length && this.#less(l, m)) m = l;
      if (r < this.#k.length && this.#less(r, m)) m = r;
      if (m === i) break;
      this.#swap(i, m);
      i = m;
    }
    return top;
  }
}

/**
 * This function gives the distance from the point `p` to each corner of the corner graph, up to `bound` (Dijkstra).
 * The search starts at the corners that `p` sees. A corner farther than `bound` is not in the map.
 */
export function distancesFrom(corners: CornerGraph, p: Point, bound: number): Map<number, number> {
  const d = new Map<number, number>();
  const done = new Set<number>();
  const heap = new Heap();
  for (const j of corners.nearestVisible(p, ENDS)) {
    const g = dist(p, corners.points[j]!);
    if (g <= bound && g < (d.get(j) ?? Infinity)) {
      d.set(j, g);
      heap.push(g, j);
    }
  }
  while (heap.size > 0) {
    if (heap.topKey > bound) break;
    const i = heap.pop();
    if (done.has(i)) continue;
    done.add(i);
    const gi = d.get(i)!;
    for (const j of corners.neighbours(i)) {
      if (done.has(j)) continue;
      const g = gi + dist(corners.points[i]!, corners.points[j]!);
      if (g <= bound && g < (d.get(j) ?? Infinity)) {
        d.set(j, g);
        heap.push(g, j);
      }
    }
  }
  for (const j of [...d.keys()]) if (!done.has(j)) d.delete(j);
  return d;
}

/**
 * This function gives the links that the way from `a` to `b` approves (WILD-031), as keys `i × M + j` with `i < j`.
 * The way approves the link `(i, j)` when `d_a(i) + w(i, j) + d_b(j) ≤ (1 + eps) × d*`, in one direction or the other. The value `d*` is the length of its shortest way.
 */
export function approvedLinks(corners: CornerGraph, a: Point, b: Point, eps: number): Set<number> {
  const M = corners.points.length;
  const out = new Set<number>();
  const fromA = distancesFrom(corners, a, Infinity);
  let best = Infinity;
  for (const j of corners.nearestVisible(b, ENDS)) {
    const g = fromA.get(j);
    if (g !== undefined) best = Math.min(best, g + dist(corners.points[j]!, b));
  }
  if (best === Infinity) return out;
  const bound = (1 + eps) * best;
  const fromB = distancesFrom(corners, b, bound);
  for (const [i, gi] of fromA) {
    if (gi > bound) continue;
    for (const j of corners.neighbours(i)) {
      const gj = fromB.get(j);
      if (gj !== undefined && gi + dist(corners.points[i]!, corners.points[j]!) + gj <= bound) out.add(i < j ? i * M + j : j * M + i);
    }
  }
  return out;
}

/**
 * This function picks the corridor links from the approvals of each edge. A link needs `minSize` approvals or more.
 * With `score`, the links with the most approvals win. With `cover`, a greedy cover takes the link with the most approvals of edges that no picked link serves yet, and stops when each edge has one.
 * The pick holds at most `budget` of the approved links. A tie goes to the least key.
 */
export function pickLinks(approvals: readonly ReadonlySet<number>[], o: Readonly<Pick<ApprovalOptions, "budget" | "minSize" | "pick">>): Set<number> {
  const voters = new Map<number, number[]>();
  approvals.forEach((links, e) => {
    for (const l of links) {
      const list = voters.get(l);
      if (list) list.push(e);
      else voters.set(l, [e]);
    }
  });
  const cap = Math.max(1, Math.floor(o.budget * voters.size));
  const able = [...voters].filter(([, v]) => v.length >= o.minSize).sort((p, q) => q[1].length - p[1].length || p[0] - q[0]);
  if (o.pick === "score") return new Set(able.slice(0, cap).map(([l]) => l));
  const picked = new Set<number>();
  const served = new Set<number>();
  const heap = new Heap();
  // The heap holds the minus of the gain of each link, as it was when the link went in. A gain does not grow, so a fresh top is the best.
  for (const [l, v] of able) heap.push(-v.length, l);
  while (heap.size > 0 && picked.size < cap) {
    const stale = -heap.topKey;
    const l = heap.pop();
    const gain = voters.get(l)!.filter((e) => !served.has(e)).length;
    if (gain === 0) continue;
    if (gain < stale && heap.size > 0 && gain < -heap.topKey) {
      heap.push(-gain, l);
      continue;
    }
    picked.add(l);
    for (const e of voters.get(l)!) served.add(e);
  }
  return picked;
}

/**
 * This function gives the highways of approval corridors (WILD-031). Each edge approves the links of its ways within `1 + eps` of its shortest way.
 * The rule `pick` takes the corridor links within the budget. A second pass routes each edge again with the discount on those links.
 * Each stretch of corridor links that `minSize` ways or more share after the second pass is one highway.
 */
export function approvalPlan(input: HighwayInput, o: Readonly<ApprovalOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const id = new Map<Point, number>();
  corners.points.forEach((p, i) => id.set(p, i));
  const M = corners.points.length;
  const link = (i: number, j: number): number => (i < j ? i * M + j : j * M + i);
  const plugs = edgePlugs(input.graph);
  const ends = plugs.map(({ ps, pt }) => [finder.out(ps), finder.out(pt)] as const);
  const approvals = ends.map(([a, b]) => (finder.obstacles.clear(a, b, finder.margin) ? new Set<number>() : approvedLinks(corners, a, b, o.eps)));
  const picked = pickLinks(approvals, o);
  if (picked.size === 0) return { highways: [] };
  const share = Math.min(1, Math.max(0.05, 1 - o.discount));
  const cost = (i: number, j: number, d: number): number => (picked.has(link(i, j)) ? d * share : d);
  const ways: KeyedWay[] = [];
  plugs.forEach(({ edge }, n) => {
    const [a, b] = ends[n]!;
    const way = corners.path(a, b, cost, share);
    if (way) ways.push({ edge: edge.id, key: "road", points: way });
  });
  const onCorridor = (a: Point, b: Point): boolean => {
    const p = id.get(a);
    const q = id.get(b);
    return p !== undefined && q !== undefined && picked.has(link(p, q));
  };
  return sharedStretches(ways, { minSize: o.minSize, link: onCorridor, pull: (p) => corners.pull(p) });
}
