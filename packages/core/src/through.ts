import { NEAR_WIDTH, nodeIndex, type Graph, type Route, type Result } from "./model.ts";
import type { Obstacles } from "./visibility.ts";
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

/** This function gives the ids of the boxes that the route passes nearer than `NEAR_WIDTH` to, sorted (THIN-GAP). The boxes at the ends of the edge do not count. */
function nearOf(route: Route, ends: (id: string) => boolean, obstacles: Obstacles): readonly string[] {
  let near: Set<string> | undefined;
  for (let i = 1; i < route.points.length; i++) {
    obstacles.near(route.points[i - 1]!, route.points[i]!, NEAR_WIDTH, (n) => {
      if (!ends(n.id)) (near ??= new Set<string>()).add(n.id);
    });
  }
  return near === undefined ? [] : [...near].sort();
}

/** This function gives the route with the field `through` or the field `near`, when it has such boxes. A route with room stays the same object. */
function mark(route: Route, ends: (id: string) => boolean, obstacles: Obstacles): Route {
  const through = boxesOf(route, ends, obstacles);
  if (through.length > 0) return { ...route, through };
  const near = nearOf(route, ends, obstacles);
  return near.length > 0 ? { ...route, near } : route;
}

/**
 * This function gives the routes with the field `through` on each route that goes through a box (CORNER-REACH).
 * A route that goes through no box, but passes nearer than `NEAR_WIDTH` to a box, gets the field `near` (THIN-GAP).
 * A route with room stays the same object, so it keeps its bytes.
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
    const marked = mark(route, (id) => id === edge.source.node || id === edge.target.node, obstacles);
    if (marked !== route) (out ??= [...routes])[i] = marked;
  });
  return out ?? routes;
}

/**
 * This function gives the route with the field `through`, when it goes through a box that `ends` does not name.
 * Else it gives the route with the field `near`, when it passes nearer than `NEAR_WIDTH` to such a box. A route with room stays the same object.
 */
export function markRoute(route: Route, obstacles: Obstacles, ends: (id: string) => boolean): Route {
  return mark(route, ends, obstacles);
}

/** This function gives the field `joinStopped` of a result, when the limit of the work stopped the join of the corner graph. */
export function joinNote(ways: WayFinder): { readonly joinStopped?: true } {
  return ways.corners.joinStopped ? { joinStopped: true } : {};
}

/** This function gives the fields `through` and `near` of each route of `source` to the route of its edge in `routes`. */
export function keepThrough(source: Result, routes: Route[]): Route[] {
  const marked = new Map<string, Pick<Route, "through" | "near">>();
  for (const r of source.routes) {
    if (r.through !== undefined) marked.set(r.edge, { through: r.through });
    else if (r.near !== undefined) marked.set(r.edge, { near: r.near });
  }
  if (marked.size === 0) return routes;
  return routes.map((r) => {
    const fields = marked.get(r.edge);
    return fields === undefined ? r : { ...r, ...fields };
  });
}
