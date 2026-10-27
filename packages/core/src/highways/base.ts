import { dist, type Point } from "../geom.ts";
import type { Graph, Result, Route } from "../model.ts";
import { byCollection } from "../routers/trunks.ts";
import { CORRIDOR_DEFAULTS, corridorPlan } from "./corridors/index.ts";
import { follow } from "./follow.ts";
import type { Highway, HighwayInput, HighwayMember, HighwayPlan } from "./model.ts";
import { sharedWaysPlan } from "./shared-ways/index.ts";

/**
 * The plan that a post step changes. `none` is the empty plan: `follow` then routes each edge as the router `corners` does.
 * `shared-ways` and `corridors` are the plans of those highway strategies, with their defaults.
 */
export type HighwayBase = "none" | "shared-ways" | "corridors";

/** The values of `HighwayBase`. */
export const HIGHWAY_BASES: readonly HighwayBase[] = Object.freeze(["none", "shared-ways", "corridors"]);

/** This function gives the plan of a base. */
export function basePlan(input: HighwayInput, base: HighwayBase): HighwayPlan {
  if (base === "shared-ways") return sharedWaysPlan(input, { rule: byCollection });
  if (base === "corridors") return corridorPlan(input, CORRIDOR_DEFAULTS);
  return { highways: [] };
}

/** This function gives the routes of a plan after `follow`, with the default way finder. The plan `none` gives the first routes of the edges. */
export function planRoutes(graph: Graph, plan: HighwayPlan): Result {
  return follow(graph, plan);
}

/** This function gives the first route of each edge: the route of `input.routes`, or the route of the empty plan after `follow`. */
export function firstRoutes(input: HighwayInput): Map<string, readonly Point[]> {
  const given = routeIndex(input.routes?.routes ?? []);
  const known = new Set(input.graph.edges.map((e) => e.id));
  if (input.graph.edges.every((e) => given.has(e.id))) return given;
  const made = routeIndex(planRoutes(input.graph, { highways: [] }).routes);
  for (const [edge, points] of given) if (known.has(edge)) made.set(edge, points);
  return made;
}

/** One stop of the trip of an edge: the index of the highway in the plan, and the member. */
export interface TripStop {
  readonly h: number;
  readonly m: HighwayMember;
}

/** This function gives the trip of each edge of a plan. The trip is its highways in the order of `seq`, then in the order of the plan. */
export function tripsOf(plan: HighwayPlan): Map<string, TripStop[]> {
  const trips = new Map<string, TripStop[]>();
  plan.highways.forEach((h, hi) => {
    for (const m of h.members) {
      const list = trips.get(m.edge);
      if (list) list.push({ h: hi, m });
      else trips.set(m.edge, [{ h: hi, m }]);
    }
  });
  for (const list of trips.values()) list.sort((a, b) => a.m.seq - b.m.seq || a.h - b.h);
  return trips;
}

/**
 * This function gives a plan with the same trips, and with `seq` from 0 to the number of highways of the edge less 1.
 * A post step can give `seq` values with gaps or below 0, and this function makes them whole again.
 * It also drops each highway with fewer than two members, and gives the highways new ids in order.
 */
export function tidyPlan(plan: HighwayPlan): HighwayPlan {
  const kept = plan.highways.filter((h) => h.members.length >= 2);
  const seq = new Map<string, number>();
  for (const list of tripsOf({ highways: kept }).values()) list.forEach((stop, i) => seq.set(`${stop.h}\u0000${stop.m.edge}`, i));
  const highways: Highway[] = kept.map((h, hi) => ({
    ...h,
    id: `h${hi}`,
    lanes: h.lanes.filter((e) => h.members.some((m) => m.edge === e)),
    members: h.members.map((m) => ({ ...m, seq: seq.get(`${hi}\u0000${m.edge}`) ?? 0 })),
  }));
  return { highways };
}

/** This function gives the place along a polyline (as a length from its first point) of the point of the polyline nearest to `p`. */
export function arcPlace(line: readonly Point[], p: Point): number {
  let best = Infinity;
  let at = 0;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = dist(a, b);
    const u = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len))) : 0;
    const d = dist(p, { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    if (d < best) [best, at] = [d, walked + u * len];
    walked += len;
  }
  return at;
}

/** This function gives the place on a spine (the index of a point plus the share of the next leg) of the point of the spine nearest to `p`. */
export function nearestPlace(spine: readonly Point[], p: Point): number {
  let best = Infinity;
  let at = 0;
  for (let i = 1; i < spine.length; i++) {
    const a = spine[i - 1]!;
    const b = spine[i]!;
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0;
    const d = dist(p, { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    if (d < best) [best, at] = [d, i - 1 + u];
  }
  return at;
}

/**
 * This function gives a plan where the `seq` of each member follows the place of its merge point along the route of its edge.
 * A post step that adds highways to the trips of edges uses it. Equal places keep the order of `seq`.
 */
export function orderAlongRoutes(plan: HighwayPlan, routes: ReadonlyMap<string, readonly Point[]>): HighwayPlan {
  const rank = new Map<string, number>();
  for (const [edge, list] of tripsOf(plan)) {
    const route = routes.get(edge);
    const placed = list.map((stop, i) => ({ stop, i, at: route ? arcPlace(route, stop.m.merge) : i }));
    placed.sort((a, b) => a.at - b.at || a.i - b.i);
    placed.forEach((p, k) => rank.set(`${p.stop.h}\u0000${edge}`, k));
  }
  return { highways: plan.highways.map((h, hi) => ({ ...h, members: h.members.map((m) => ({ ...m, seq: rank.get(`${hi}\u0000${m.edge}`) ?? m.seq })) })) };
}

/** This function gives the route of each edge by its id. */
export const routeIndex = (routes: readonly Route[]): Map<string, readonly Point[]> => new Map(routes.map((r) => [r.edge, r.points]));
