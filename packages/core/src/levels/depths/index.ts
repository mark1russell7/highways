import { levelLinks, type ItemPair, type LevelLinkOptions } from "../../levels.ts";
import type { Level, Route } from "../../model.ts";
import { levelCut, treeDepth } from "../../sections.ts";
import type { LevelInput } from "../../strategies/model.ts";

/** The options of the level strategy `depths`: the limits of the level links, and the depths that get a level with groups. */
export interface DepthLevelOptions extends Omit<LevelLinkOptions, "smooth"> {
  /**
   * The depths of the tree that get a zoom level with groups. The last level, with each node alone, always comes after them.
   * The default is each depth, from 0 to the depth of the deepest section.
   */
  readonly levels?: readonly number[];
}

/**
 * This function gives the zoom levels of the level strategy `depths`: one level for each depth of the tree, and a last level with each node alone.
 * It is the default of the router `sections`. With the option `levels`, only those depths get a level with groups.
 * At depth d, a section of depth d is one item. A link joins two items and counts the edges between them.
 * In a level with groups, a link goes around the boxes of the other items (`levelLinks`).
 * In the last level, the points of a link are the route of its first edge.
 */
export function depthLevels(input: LevelInput, options: DepthLevelOptions = {}): Level[] {
  const { graph, root } = input;
  const routeOf = new Map<string, Route>(input.routes.map((r) => [r.edge, r]));
  const indexOfNode = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const levels: Level[] = [];
  const deepest = treeDepth(root);
  const shown = options.levels && new Set(options.levels);
  for (let d = 0; d <= deepest + 1; d++) {
    if (shown && d <= deepest && !shown.has(d)) continue;
    const { items, owner } = levelCut(graph.nodes, root, d);
    const links = new Map<string, { source: string; target: string; count: number; edge: string }>();
    for (const e of graph.edges) {
      const iu = indexOfNode.get(e.source.node);
      const iv = indexOfNode.get(e.target.node);
      if (iu === undefined || iv === undefined) continue;
      const a = owner[iu]!;
      const b = owner[iv]!;
      if (a === b) continue;
      const ida = items[a]!.id;
      const idb = items[b]!.id;
      const key = `${ida}\u0000${idb}`;
      const link = links.get(key);
      if (link) {
        link.count++;
        continue;
      }
      links.set(key, { source: ida, target: idb, count: 1, edge: e.id });
    }
    const pairs: ItemPair[] = [...links.values()].map(({ source, target, count }) => ({ source, target, count }));
    if (d > deepest)
      levels.push({ depth: d, items, links: [...links.values()].map(({ edge, ...l }) => ({ ...l, points: routeOf.get(edge)?.points ?? [] })) });
    else levels.push({ depth: d, items, links: levelLinks(items, pairs, options) });
  }
  return levels;
}
