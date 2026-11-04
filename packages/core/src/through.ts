import { nodeIndex, type Graph, type Route, type Result } from "./model.ts";
import type { Obstacles } from "./visibility.ts";

/**
 * This function gives the ids of the boxes that the route goes through, sorted. The boxes at the ends of the edge do not count.
 * The test is the rule `no-pass-through` of `checkProperties`.
 */
function boxesOf(route: Route, source: string, target: string, obstacles: Obstacles): readonly string[] {
  let hit: Set<string> | undefined;
  for (let i = 1; i < route.points.length; i++) {
    obstacles.across(route.points[i - 1]!, route.points[i]!, (n) => {
      if (n.id !== source && n.id !== target) (hit ??= new Set<string>()).add(n.id);
    });
  }
  return hit === undefined ? [] : [...hit].sort();
}

/**
 * This function gives the routes with the field `through` on each route that goes through a box (CORNER-REACH).
 * A route with no such box stays the same object, so a clean route keeps its bytes.
 * Without such a route, the function gives the same array.
 * A route whose edge or nodes are not in the graph stays the same: an inner route has its own frame.
 */
export function markThrough(graph: Graph, routes: Route[], obstacles: Obstacles): Route[] {
  const nodes = nodeIndex(graph);
  const edges = new Map(graph.edges.map((e) => [e.id, e] as const));
  let out: Route[] | undefined;
  routes.forEach((route, i) => {
    const edge = edges.get(route.edge);
    if (!edge || !nodes.has(edge.source.node) || !nodes.has(edge.target.node)) return;
    const through = boxesOf(route, edge.source.node, edge.target.node, obstacles);
    if (through.length > 0) (out ??= [...routes])[i] = { ...route, through };
  });
  return out ?? routes;
}

/** This function gives the field `through` of each route of `source` to the route of its edge in `routes`. */
export function keepThrough(source: Result, routes: Route[]): Route[] {
  const marked = new Map<string, readonly string[]>();
  for (const r of source.routes) if (r.through !== undefined) marked.set(r.edge, r.through);
  if (marked.size === 0) return routes;
  return routes.map((r) => {
    const through = marked.get(r.edge);
    return through === undefined ? r : { ...r, through };
  });
}
