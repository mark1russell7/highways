import { dist, type Point } from "../../geom.ts";
import type { WayFinder } from "../../ways.ts";

/**
 * This function gives the root of the tree of one source node (NAT-018, NAT-019): the start point nearest the center of the targets.
 * It also gives the lead of each edge, the way from its own start point to the root. A lead is `undefined` when the corner graph has no way.
 */
export function rootOf(finder: WayFinder, starts: readonly Point[], goals: readonly Point[]): { root: Point; leads: (Point[] | undefined)[] } {
  const c = { x: goals.reduce((s, p) => s + p.x, 0) / goals.length, y: goals.reduce((s, p) => s + p.y, 0) / goals.length };
  let root = starts[0]!;
  for (const s of starts) if (dist(s, c) < dist(root, c) - 1e-9) root = s;
  const leads = starts.map((s) => {
    if (dist(s, root) <= 1e-9) return [root];
    if (finder.obstacles.clearPath([s, root], finder.margin / 2)) return [s, root];
    const way = finder.corners.path(s, root);
    return way ? finder.corners.pull(way) : undefined;
  });
  return { root, leads };
}
