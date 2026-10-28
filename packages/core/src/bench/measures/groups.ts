import { rng } from "../../fixtures.ts";
import { center, dist, type Point } from "../../geom.ts";
import type { Graph, Level } from "../../model.ts";
import { countOverlaps } from "../links.ts";
import type { Section } from "../../sections.ts";
import { adjustedRandIndex } from "./stats.ts";

/** A grouping of the nodes: a map from the id of each node to the id of its group. */
export type Grouping = ReadonlyMap<string, string>;

/** This function gives the grouping of one level: each node goes to the id of its item. */
export function levelGrouping(level: Level): Map<string, string> {
  const m = new Map<string, string>();
  for (const item of level.items) for (const n of item.nodes) m.set(n, item.id);
  return m;
}

/** This function gives the far view of a result: the first level with more than one item, in the order of depth. */
export function farLevel(levels: readonly Level[]): Level | undefined {
  return [...levels].sort((a, b) => a.depth - b.depth).find((l) => l.items.length > 1);
}

/**
 * This function gives the modularity of a grouping (G1 of MEAS0, Newman and Girvan, 2004).
 * `Q = Σ_c (e_c / m - (d_c / (2m))^2)`, with `e_c` the edges inside `c` and `d_c` the sum of the degrees in `c`.
 * The scale is -0.5 to 1, and higher is better. A node without a group is a group alone. The cost is linear.
 */
export function modularity(graph: Graph, groups: Grouping): number {
  const m = graph.edges.length;
  if (m === 0) return 0;
  const inside = new Map<string, number>();
  const degree = new Map<string, number>();
  const of = (v: string): string => groups.get(v) ?? `\u0000${v}`;
  for (const e of graph.edges) {
    const a = of(e.source.node);
    const b = of(e.target.node);
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
    if (a === b) inside.set(a, (inside.get(a) ?? 0) + 1);
  }
  let q = 0;
  for (const [c, d] of degree) q += (inside.get(c) ?? 0) / m - (d / (2 * m)) ** 2;
  return q;
}

/**
 * This function gives the cut share of a grouping (G2 of MEAS0): the share of the edges between two groups.
 * For the grouping of a level, it is the sum of the counts of the links of the level, divided by `m`. The scale is 0 to 1, and lower is better.
 */
export function cutShare(graph: Graph, groups: Grouping): number {
  const m = graph.edges.length;
  if (m === 0) return 0;
  let cut = 0;
  for (const e of graph.edges) if ((groups.get(e.source.node) ?? e.source.node) !== (groups.get(e.target.node) ?? e.target.node)) cut++;
  return cut / m;
}

/**
 * This function gives the balance of one level (G6 of MEAS0): `H(s) / log(k)`, with `s` the shares of the nodes of the `k` items and `H` the entropy.
 * The scale is 0 to 1, and higher is better. A value of 1 is items of equal size. A level with one item gives 1.
 */
export function balance(level: Level): number {
  const k = level.items.length;
  const total = level.items.reduce((s, item) => s + item.nodes.length, 0);
  if (k < 2 || total === 0) return 1;
  let h = 0;
  for (const item of level.items) {
    const p = item.nodes.length / total;
    if (p > 0) h -= p * Math.log(p);
  }
  return h / Math.log(k);
}

/**
 * This function gives the tree cost of the levels (G8 of MEAS0, Dasgupta, 2016): `D = Σ_(u,v) leaves(lca(u, v)) / (m n)`.
 * The levels make the tree. `leaves(lca(u, v))` is the number of nodes of the deepest item that holds both ends.
 * Without such an item, the value is `n`. The scale is 0 to 1, and lower is better. The cost is linear times the depth.
 */
export function treeCost(graph: Graph, levels: readonly Level[]): number {
  const n = graph.nodes.length;
  const m = graph.edges.length;
  if (n === 0 || m === 0) return 0;
  const list = [...levels].sort((a, b) => b.depth - a.depth);
  const maps = list.map((l) => {
    const size = new Map<string, number>();
    const of = new Map<string, string>();
    for (const item of l.items) {
      size.set(item.id, item.nodes.length);
      for (const v of item.nodes) of.set(v, item.id);
    }
    return { size, of };
  });
  let sum = 0;
  for (const e of graph.edges) {
    let leaves = n;
    for (const { size, of } of maps) {
      const a = of.get(e.source.node);
      if (a !== undefined && a === of.get(e.target.node)) {
        leaves = size.get(a)!;
        break;
      }
    }
    sum += leaves;
  }
  return sum / (m * n);
}

/** This function gives the leaf of each node in a tree of sections: the id of the leaf, by the index of the node. */
export function leafGroups(root: Section, count: number): string[] {
  const out = new Array<string>(count).fill("");
  const walk = (s: Section): void => {
    if (s.children.length === 0) for (const i of s.nodes) out[i] = s.id;
    else for (const c of s.children) walk(c);
  };
  walk(root);
  return out.map((id, i) => id || `#${i}`);
}

/**
 * This function gives the group stability of two trees of the same nodes (G9 of MEAS0): the adjusted Rand index of their leaves.
 * The second tree comes from the graph after a small change (`changeGraph`). The scale is -1 to 1, and higher is better.
 */
export function groupStability(before: Section, after: Section, count: number): number {
  return adjustedRandIndex(leafGroups(before, count), leafGroups(after, count));
}

/**
 * This function gives the fill of the groups of one level (G4 of MEAS0): the mean of `fill(c) = Σ_(v in c) area(box(v)) / area(box(c))`.
 * `box(c)` is the box of the item. Only an item with 2 or more nodes counts, and a fill above 1 counts as 1.
 * The scale is 0 to 1, and higher is better. A level without such an item gives `undefined`. The cost is linear.
 */
export function groupFill(graph: Graph, level: Level): number | undefined {
  const area = new Map(graph.nodes.map((n) => [n.id, n.box.w * n.box.h] as const));
  const fills: number[] = [];
  for (const item of level.items) {
    if (item.nodes.length < 2) continue;
    const own = item.box.w * item.box.h;
    const inside = item.nodes.reduce((s, v) => s + (area.get(v) ?? 0), 0);
    fills.push(own > 0 ? Math.min(1, inside / own) : 1);
  }
  return fills.length === 0 ? undefined : fills.reduce((s, f) => s + f, 0) / fills.length;
}

/**
 * This function counts the overlaps of the items of the levels (G5 of MEAS0).
 * An overlap is a pair of items of one level whose boxes overlap by more than `TOLERANCE`.
 * It is the sum over the levels of `countOverlaps`. Lower is better. The cost is `n log n` for each level.
 */
export function itemOverlaps(levels: readonly Level[]): number {
  return levels.reduce((n, level) => n + countOverlaps(level.items.map((i) => i.box)), 0);
}

/** Up to this number of nodes, `silhouette` examines each node. Above it, two seeded samples of this size give an estimate. */
const SILHOUETTE_NODES = 2000;

/**
 * This function gives the silhouette of the groups of one level (G7 of MEAS0, Rousseeuw 1987): the mean of `s(v) = (b_v - a_v) / max(a_v, b_v)`.
 * `a_v` is the mean distance from the center of `v` to the centers of the other nodes of its item. `b_v` is the smallest mean distance to the nodes of another item.
 * A node alone in its item gets `s(v) = 0`. The scale is -1 to 1, and higher is better.
 * A level with fewer than 2 items gives `undefined`. The cost is quadratic up to 2000 nodes.
 * Above 2000 nodes, a seeded sample of 2000 nodes gets `s(v)`, against a second seeded sample of 2000 nodes. Thus the value is an estimate.
 */
export function silhouette(graph: Graph, level: Level): number | undefined {
  const at = new Map(graph.nodes.map((n) => [n.id, center(n.box)] as const));
  const all = level.items.flatMap((item, k) => item.nodes.flatMap((v) => (at.has(v) ? [{ p: at.get(v)!, k }] : [])));
  if (new Set(all.map((x) => x.k)).size < 2) return undefined;
  const R = rng(all.length);
  const sample = (): typeof all => (all.length <= SILHOUETTE_NODES ? all : Array.from({ length: SILHOUETTE_NODES }, () => all[Math.floor(R() * all.length)]!));
  const chosen = sample();
  const ref = sample();
  const groups = new Map<number, Point[]>();
  for (const { p, k } of ref) {
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }
  let sum = 0;
  for (const { p, k } of chosen) {
    const own = groups.get(k);
    if (!own || own.length < 2) continue;
    let a = 0;
    let b = Number.POSITIVE_INFINITY;
    for (const [j, g] of groups) {
      const d = g.reduce((s, q) => s + dist(p, q), 0);
      if (j === k) a = d / (g.length - 1);
      else b = Math.min(b, d / g.length);
    }
    if (!Number.isFinite(b)) continue;
    const m = Math.max(a, b);
    sum += m > 0 ? (b - a) / m : 0;
  }
  return sum / chosen.length;
}
