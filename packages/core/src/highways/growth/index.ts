import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, polylineLength, type Point } from "../../geom.ts";
import { orderLanes } from "../../segments.ts";
import { WayFinder } from "../../ways.ts";
import { firstRoutes, nearestPlace, tidyPlan } from "../base.ts";
import { lengthBetween, memberAt, pointAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The order of the edges in the growth: the longest first route first, or the order of the graph. */
export type GrowthOrder = "length" | "input";

/** The options of the highway strategy `growth` (HWY-055 of the note on highways). */
export interface GrowthOptions {
  /** The distance from a box to the corners of the graph. The default is 5. */
  readonly margin?: number;
  /** The number of visible neighbours of each corner. The default is 8. */
  readonly k?: number;
  /** The order of the edges. The default is `length`. */
  readonly order: GrowthOrder;
  /** The cost of the part on a spine, as a share of its length. The ramps cost their full length. The default is 0.5. */
  readonly share: number;
  /** An edge joins a highway only when its way along it is this value times its first route or shorter. The default is 1.3. */
  readonly stretch: number;
  /** A spine end extends when this number of its lanes or more go on together. The default is 3. */
  readonly extendLanes: number;
  /** The lanes go on together when their ends are this distance from their center or nearer, in units of the board. The default is 2. */
  readonly extendRadius: number;
  /** A highway with this number of edges or more stays in the plan. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `growth`. */
export const GROWTH_DEFAULTS: Readonly<GrowthOptions> = Object.freeze({ order: "length", share: 0.5, stretch: 1.3, extendLanes: 3, extendRadius: 2, minSize: 2 });

interface Grown {
  spine: Point[];
  members: { edge: string; on: number; off: number }[];
}

interface Rider {
  readonly edge: string;
  readonly ps: Point;
  readonly pt: Point;
  readonly a: Point;
  readonly b: Point;
  readonly len: number;
}

/**
 * This function gives the highways of local growth (HWY-055). The edges come one by one, by default the longest first route first.
 * Each edge joins the highway with the largest saving: its first route less its ramps and `share` of its part on the spine. Without a saving, the edge starts a highway on its own way.
 * After the growth, a spine end can go on to the center of the far ends of its lanes.
 * This occurs when `extendLanes` of them or more are near that center and the line is clear.
 */
export function growthPlan(input: HighwayInput, o: Readonly<GrowthOptions>): HighwayPlan {
  const graph = input.graph;
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const pad = finder.margin / 2;
  const routes = firstRoutes(input);
  const riders: Rider[] = edgePlugs(graph).map(({ edge, ps, pt }) => {
    const route = routes.get(edge.id);
    const a = finder.out(ps);
    const b = finder.out(pt);
    return { edge: edge.id, ps: ps.point, pt: pt.point, a, b, len: route ? polylineLength(route) : dist(ps.point, pt.point) };
  });
  if (o.order === "length") riders.sort((p, q) => q.len - p.len || (p.edge < q.edge ? -1 : p.edge > q.edge ? 1 : 0));
  const grown: Grown[] = [];
  const short = finder.margin;
  for (const r of riders) {
    let best = -1;
    let bestSave = 0;
    let bestOn = 0;
    let bestOff = 0;
    grown.forEach((h, hi) => {
      const on = nearestPlace(h.spine, r.a);
      const off = nearestPlace(h.spine, r.b);
      const part = lengthBetween(h.spine, Math.min(on, off), Math.max(on, off));
      if (part <= short) return;
      const ramps = dist(r.a, pointAt(h.spine, on)) + dist(pointAt(h.spine, off), r.b);
      if (ramps + part > o.stretch * r.len) return;
      const save = r.len - (ramps + o.share * part);
      if (save > bestSave) [best, bestSave, bestOn, bestOff] = [hi, save, on, off];
    });
    if (best >= 0) {
      grown[best]!.members.push({ edge: r.edge, on: bestOn, off: bestOff });
      continue;
    }
    const raw = finder.corners.path(r.a, r.b);
    if (!raw) continue;
    const spine = finder.corners.pull(raw);
    if (spine.length < 2 || polylineLength(spine) <= short) continue;
    grown.push({ spine, members: [{ edge: r.edge, on: 0, off: spine.length - 1 }] });
  }

  // A spine end goes on while enough of its lanes go on together.
  const byEdge = new Map(riders.map((r) => [r.edge, r]));
  const radius = o.extendRadius * boardUnit(graph);
  const need = Math.max(2, Math.round(o.extendLanes));
  for (const h of grown) {
    for (const end of ["first", "last"] as const) {
      const last = h.spine.length - 1;
      const at = end === "first" ? 0 : last;
      // The far point of each lane at this end: the point out of the plug that the lane goes to or comes from.
      const far: { m: Grown["members"][number]; side: "on" | "off"; p: Point }[] = [];
      for (const m of h.members) {
        const r = byEdge.get(m.edge)!;
        if (m.on === at) far.push({ m, side: "on", p: r.a });
        else if (m.off === at) far.push({ m, side: "off", p: r.b });
      }
      if (far.length < need) continue;
      const c = { x: far.reduce((s, f) => s + f.p.x, 0) / far.length, y: far.reduce((s, f) => s + f.p.y, 0) / far.length };
      const near = far.filter((f) => dist(f.p, c) <= radius);
      const tip = h.spine[at]!;
      if (near.length < need || dist(tip, c) <= short) continue;
      if (finder.obstacles.inside(c, pad) || !finder.obstacles.clear(tip, c, pad)) continue;
      if (end === "first") {
        h.spine.unshift(c);
        for (const m of h.members) [m.on, m.off] = [m.on + 1, m.off + 1];
        for (const f of near) f.m[f.side] = 0;
      } else {
        h.spine.push(c);
        for (const f of near) f.m[f.side] = last + 1;
      }
    }
  }

  const highways: Highway[] = [];
  grown.forEach((h, hi) => {
    if (h.members.length < Math.max(2, o.minSize)) return;
    const spine = h.spine;
    const back = [...spine].reverse();
    const lanes = orderLanes(
      spine,
      h.members.map((m) => {
        const r = byEdge.get(m.edge)!;
        return { edge: m.edge, points: m.on <= m.off ? [r.ps, r.a, ...spine, r.b, r.pt] : [r.ps, r.a, ...back, r.b, r.pt] };
      }),
      "bundle",
    );
    const byLane = new Map(h.members.map((m) => [m.edge, m]));
    const members: HighwayMember[] = lanes.map((edge) => {
      const m = byLane.get(edge)!;
      return memberAt(spine, edge, m.on, m.off);
    });
    highways.push({ id: `h${hi}`, key: `g${hi}`, spine, lanes, members });
  });
  return tidyPlan({ highways });
}
