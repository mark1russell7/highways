import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, polylineLength, type Point } from "../../geom.ts";
import { orderLanes } from "../../segments.ts";
import { WayFinder } from "../../ways.ts";
import { basePlan, firstRoutes, nearestPlace, tidyPlan } from "../base.ts";
import { lengthBetween, memberAt, pointAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";
import { spinePart } from "../snap.ts";
import { edgePlugs } from "../stretches.ts";

/** The plan that gives the highways of the network: the plan of `corridors` or of `shared-ways`, with their defaults. */
export type InterchangeBase = "corridors" | "shared-ways";

/** The values of `InterchangeBase`. */
export const INTERCHANGE_BASES: readonly InterchangeBase[] = Object.freeze(["corridors", "shared-ways"]);

/** The options of the highway strategy `interchanges` (HWY-060 of the note on highways). */
export interface InterchangeOptions {
  /** The plan that gives the highways. The default is `corridors`. */
  readonly from: InterchangeBase;
  /** The cost of a change between two highways, in units of the board, from 0 to 8. The default is 2. */
  readonly changeCost: number;
  /** The largest number of interchanges, from 1 to 32. The default is 16. */
  readonly interchanges: number;
  /** The largest number of highways on the way of one edge, from 1 to 3. The default is 2. */
  readonly perEdge: number;
  /** Two highways get an interchange where they come this near, in units of the board. The default is 2. */
  readonly radius: number;
  /** The cost of a length on a highway against a length off the highways, from 0.1 to 1. The default is 0.5. */
  readonly discount: number;
  /** An edge rides the network only when its way is this many times its first route or less. The default is 1.5. */
  readonly detour: number;
}

/** The default options of the strategy `interchanges`. */
export const INTERCHANGE_DEFAULTS: Readonly<InterchangeOptions> = Object.freeze({ from: "corridors", changeCost: 2, interchanges: 16, perEdge: 2, radius: 2, discount: 0.5, detour: 1.5 });

/** The largest number of candidate interchanges of the first pass. */
const MAX_CANDIDATES = 64;

/** One interchange: a place on the highway `h`, a place on the highway `g`, and the length of the link between the two places. */
export interface Interchange {
  readonly h: number;
  readonly hAt: number;
  readonly g: number;
  readonly gAt: number;
  readonly gap: number;
}

/** The nearest points of the segments `a b` and `c d`, as the parameters `s` and `t` from 0 to 1, with their distance. */
function nearestOfSegments(a: Point, b: Point, c: Point, d: Point): { s: number; t: number; d: number } {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;
  const at = (s: number, t: number): number => {
    const dx = a.x + s * ux - (c.x + t * vx);
    const dy = a.y + s * uy - (c.y + t * vy);
    // `Math.sqrt` is exact on each platform. `Math.hypot` is not.
    return Math.sqrt(dx * dx + dy * dy);
  };
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  const uu = ux * ux + uy * uy;
  const vv = vx * vx + vy * vy;
  const project = (p: Point, q: Point, x: number, y: number, len: number): number => (len > 0 ? clamp(((p.x - q.x) * x + (p.y - q.y) * y) / len) : 0);
  // The four ends against the other segment, and the crossing point, give the nearest pair.
  const tries: [number, number][] = [
    [0, project(a, c, vx, vy, vv)],
    [1, project(b, c, vx, vy, vv)],
    [project(c, a, ux, uy, uu), 0],
    [project(d, a, ux, uy, uu), 1],
  ];
  const den = ux * vy - uy * vx;
  if (Math.abs(den) > 1e-12) {
    const s = ((c.x - a.x) * vy - (c.y - a.y) * vx) / den;
    const t = ((c.x - a.x) * uy - (c.y - a.y) * ux) / den;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) tries.push([s, t]);
  }
  let best = { s: 0, t: 0, d: Infinity };
  for (const [s, t] of tries) {
    const v = at(s, t);
    if (v < best.d - 1e-12) best = { s, t, d: v };
  }
  return best;
}

/** This function gives the candidate interchanges: the nearest places of each pair of spines that come within `radius`, with a link in clear view. */
export function interchangeCandidates(spines: readonly (readonly Point[])[], radius: number, clear: (a: Point, b: Point) => boolean): Interchange[] {
  const out: Interchange[] = [];
  for (let h = 0; h < spines.length; h++) {
    for (let g = h + 1; g < spines.length; g++) {
      const p = spines[h]!;
      const q = spines[g]!;
      let best: Interchange | undefined;
      for (let i = 0; i + 1 < p.length; i++) {
        for (let j = 0; j + 1 < q.length; j++) {
          const n = nearestOfSegments(p[i]!, p[i + 1]!, q[j]!, q[j + 1]!);
          if (n.d <= radius && (!best || n.d < best.gap - 1e-12)) best = { h, hAt: i + n.s, g, gAt: j + n.t, gap: n.d };
        }
      }
      if (best && (best.gap <= 1e-9 || clear(pointAt(p, best.hAt), pointAt(q, best.gAt)))) out.push(best);
    }
  }
  return out.sort((x, y) => x.gap - y.gap || x.h - y.h || x.g - y.g).slice(0, MAX_CANDIDATES);
}

/** One leg of the way of an edge: the highway and its two places. */
interface Leg {
  readonly h: number;
  readonly on: number;
  readonly off: number;
}

/** The best way of one edge over the network, with the interchanges that it uses. */
interface Trip {
  readonly legs: readonly Leg[];
  readonly used: readonly number[];
}

/**
 * This function gives the highways of a network with interchanges (HWY-060). The highways come from a plan. Two highways that come near get an interchange.
 * Each edge takes its cheapest way: a ride on one highway, or on up to `perEdge` highways with a change at an interchange.
 * A change costs `changeCost` units. The interchanges that the most edges use stay, up to `interchanges`.
 */
export function interchangePlan(input: HighwayInput, o: Readonly<InterchangeOptions>): HighwayPlan {
  const graph = input.graph;
  const base = basePlan(input, o.from);
  const spines = base.highways.map((h) => h.spine);
  if (spines.length === 0) return { highways: [] };
  const finder = new WayFinder(graph.nodes);
  const pad = finder.margin / 2;
  const unit = boardUnit(graph);
  const first = firstRoutes(input);
  const change = Math.max(0, o.changeCost) * unit;
  const perEdge = Math.min(3, Math.max(1, Math.round(o.perEdge)));
  const disc = Math.min(1, Math.max(0.05, o.discount));
  const ride = (h: number, a: number, b: number): number => lengthBetween(spines[h]!, Math.min(a, b), Math.max(a, b));
  const edges = edgePlugs(graph).map((p) => {
    const s = finder.out(p.ps);
    const t = finder.out(p.pt);
    const route = first.get(p.edge.id);
    const ends = spines.map((spine) => {
      const on = nearestPlace(spine, s);
      const off = nearestPlace(spine, t);
      return { on, off, rampIn: dist(s, pointAt(spine, on)), rampOut: dist(pointAt(spine, off), t) };
    });
    return { edge: p.edge.id, s, t, base: route ? polylineLength(route) : dist(s, t), ends };
  });

  // The cheapest way of one edge over the interchanges `list`. The cost counts a ride at `disc` times its length. Each leg is one margin long or more.
  const tripOf = (e: (typeof edges)[number], list: readonly Interchange[]): Trip | undefined => {
    const found: { cost: number; trip: Trip | undefined } = { cost: Infinity, trip: undefined };
    const offer = (cost: number, length: number, trip: Trip): void => {
      if (trip.legs.some((l) => ride(l.h, l.on, l.off) < finder.margin)) return;
      if (cost >= e.base || length > o.detour * e.base) return;
      if (cost < found.cost - 1e-9) [found.cost, found.trip] = [cost, trip];
    };
    spines.forEach((_, h) => {
      const x = e.ends[h]!;
      const r = ride(h, x.on, x.off);
      offer(x.rampIn + disc * r + x.rampOut, x.rampIn + r + x.rampOut, { legs: [{ h, on: x.on, off: x.off }], used: [] });
    });
    if (perEdge < 2) return found.trip;
    // Each interchange, in both directions: on `p` at its place `pAt`, then off at the place `qAt` of `q`.
    const sides = list.flatMap((c, i) => [
      { i, p: c.h, pAt: c.hAt, q: c.g, qAt: c.gAt, gap: c.gap },
      { i, p: c.g, pAt: c.gAt, q: c.h, qAt: c.hAt, gap: c.gap },
    ]);
    for (const a of sides) {
      const x = e.ends[a.p]!;
      const y = e.ends[a.q]!;
      const r1 = ride(a.p, x.on, a.pAt);
      const r2 = ride(a.q, a.qAt, y.off);
      offer(x.rampIn + disc * (r1 + r2) + a.gap + change + y.rampOut, x.rampIn + r1 + r2 + a.gap + y.rampOut, {
        legs: [
          { h: a.p, on: x.on, off: a.pAt },
          { h: a.q, on: a.qAt, off: y.off },
        ],
        used: [a.i],
      });
      if (perEdge < 3) continue;
      for (const b of sides) {
        if (b.p !== a.q || b.q === a.p || b.i === a.i) continue;
        const z = e.ends[b.q]!;
        const r3 = ride(a.q, a.qAt, b.pAt);
        const r4 = ride(b.q, b.qAt, z.off);
        offer(x.rampIn + disc * (r1 + r3 + r4) + a.gap + b.gap + 2 * change + z.rampOut, x.rampIn + r1 + r3 + r4 + a.gap + b.gap + z.rampOut, {
          legs: [
            { h: a.p, on: x.on, off: a.pAt },
            { h: a.q, on: a.qAt, off: b.pAt },
            { h: b.q, on: b.qAt, off: z.off },
          ],
          used: [a.i, b.i],
        });
      }
    }
    return found.trip;
  };

  const clear = (a: Point, b: Point): boolean => finder.obstacles.clear(a, b, pad);
  const candidates = interchangeCandidates(spines, Math.max(0, o.radius) * unit, clear);
  // The first pass counts the edges at each candidate. The busiest candidates stay for the second pass.
  const use = new Array<number>(candidates.length).fill(0);
  for (const e of edges) for (const i of tripOf(e, candidates)?.used ?? []) use[i] = use[i]! + 1;
  const kept = candidates
    .map((c, i) => ({ c, i, n: use[i]! }))
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n || x.i - y.i)
    .slice(0, Math.max(1, Math.round(o.interchanges)))
    .sort((x, y) => x.i - y.i)
    .map((x) => x.c);

  const riders = spines.map(() => [] as { edge: string; on: number; off: number; seq: number; points: Point[] }[]);
  for (const e of edges) {
    const trip = tripOf(e, kept);
    if (!trip) continue;
    trip.legs.forEach((l, seq) => riders[l.h]!.push({ edge: e.edge, on: l.on, off: l.off, seq, points: [e.s, ...spinePart(spines[l.h]!, l.on, l.off), e.t] }));
  }
  const highways: Highway[] = [];
  spines.forEach((spine, h) => {
    const list = riders[h]!;
    if (list.length < 2) return;
    const lanes = orderLanes(spine, list.map((r) => ({ edge: r.edge, points: r.points })), "bundle");
    const byEdge = new Map(list.map((r) => [r.edge, r]));
    const members: HighwayMember[] = lanes.map((edge) => {
      const r = byEdge.get(edge)!;
      return memberAt(spine, edge, r.on, r.off, r.seq);
    });
    highways.push({ id: `h${h}`, key: base.highways[h]!.key, spine, lanes, members });
  });
  return tidyPlan({ highways });
}
