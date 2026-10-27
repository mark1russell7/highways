import type { Graph, Level } from "../../model.ts";
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
