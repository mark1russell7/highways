import { type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";
import { nodeIndex, outerGraph, type Graph, type Node, type Result, type Route, type Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { keepRules, passesThrough } from "../physics.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `nudge` (PHYSICAL): the even spacing of the parallel tracks of `shared`. */
export interface NudgeOptions {
  /** Two parallel tracks are neighbors when their projections overlap and their distance is less than this value, in units of the board. */
  readonly reach: number;
  /** The width of one lane of a track, in units of the board. A track of `k` edges has the width `k` times this value. */
  readonly lane: number;
  /** The smallest free gap between the lanes of two neighbor tracks, in units of the board. */
  readonly spacing: number;
}

/** The default options of the router `nudge`. */
export const NUDGE_DEFAULTS: Readonly<NudgeOptions> = Object.freeze({ reach: 32, lane: 4, spacing: 4 });

/** The declarations of the options of the router `nudge` (PHYSICAL). */
export const NUDGE_SCHEMA: OptionSchema<NudgeOptions> = {
  reach: { type: "number", min: 4, max: 96, step: 4, marks: [16, 32, 64], default: 32, describe: "The largest distance of two neighbor tracks." },
  lane: { type: "number", min: 0, max: 16, step: 1, marks: [0, 4, 8], default: 4, describe: "The width of one lane of a track." },
  spacing: { type: "number", min: 0, max: 32, step: 1, marks: [0, 4, 8], default: 4, describe: "The smallest free gap between the lanes of two neighbor tracks." },
};

/** One leg of a route that is parallel to an axis. It has its route, the index of its first point, its place and its span. */
interface Leg {
  readonly route: number;
  readonly i: number;
  readonly c: number;
  readonly lo: number;
  readonly hi: number;
  /** A leg at an end of its route does not move, because its plug stays. */
  readonly end: boolean;
}

/** One track: the legs of one axis on one line whose spans overlap. The edges of a lane of `shared` are on one track. */
interface Track {
  readonly c: number;
  readonly lo: number;
  readonly hi: number;
  readonly legs: readonly Leg[];
  readonly edges: number;
  readonly fixed: boolean;
}

/** The tolerance of the place of a leg, in units of the board. */
const EPS = 1e-6;

/** This function gives the tracks of the legs of one axis. The legs with one place and overlapping spans go into one track. */
function tracksOf(legs: Leg[]): Track[] {
  legs.sort((a, b) => a.c - b.c || a.lo - b.lo || a.route - b.route || a.i - b.i);
  const out: Track[] = [];
  let group: Leg[] = [];
  let hi = -Infinity;
  const flush = (): void => {
    if (group.length === 0) return;
    out.push({
      c: group[0]!.c,
      lo: Math.min(...group.map((l) => l.lo)),
      hi,
      legs: group,
      edges: new Set(group.map((l) => l.route)).size,
      fixed: group.some((l) => l.end),
    });
    group = [];
  };
  for (const l of legs) {
    if (group.length > 0 && (Math.abs(l.c - group[0]!.c) > EPS || l.lo >= hi)) flush();
    if (group.length === 0) hi = -Infinity;
    group.push(l);
    hi = Math.max(hi, l.hi);
  }
  flush();
  return out;
}

/** This function gives the groups of neighbor tracks. Two tracks are neighbors when their spans overlap and their distance is less than `reach`. */
function neighborGroups(tracks: readonly Track[], reach: number): Track[][] {
  const order = tracks.map((_, i) => i).sort((i, j) => tracks[i]!.c - tracks[j]!.c || i - j);
  const parent = tracks.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (let a = 0; a < order.length; a++) {
    const s = tracks[order[a]!]!;
    for (let b = a + 1; b < order.length; b++) {
      const t = tracks[order[b]!]!;
      if (t.c - s.c >= reach) break;
      if (t.c - s.c > EPS && Math.min(s.hi, t.hi) > Math.max(s.lo, t.lo)) parent[find(order[a]!)] = find(order[b]!);
    }
  }
  const groups = new Map<number, Track[]>();
  for (const i of order) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(tracks[i]!);
    groups.set(root, list);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

/**
 * This function gives the new places of a group of neighbor tracks, in the order of their places.
 * The free gaps between the lanes become equal, and each free gap is `spacing` or more. The middle of the group stays.
 */
export function spread(places: readonly number[], widths: readonly number[], spacing: number): number[] {
  const n = places.length;
  if (n < 2) return [...places];
  let need = 0;
  for (let k = 1; k < n; k++) need += (widths[k - 1]! + widths[k]!) / 2;
  const span = Math.max(places[n - 1]! - places[0]!, need + (n - 1) * spacing);
  const gap = (span - need) / (n - 1);
  const out = [(places[0]! + places[n - 1]!) / 2 - span / 2];
  for (let k = 1; k < n; k++) out.push(out[k - 1]! + (widths[k - 1]! + widths[k]!) / 2 + gap);
  return out;
}

/**
 * This function moves the parallel legs of the routes to even gaps (PHYSICAL, after the nudging of Wybrow, Marriott and Stuckey 2009).
 * A track is the legs of one axis on one line, so each lane of `shared` stays one lane. A track at an end of a route stays.
 * The tracks of each group of neighbors get even free gaps (`spread`). A group whose new routes go through a box stays where it is.
 */
export function nudgeRoutes(graph: Graph, start: readonly Route[], o: Readonly<NudgeOptions>): Route[] {
  const routes = start.map((r) => r.points.map((p) => ({ x: p.x, y: p.y })));
  const byId = nodeIndex(graph);
  const grid = new Grid<Node>(180);
  for (const n of graph.nodes) grid.add(n, n.box);
  const ends = new Map(graph.edges.map((e) => [e.id, [byId.get(e.source.node), byId.get(e.target.node)] as const]));
  for (const axis of ["y", "x"] as const) {
    const along = axis === "y" ? "x" : "y";
    const legs: Leg[] = [];
    routes.forEach((points, route) => {
      for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        if (Math.abs(a[axis] - b[axis]) > EPS || Math.abs(a[along] - b[along]) < EPS) continue;
        legs.push({ route, i, c: a[axis], lo: Math.min(a[along], b[along]), hi: Math.max(a[along], b[along]), end: i === 0 || i + 2 === points.length });
      }
    });
    for (const group of neighborGroups(tracksOf(legs), o.reach)) {
      if (group.every((t) => t.fixed)) continue;
      const places = spread(
        group.map((t) => t.c),
        group.map((t) => t.edges * o.lane),
        o.spacing,
      );
      const moves: { readonly p: Point & { x: number; y: number }; readonly from: number }[] = [];
      group.forEach((t, k) => {
        if (t.fixed || Math.abs(places[k]! - t.c) < EPS) return;
        for (const l of t.legs)
          for (const p of [routes[l.route]![l.i]!, routes[l.route]![l.i + 1]!]) {
            moves.push({ p, from: p[axis] });
            p[axis] = places[k]!;
          }
      });
      const touched = new Set(group.flatMap((t) => (t.fixed ? [] : t.legs.map((l) => l.route))));
      const bad = [...touched].some((route) => {
        const [s, t] = ends.get(start[route]!.edge) ?? [undefined, undefined];
        return passesThrough(grid, { edge: start[route]!.edge, points: routes[route]! }, s, t);
      });
      if (bad) for (const m of moves.reverse()) m.p[axis] = m.from;
    }
  }
  return start.map((r, e) => ({ edge: r.edge, points: routes[e]! }));
}

/** The base router of `nudge`: `shared` with the rule `byCollection`. */
const BASE = sharedRouter({ name: "shared", rule: byCollection });

/**
 * This function makes the router `nudge` (PHYSICAL). It moves the parallel legs of the routes of `shared` to even gaps (`nudgeRoutes`).
 * Each lane of `shared` stays one lane. A route that goes through a box keeps its route of `shared` (`keepRules`).
 */
export function nudgeRouter(options: Partial<NudgeOptions> & { readonly name: string; readonly maxNodes?: number }): Router {
  const o = { ...NUDGE_DEFAULTS, ...options };
  return {
    name: o.name,
    ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }),
    route(input: Graph): Result {
      const graph = outerGraph(input);
      const base = BASE.route(graph).routes;
      const { routes } = keepRules(graph, nudgeRoutes(graph, base, o), base);
      return { routes };
    },
  };
}

/**
 * The router strategy `nudge` (PHYSICAL). It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const nudgeStrategy: Strategy<"router", NudgeOptions> = defineStrategy({
  step: "router",
  name: "nudge",
  describe: "Even gaps for `shared` (PHYSICAL). The parallel tracks of the routes move to even gaps, and each lane stays one lane.",
  defaults: { ...NUDGE_DEFAULTS },
  schema: NUDGE_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<NudgeOptions>): Result => nudgeRouter({ ...o, name: "nudge" }).route(graph),
});
