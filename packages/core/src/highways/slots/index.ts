/**
 * The highway strategy `slots` (RULE-047): a pull of each route toward the lane slots of the highway skeleton.
 * An edge whose first route runs near a trunk of the plan joins that trunk when the pull is larger than its detour.
 */
import { checkProperties } from "../../bench/properties.ts";
import { dist, polylineLength, type Point } from "../../geom.ts";
import { outerGraph, type Graph } from "../../model.ts";
import { byCollection } from "../../routers/trunks.ts";
import { basePlan, firstRoutes, nearestPlace, tidyPlan, type HighwayBase } from "../base.ts";
import { follow } from "../follow.ts";
import { lengthBetween, memberAt, pointAt, type Highway, type HighwayInput, type HighwayPlan } from "../model.ts";

/** The edges that can join a trunk: only the edges with the key of the trunk, or each edge. */
export type SlotKeys = "same" | "any";

/** The values of `SlotKeys`. */
export const SLOT_KEYS: readonly SlotKeys[] = Object.freeze(["same", "any"]);

/** The options of the highway strategy `slots` (RULE-047). */
export interface SlotOptions {
  /** The weight `k` of the pull, from 0.25 to 8. The default is 2. The name is not `k`, because `follow` reads `k` as an option of its ways. */
  readonly pull: number;
  /** The reach `r` of the pull, in units, from 8 to 64. A route point farther than this distance from a trunk gets no pull. The default is 24. */
  readonly reach: number;
  /** The distance between two lanes of a trunk, in units, from 2 to 8. The default is 4. */
  readonly laneSpacing: number;
  /** The largest stretch of a route after it joins a trunk: its new length over its first length, from 1.05 to 2. The default is 1.25. */
  readonly maxStretch: number;
  /** The edges that can join a trunk. The default is `same`. */
  readonly keys: SlotKeys;
  /** The plan that gives the trunks. The default is `shared-ways`. */
  readonly from: HighwayBase;
}

/** The default options of the strategy `slots`. */
export const SLOT_DEFAULTS: Readonly<SlotOptions> = Object.freeze({ pull: 2, reach: 24, laneSpacing: 4, maxStretch: 1.25, keys: "same", from: "shared-ways" });

/** One sample of a route: a point and its length from the first point of the route. */
interface Sample {
  readonly p: Point;
  readonly arc: number;
}

/** One possible join of an edge to a trunk: the trunk, the places on its spine, the pull and the detour. */
export interface SlotJoin {
  readonly highway: number;
  readonly on: number;
  readonly off: number;
  /** The pull energy that the join removes: `k × Σ w(d) × (d - slot)² × step / r²`, in units of length. */
  readonly pull: number;
  /** The length that the join adds to the route, as an estimate. */
  readonly detour: number;
}

/** This function gives points along a polyline, one at each `step` of length, and the last point. */
function samplesOf(points: readonly Point[], step: number): Sample[] {
  const out: Sample[] = [];
  if (points.length === 0) return out;
  out.push({ p: points[0]!, arc: 0 });
  let walked = 0;
  let next = step;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = dist(a, b);
    while (len > 0 && next <= walked + len) {
      const u = (next - walked) / len;
      out.push({ p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, arc: next });
      next += step;
    }
    walked += len;
  }
  if (walked > out[out.length - 1]!.arc + 1e-9) out.push({ p: points[points.length - 1]!, arc: walked });
  return out;
}

/**
 * This function gives the best join of one route to the trunk `h`, or `undefined`.
 * The longest row of samples nearer than `reach` to the spine is the part of the route that the trunk pulls.
 * The slot of the new lane is at `laneSpacing × (lanes + 1) / 2` from the spine. The weight is `w(d) = max(0, 1 - d / r)`.
 */
export function slotJoin(route: readonly Point[], h: Highway, index: number, o: Readonly<SlotOptions>): SlotJoin | undefined {
  const step = Math.max(2, o.reach / 4);
  const samples = samplesOf(route, step);
  const offset = (o.laneSpacing * (h.lanes.length + 1)) / 2;
  let best: { from: number; to: number } | undefined;
  let start = -1;
  const near = samples.map((s) => {
    const at = nearestPlace(h.spine, s.p);
    return { at, d: dist(s.p, pointAt(h.spine, at)) };
  });
  for (let i = 0; i <= samples.length; i++) {
    const inside = i < samples.length && near[i]!.d < o.reach;
    if (inside && start < 0) start = i;
    if (!inside && start >= 0) {
      if (!best || samples[i - 1]!.arc - samples[start]!.arc > samples[best.to]!.arc - samples[best.from]!.arc) best = { from: start, to: i - 1 };
      start = -1;
    }
  }
  if (!best || best.to <= best.from) return undefined;
  const on = near[best.from]!.at;
  const off = near[best.to]!.at;
  const ride = lengthBetween(h.spine, Math.min(on, off), Math.max(on, off));
  if (ride < 2 * o.reach || Math.abs(on - off) < 1e-9) return undefined;
  let pull = 0;
  for (let i = best.from; i <= best.to; i++) {
    const d = near[i]!.d;
    const w = Math.max(0, 1 - d / o.reach);
    const gap = d - offset;
    pull += w * gap * gap;
  }
  pull = (o.pull * pull * step) / (o.reach * o.reach);
  const arc = samples[best.to]!.arc - samples[best.from]!.arc;
  const detour = near[best.from]!.d + near[best.to]!.d + ride - arc;
  return { highway: index, on, off, pull, detour };
}

/**
 * This function gives the plan of the highway strategy `slots` (RULE-047, after the pull of force-directed edge bundling, Holten and van Wijk 2009).
 * The trunks are the highways of the plan `from`. Each edge outside the plan gets a pull toward the slot of a new lane of a trunk near its first route.
 * The energy of the pull is `E = k Σ w(d_i) ‖x_i - slot_i‖²` over the samples of the route, with `w(d) = max(0, 1 - d / r)`.
 * The edge joins the trunk when the pull is larger than the length that the join adds, and the stretch stays under `maxStretch`.
 * The edge takes the trunk with the largest gain, on the outer lane. An edge that does not fit stays off the trunks.
 */
export function slotPlan(input: HighwayInput, options: Partial<SlotOptions> = {}): HighwayPlan {
  const o = { ...SLOT_DEFAULTS, ...options };
  const graph = outerGraph(input.graph);
  const first = basePlan({ ...input, graph }, o.from);
  return slotsOf(graph, first, firstRoutes({ ...input, graph }), o);
}

/** This function adds the joins of `slotPlan` to the plan `first` of the graph. It reads all the options except `from`. A join that breaks a hard rule after `follow` leaves the plan. */
export function slotsOf(graph: Graph, first: HighwayPlan, routes: ReadonlyMap<string, readonly Point[]>, options: Partial<SlotOptions> = {}): HighwayPlan {
  const o = { ...SLOT_DEFAULTS, ...options };
  if (first.highways.length === 0) return first;
  const riders = new Set(first.highways.flatMap((h) => h.members.map((m) => m.edge)));
  const added = first.highways.map(() => [] as { edge: string; on: number; off: number }[]);
  const edges = [...graph.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const e of edges) {
    if (riders.has(e.id)) continue;
    const route = routes.get(e.id);
    if (!route || route.length < 2) continue;
    const length = polylineLength(route);
    if (length <= 1e-9) continue;
    const key = byCollection(e);
    let best: SlotJoin | undefined;
    first.highways.forEach((h, i) => {
      if (o.keys === "same" && (key === undefined || h.key !== key)) return;
      const j = slotJoin(route, h, i, o);
      if (!j || j.pull <= j.detour || (length + Math.max(0, j.detour)) / length > o.maxStretch + 1e-9) return;
      if (!best || j.pull - j.detour > best.pull - best.detour + 1e-9) best = j;
    });
    if (best) added[best.highway]!.push({ edge: e.id, on: best.on, off: best.off });
  }
  const build = (): HighwayPlan =>
    tidyPlan({
      highways: first.highways.map((h, i) => {
        const more = added[i]!;
        if (more.length === 0) return h;
        return { ...h, lanes: [...h.lanes, ...more.map((m) => m.edge)], members: [...h.members, ...more.map((m) => memberAt(h.spine, m.edge, m.on, m.off, 0))] };
      }),
    });
  // A join whose route after `follow` breaks a hard rule leaves the plan. A new break of a rider takes each join of its trunks off.
  const before = new Set(checkProperties(graph, follow(graph, first), 1_000_000).flatMap((v) => (v.edge === undefined ? [] : [v.edge])));
  for (let round = 0; round < 4; round++) {
    if (added.every((list) => list.length === 0)) return first;
    const plan = build();
    const faulty = new Set(checkProperties(graph, follow(graph, plan), 1_000_000).flatMap((v) => (v.edge === undefined ? [] : [v.edge])));
    const joined = new Set(added.flatMap((list) => list.map((m) => m.edge)));
    const others = [...faulty].filter((e) => !joined.has(e) && !before.has(e));
    if (![...faulty].some((e) => joined.has(e)) && others.length === 0) return plan;
    first.highways.forEach((h, i) => {
      const hit = others.some((e) => h.members.some((m) => m.edge === e));
      added[i] = hit ? [] : added[i]!.filter((m) => !faulty.has(m.edge));
    });
  }
  return first;
}
