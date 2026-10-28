import { center, dist, pointBoxDistance, type Point } from "../geom.ts";
import { fixedPortPoint, nodeIndex, outerGraph, type End, type Graph, type Node, type Result, type Route, type SharedRun } from "../model.ts";
import { placePlug } from "../plugs.ts";
import { orderLanes, type RunOrder } from "../segments.ts";
import { WayFinder, type WayOptions } from "../ways.ts";
import { pointAt, type HighwayMember, type HighwayPlan } from "./model.ts";

/** The options of `follow`. */
export interface FollowOptions extends WayOptions {
  /**
   * These routes are the routes of the base router. Each edge outside the plan keeps its route from them.
   * Without them, or for an edge without a route in them, `follow` routes the edge as the router `corners` does.
   */
  readonly routes?: Result;
  /** The lane order of the shared runs. The default is `bundle`. */
  readonly laneOrder?: RunOrder;
}

const SAME = 1e-6;

const dedupe = (p: readonly Point[]): Point[] => p.filter((q, i) => i === 0 || dist(q, p[i - 1]!) > SAME);

/** This function tells if a polyline holds the points of `part` in a row, in this order. */
function holdsInOrder(p: readonly Point[], part: readonly Point[]): boolean {
  for (let i = 0; i + part.length <= p.length; i++) {
    let ok = true;
    for (let j = 0; ok && j < part.length; j++) ok = dist(p[i + j]!, part[j]!) <= SAME;
    if (ok) return true;
  }
  return false;
}

/** This function tells if a polyline holds the points of `part` in a row, in either direction. */
const holds = (p: readonly Point[], part: readonly Point[]): boolean => holdsInOrder(p, part) || holdsInOrder(p, [...part].reverse());

/**
 * This function tells if a point of a spine can be the plug of an end. The point is on the box of the node.
 * When the end has a fixed plug, the point is at that plug.
 */
function plugAt(node: Node, end: End, p: Point): boolean {
  if (pointBoxDistance(p, node.box) > SAME) return false;
  const fixed = fixedPortPoint(node, end);
  return fixed === undefined || dist(fixed, p) <= SAME;
}

/** The stops of one spine: each point of the spine and each merge point and split point, by their place, in order. */
type Stops = readonly (readonly [at: number, point: Point])[];

/** This function gives the points of the stops from the place `on` to the place `off`. When `on` is larger than `off`, the points go backward. */
function slice(stops: Stops, on: number, off: number): Point[] {
  const lo = Math.min(on, off);
  const hi = Math.max(on, off);
  const out = stops.filter(([at]) => at >= lo && at <= hi).map(([, p]) => p);
  return on <= off ? out : out.reverse();
}

/**
 * This function routes the edges along a highway plan.
 *
 * An edge of a highway goes from its source plug to its merge point. Then it goes along the spine to its split point, and to its target plug.
 * The ramps go around the boxes through the corner graph (`WayFinder.fromPlug` and `WayFinder.toPlug`).
 * A spine point on the box of the node is the plug itself. When the end has a fixed plug, the point is at that plug.
 *
 * An edge on several highways takes them in the order of `seq`.
 * A way through the corner graph goes from each split point to the next merge point.
 * An edge outside the plan keeps its route from `options.routes`, or goes as in the router `corners`.
 *
 * The result has a shared run for each stretch of a spine where the same two edges or more go. Each run holds the points of its routes in a row.
 * The same graph, plan and options give the same result.
 */
export function follow(input: Graph, plan: HighwayPlan, options: FollowOptions = {}): Result {
  const graph = outerGraph(input);
  const byId = nodeIndex(graph);
  const ways = new WayFinder(graph.nodes, options);
  const base = new Map((options.routes?.routes ?? []).map((r) => [r.edge, r.points]));
  const lines: Stops[] = plan.highways.map((h) => {
    const stops = new Map<number, Point>(h.spine.map((p, i) => [i, p]));
    for (const m of h.members) for (const at of [m.on, m.off]) if (!stops.has(at)) stops.set(at, pointAt(h.spine, at));
    return [...stops].sort((a, b) => a[0] - b[0]);
  });
  const trips = new Map<string, { h: number; m: HighwayMember }[]>();
  plan.highways.forEach((h, hi) => {
    for (const m of h.members) {
      const list = trips.get(m.edge);
      if (list) list.push({ h: hi, m });
      else trips.set(m.edge, [{ h: hi, m }]);
    }
  });
  for (const list of trips.values()) list.sort((a, b) => a.m.seq - b.m.seq || a.h - b.h);

  const routes: Route[] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    const trip = trips.get(e.id);
    if (!trip) {
      const known = base.get(e.id);
      if (known) {
        routes.push({ edge: e.id, points: known });
        continue;
      }
      const ps = placePlug(s, e.source, center(t.box));
      const pt = placePlug(t, e.target, center(s.box));
      routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
      continue;
    }
    const out: Point[] = [];
    let at: Point | undefined;
    for (const { h, m } of trip) {
      const piece = slice(lines[h]!, m.on, m.off);
      const first = piece[0]!;
      if (at === undefined) {
        if (!plugAt(s, e.source, first)) {
          const ps = placePlug(s, e.source, first);
          out.push(...(ways.fromPlug(ps, first) ?? [ps.point, first]));
        }
      } else if (dist(at, first) > SAME) {
        const way = ways.corners.path(at, first);
        out.push(...(way ? ways.corners.pull(way) : [at, first]));
      }
      out.push(...piece);
      at = piece[piece.length - 1]!;
    }
    if (at !== undefined && !plugAt(t, e.target, at)) {
      const pt = placePlug(t, e.target, at);
      out.push(...(ways.toPlug(at, pt) ?? [at, pt.point]));
    }
    routes.push({ edge: e.id, points: dedupe(out) });
  }

  // The runs: each stretch between two stops of a spine, with the same two edges or more on it, joined with the next stretch of the same edges.
  const routeOf = new Map(routes.map((r) => [r.edge, r]));
  const runs: SharedRun[] = [];
  plan.highways.forEach((h, hi) => {
    const stops = lines[hi]!;
    const usersOf = (k: number): string[] =>
      h.members
        .filter((m) => routeOf.has(m.edge) && Math.min(m.on, m.off) <= stops[k]![0] && Math.max(m.on, m.off) >= stops[k + 1]![0])
        .map((m) => m.edge)
        .sort();
    let k = 0;
    while (k < stops.length - 1) {
      const users = usersOf(k);
      let end = k + 1;
      while (end < stops.length - 1 && usersOf(end).join("\u0000") === users.join("\u0000")) end++;
      const points = dedupe(stops.slice(k, end + 1).map(([, p]) => p));
      k = end;
      if (users.length < 2 || points.length < 2) continue;
      const mine = users.map((id) => routeOf.get(id)!).filter((r) => holds(r.points, points));
      if (mine.length < 2) continue;
      runs.push({ id: `r${runs.length}`, key: h.key, points, edges: orderLanes(points, mine, options.laneOrder ?? "bundle") });
    }
  });
  return runs.length > 0 ? { routes, runs } : { routes };
}
