import type { Box } from "../../geom.ts";
import type { Graph, Node } from "../../model.ts";
import { buildSections, type Section, type SectionOptions } from "../../sections.ts";

/** A key rule gives the key of the group of a node. A node without a key is a group alone. */
export type NodeKey = (node: Node, index: number) => string | undefined;

/** The options of the grouping rule `keys`. */
export interface KeyOptions {
  /** This function gives the key of the group of each node. The default is `byDataGroup`. */
  readonly key?: NodeKey;
  /**
   * With this value, a group with more nodes than its `cap` splits into the cells of a quadtree, as `buildSections` does.
   * Without it, each group is one leaf. The default is no split.
   */
  readonly split?: SectionOptions;
}

/** This key rule gives the string `data.group` of the node, or `undefined` when the node has no such string. */
export const byDataGroup: NodeKey = (node) => {
  const group = node.data?.["group"];
  return typeof group === "string" ? group : undefined;
};

/** This function gives the bounding box of the boxes of the nodes of the list. */
function boundsOf(nodes: readonly Node[], list: readonly number[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of list) {
    const b = nodes[i]!.box;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return list.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

/**
 * This function gives the tree of sections of the grouping rule `keys`. The root holds each node. Each child of the root holds the nodes of one key,
 * in the order of their first node. The id of a group is `s:` and its key. A node without a key is a group alone, with the id `s#` and its index.
 * Thus the far view of the router `sections` shows one item for each group.
 */
export function keyedSections(nodes: readonly Node[], options: KeyOptions = {}): Section {
  const key = options.key ?? byDataGroup;
  const groups = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const k = key(n, i);
    const id = k === undefined ? `s#${i}` : `s:${k}`;
    const list = groups.get(id);
    if (list) list.push(i);
    else groups.set(id, [i]);
  });
  const children = [...groups].map(([id, list]) => group(nodes, id, list, options.split));
  return { id: "s", depth: 0, cell: boundsOf(nodes, nodes.map((_, i) => i)), nodes: nodes.map((_, i) => i), children };
}

/** This function gives the section of one group at depth 1. With `split`, the section has the quadtree of its nodes below it. */
function group(nodes: readonly Node[], id: string, list: readonly number[], split: SectionOptions | undefined): Section {
  if (!split) return { id, depth: 1, cell: boundsOf(nodes, list), nodes: list, children: [] };
  const tree = buildSections(
    list.map((i) => nodes[i]!),
    split,
  );
  // The quadtree numbers the nodes of the group from 0. Each section gets the indices of the graph, one more level and the id of the group before its path.
  const rebase = (s: Section): Section => ({
    id: s.id === "s" ? id : `${id}/${s.id.slice(1)}`,
    depth: s.depth + 1,
    cell: s.cell,
    nodes: s.nodes.map((j) => list[j]!),
    children: s.children.map(rebase),
  });
  return rebase(tree);
}

/** This function gives the tree of sections of the grouping rule `keys` for a graph. */
export function keyGroups(graph: Graph, options: KeyOptions = {}): Section {
  return keyedSections(graph.nodes, options);
}
