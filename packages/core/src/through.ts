import { nodeIndex, type Graph, type Route, type Result } from "./model.ts";
import { Obstacles } from "./visibility.ts";
import type { WayFinder } from "./ways.ts";

/**
 * This function gives the ids of the boxes that the route goes through, sorted. The boxes at the ends of the edge do not count.
 * The test is the rule `no-pass-through` of `checkProperties`.
 */
function boxesOf(route: Route, ends: (id: string) => boolean, obstacles: Obstacles): readonly string[] {
  let hit: Set<string> | undefined;
  for (let i = 1; i < route.points.length; i++) {
    obstacles.across(route.points[i - 1]!, route.points[i]!, (n) => {
      if (!ends(n.id)) (hit ??= new Set<string>()).add(n.id);
    });
  }
  return hit === undefined ? [] : [...hit].sort();
}

/**
 * This function gives the routes with the field `through` on each route that goes through a box (CORNER-REACH).
 * A route with no such box stays the same object, so a clean route keeps its bytes.
 * Without such a route, the function gives the same array.
 * A route whose edge or nodes are not in the graph stays the same. An inner route has its own frame, so `frameRoutes` marks it with `markRoute`.
 */
export function markThrough(graph: Graph, routes: Route[], obstacles: Obstacles): Route[] {
  const nodes = nodeIndex(graph);
  const edges = new Map(graph.edges.map((e) => [e.id, e] as const));
  let out: Route[] | undefined;
  routes.forEach((route, i) => {
    const edge = edges.get(route.edge);
    if (!edge || !nodes.has(edge.source.node) || !nodes.has(edge.target.node)) return;
    const through = boxesOf(route, (id) => id === edge.source.node || id === edge.target.node, obstacles);
    if (through.length > 0) (out ??= [...routes])[i] = { ...route, through };
  });
  return out ?? routes;
}

/**
 * This function gives the routes with the field `through`, as `markThrough` does, with a new index of the boxes of the graph (UNMARKED-THROUGH).
 * A router with no index of its own uses it, for example `straight` and `plugs`. Their routes go through boxes by design, and the record tells it.
 */
export function markBoard(graph: Graph, routes: Route[]): Route[] {
  if (routes.length === 0) return routes;
  let size = 0;
  for (const n of graph.nodes) size += Math.max(n.box.w, n.box.h);
  return markThrough(graph, routes, new Obstacles(graph.nodes, Math.max(180, (2 * size) / Math.max(1, graph.nodes.length))));
}

/** This function gives the route with the field `through`, when it goes through a box that `ends` does not name. A clean route stays the same object. */
export function markRoute(route: Route, obstacles: Obstacles, ends: (id: string) => boolean): Route {
  const through = boxesOf(route, ends, obstacles);
  return through.length > 0 ? { ...route, through } : route;
}

/** This function gives the field `joinStopped` of a result, when the limit of the work stopped the join of the corner graph. */
export function joinNote(ways: WayFinder): { readonly joinStopped?: true } {
  return ways.corners.joinStopped ? { joinStopped: true } : {};
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
