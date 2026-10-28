import { dist, polylineLength, type Point } from "../../geom.ts";
import { orderLanes } from "../../segments.ts";
import { WayFinder } from "../../ways.ts";
import { firstRoutes, nearestPlace, tidyPlan } from "../base.ts";
import { lengthBetween, memberAt, pointAt, type Highway, type HighwayInput, type HighwayPlan } from "../model.ts";
import { candidatePlan, type CandidateSource } from "../select/index.ts";
import { spinePart } from "../snap.ts";
import { edgePlugs, sharedStretches } from "../stretches.ts";

/** A generator of candidate arcs: `runs` (the shared stretches of the first ways of all edges) or a generator of the strategy `select`. */
export type ArcSource = "runs" | CandidateSource;

/** The values of `ArcSource`. */
export const ARC_SOURCES: readonly ArcSource[] = Object.freeze(["runs", "corridors", "quickbundles", "wspd", "road-classes", "flow-field", "od-cells", "shared-ways"]);

/** The options of the highway strategy `hub-arcs` (HWY-042 of the note on highways). */
export interface HubArcOptions {
  /** The largest number of arcs (highways). The default is 12. */
  readonly q: number;
  /** The cost of a length on an arc against a length off the arcs, from 0 to 1. The default is 0.5. */
  readonly alpha: number;
  /** An edge rides an arc only when its legs plus its part of the arc are this many times its first route or less. The default is 1.25. */
  readonly stretch: number;
  /** The number of passes of the local search with one swap. The default is 1. */
  readonly swaps: number;
  /** An arc with fewer edges than this number is not a highway. The default is 2. */
  readonly minSize: number;
  /** The generators of the candidate arcs. The default is `runs`, `corridors` and `road-classes`. */
  readonly generators: readonly ArcSource[];
}

/** The default options of the strategy `hub-arcs`. */
export const HUB_ARC_DEFAULTS: Readonly<HubArcOptions> = Object.freeze({
  q: 12,
  alpha: 0.5,
  stretch: 1.25,
  swaps: 1,
  minSize: 2,
  generators: Object.freeze(["runs", "corridors", "road-classes"] as ArcSource[]),
});

/** The largest number of candidate arcs. The longest arcs stay. */
const MAX_ARCS = 400;

/** The place of one edge on one arc: where it joins and leaves, and the cost it saves against its first route. */
interface Ride {
  readonly on: number;
  readonly off: number;
  readonly save: number;
}

/** This function gives the candidate arcs: the spines of the plans of the generators, without the copies, with the longest first. */
export function candidateArcs(input: HighwayInput, generators: readonly ArcSource[]): Point[][] {
  const spines: Point[][] = [];
  for (const g of generators) {
    const plan = g === "runs" ? runsPlan(input) : candidatePlan(input, g);
    for (const h of plan.highways) spines.push([...h.spine]);
  }
  const seen = new Set<string>();
  const out: Point[][] = [];
  for (const s of spines) {
    if (s.length < 2 || polylineLength(s) <= 1e-6) continue;
    const key = s.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(";");
    const back = [...s].reverse().map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(";");
    if (seen.has(key) || seen.has(back)) continue;
    seen.add(key);
    out.push(s);
  }
  out.sort((a, b) => polylineLength(b) - polylineLength(a));
  return out.slice(0, MAX_ARCS);
}

/** This function gives the shared stretches of the first ways of all edges, with no keys. */
function runsPlan(input: HighwayInput): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes);
  const ways = edgePlugs(input.graph).map(({ edge, ps, pt }) => {
    const a = finder.out(ps);
    const b = finder.out(pt);
    return { edge: edge.id, key: "", points: finder.corners.path(a, b) ?? [a, b] };
  });
  return sharedStretches(ways, { minSize: 2, pull: (p) => finder.corners.pull(p) });
}

/**
 * This function gives the highways of the hub arc location (Campbell, Ernst and Krishnamoorthy 2005). It chooses at most `q` arcs from the candidates.
 * An edge on an arc costs its two legs plus `alpha` times its part of the arc. An edge off the arcs costs its first route.
 * The greedy step adds the arc that saves the most cost. Then each swap pass changes one chosen arc for one other arc while the saving grows.
 * Each edge rides the arc that saves the most for it.
 */
export function hubArcPlan(input: HighwayInput, o: Readonly<HubArcOptions>): HighwayPlan {
  const margin = 5;
  const routes = firstRoutes(input);
  const plugs = edgePlugs(input.graph);
  const arcs = candidateArcs(input, o.generators);
  const q = Math.max(0, Math.round(o.q));
  if (q === 0 || arcs.length === 0) return { highways: [] };
  // The saving of each edge on each arc. A saving of 0 means that the edge does not ride the arc.
  const rides: (Ride | undefined)[][] = arcs.map((spine) =>
    plugs.map(({ edge, ps, pt }) => {
      const first = routes.get(edge.id);
      const base = first ? polylineLength(first) : dist(ps.point, pt.point);
      const on = nearestPlace(spine, ps.point);
      const off = nearestPlace(spine, pt.point);
      const along = lengthBetween(spine, Math.min(on, off), Math.max(on, off));
      if (along < margin) return undefined;
      const legs = dist(ps.point, pointAt(spine, on)) + dist(pointAt(spine, off), pt.point);
      if (legs + along > o.stretch * base) return undefined;
      const save = base - (legs + o.alpha * along);
      return save > 0 ? { on, off, save } : undefined;
    }),
  );
  const n = plugs.length;
  const total = (chosen: readonly number[]): number => {
    let sum = 0;
    for (let e = 0; e < n; e++) {
      let best = 0;
      for (const a of chosen) best = Math.max(best, rides[a]![e]?.save ?? 0);
      sum += best;
    }
    return sum;
  };
  const chosen: number[] = [];
  while (chosen.length < q) {
    const now = total(chosen);
    let pick = -1;
    let gain = 1e-9;
    for (let a = 0; a < arcs.length; a++) {
      if (chosen.includes(a)) continue;
      const g = total([...chosen, a]) - now;
      if (g > gain) [gain, pick] = [g, a];
    }
    if (pick < 0) break;
    chosen.push(pick);
  }
  for (let pass = 0; pass < Math.round(o.swaps); pass++) {
    let better = false;
    for (let i = 0; i < chosen.length; i++) {
      const now = total(chosen);
      let pick = -1;
      let gain = 1e-9;
      for (let a = 0; a < arcs.length; a++) {
        if (chosen.includes(a)) continue;
        const next = chosen.map((x, j) => (j === i ? a : x));
        const g = total(next) - now;
        if (g > gain) [gain, pick] = [g, a];
      }
      if (pick >= 0) {
        chosen[i] = pick;
        better = true;
      }
    }
    if (!better) break;
  }
  // Each edge rides its best arc.
  const riders = new Map<number, { edge: string; ride: Ride; points: Point[] }[]>();
  plugs.forEach(({ edge, ps, pt }, e) => {
    let best = -1;
    for (const a of chosen) if ((rides[a]![e]?.save ?? 0) > (best < 0 ? 0 : rides[best]![e]!.save)) best = a;
    if (best < 0) return;
    const ride = rides[best]![e]!;
    const list = riders.get(best) ?? [];
    list.push({ edge: edge.id, ride, points: [ps.point, ...spinePart(arcs[best]!, ride.on, ride.off), pt.point] });
    riders.set(best, list);
  });
  const highways: Highway[] = [];
  for (const a of [...chosen].sort((x, y) => x - y)) {
    const list = riders.get(a) ?? [];
    if (list.length < Math.max(2, o.minSize)) continue;
    const spine = arcs[a]!;
    const lanes = orderLanes(spine, list.map((r) => ({ edge: r.edge, points: r.points })), "bundle");
    const byEdge = new Map(list.map((r) => [r.edge, r.ride]));
    highways.push({
      id: `h${highways.length}`,
      key: `a${a}`,
      spine,
      lanes,
      members: lanes.map((edge) => memberAt(spine, edge, byEdge.get(edge)!.on, byEdge.get(edge)!.off)),
    });
  }
  return tidyPlan({ highways });
}
