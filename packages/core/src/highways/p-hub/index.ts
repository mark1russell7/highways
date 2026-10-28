import { center, dist, polylineLength, type Point } from "../../geom.ts";
import { buildSections, type Section } from "../../sections.ts";
import { WayFinder } from "../../ways.ts";
import { firstRoutes } from "../base.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { snapPlan, type SnapLine, type SnapMember } from "../snap.ts";
import { edgePlugs } from "../stretches.ts";

/** The allocation of the edges to the hubs: `single` (each node to its nearest hub) or `multiple` (each edge to its best pair of hubs). */
export type HubAllocation = "single" | "multiple";

/** The values of `HubAllocation`. */
export const HUB_ALLOCATIONS: readonly HubAllocation[] = Object.freeze(["single", "multiple"]);

/** The candidate points of the hubs: the corners of the corner graph, or the centres of the cells of the tree of sections. */
export type HubCandidates = "corners" | "sections";

/** The values of `HubCandidates`. */
export const HUB_CANDIDATES: readonly HubCandidates[] = Object.freeze(["corners", "sections"]);

/** The options of the highway strategy `p-hub` (HWY-041 of the note on highways). */
export interface PHubOptions {
  /** The number of hubs. The value 0 gives the root of the number of nodes, rounded. The default is 0. */
  readonly p: number;
  /** The cost of a length on a link between two hubs against a length off the links, from 0 to 1. The default is 0.5. */
  readonly alpha: number;
  /** The allocation of the edges to the hubs. The default is `single`. */
  readonly allocation: HubAllocation;
  /** The candidate points of the hubs. The default is `corners`. */
  readonly candidates: HubCandidates;
  /** An edge rides a link only when its way through the two hubs is this many times its first route or less. The default is 1.25. */
  readonly detour: number;
  /** The number of passes of the local search with one swap of a hub. The default is 1. */
  readonly swaps: number;
  /** A link with fewer edges than this number is not a highway. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `p-hub`. */
export const P_HUB_DEFAULTS: Readonly<PHubOptions> = Object.freeze({ p: 0, alpha: 0.5, allocation: "single", candidates: "corners", detour: 1.25, swaps: 1, minSize: 2 });

/** The largest number of candidate points. A larger set keeps each `k`-th point. */
const MAX_CANDIDATES = 300;

/** One edge for the hub location: its two plug points, the centres of its two nodes, and the length of its first route. */
interface HubEdge {
  readonly edge: string;
  readonly s: Point;
  readonly t: Point;
  readonly u: string;
  readonly v: string;
  readonly base: number;
}

/** This function gives the centres of the cells of each section of the tree. */
function sectionCentres(root: Section): Point[] {
  const out: Point[] = [];
  const walk = (s: Section): void => {
    out.push(center(s.cell));
    s.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** This function gives the candidate points of the hubs, at most `MAX_CANDIDATES`, without the copies. */
export function hubCandidates(input: HighwayInput, candidates: HubCandidates): Point[] {
  const raw = candidates === "sections" ? sectionCentres(buildSections(input.graph.nodes)) : [...new WayFinder(input.graph.nodes).corners.points];
  const seen = new Set<string>();
  const points = raw.filter((p) => {
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (points.length <= MAX_CANDIDATES) return points;
  const k = Math.ceil(points.length / MAX_CANDIDATES);
  return points.filter((_, i) => i % k === 0);
}

/**
 * This function chooses `p` points of `candidates` as the p-median of `points`. The greedy step adds the candidate that lowers the sum of the distances most.
 * Then at most 4 passes of swaps lower the sum more. The result is the indices of the chosen candidates.
 */
export function pMedian(points: readonly Point[], candidates: readonly Point[], p: number): number[] {
  const chosen: number[] = [];
  const near = points.map(() => Infinity);
  while (chosen.length < Math.min(p, candidates.length)) {
    let pick = -1;
    let best = Infinity;
    for (let c = 0; c < candidates.length; c++) {
      if (chosen.includes(c)) continue;
      let sum = 0;
      for (let i = 0; i < points.length; i++) sum += Math.min(near[i]!, dist(points[i]!, candidates[c]!));
      if (sum < best - 1e-9) [best, pick] = [sum, c];
    }
    if (pick < 0) break;
    chosen.push(pick);
    points.forEach((q, i) => {
      near[i] = Math.min(near[i]!, dist(q, candidates[pick]!));
    });
  }
  // The swaps of Teitz and Bart: one chosen candidate changes for one other candidate while the sum falls.
  // The nearest and the second nearest chosen candidate of each point give the sum after a swap in one pass over the points.
  const d = candidates.map((c) => points.map((q) => dist(q, c)));
  let first: number[] = [];
  let second: number[] = [];
  const nearTwo = (): void => {
    first = points.map(() => -1);
    second = points.map(() => -1);
    points.forEach((_, p) => {
      chosen.forEach((_, j) => {
        const v = d[chosen[j]!]![p]!;
        if (first[p]! < 0 || v < d[chosen[first[p]!]!]![p]!) [second[p], first[p]] = [first[p]!, j];
        else if (second[p]! < 0 || v < d[chosen[second[p]!]!]![p]!) second[p] = j;
      });
    });
  };
  const at = (j: number, p: number): number => (j < 0 ? Infinity : d[chosen[j]!]![p]!);
  nearTwo();
  let sum = points.reduce((s, _, p) => s + at(first[p]!, p), 0);
  for (let pass = 0; pass < 4; pass++) {
    let better = false;
    for (let i = 0; i < chosen.length; i++)
      for (let c = 0; c < candidates.length; c++) {
        if (chosen.includes(c)) continue;
        let v = 0;
        for (let p = 0; p < points.length; p++) v += Math.min(d[c]![p]!, first[p] === i ? at(second[p]!, p) : at(first[p]!, p));
        if (v < sum - 1e-9) {
          [sum, better] = [v, true];
          chosen[i] = c;
          nearTwo();
        }
      }
    if (!better) break;
  }
  return chosen;
}

/** The two hubs of one edge, and its cost and its length on them. */
interface HubTrip {
  readonly h: number;
  readonly k: number;
  readonly cost: number;
}

/**
 * This function gives the trip of each edge through the hubs `hubs`, or `undefined` for an edge that does not ride.
 * The cost of a trip is `d(s, h) + alpha d(h, k) + d(k, t)`. An edge rides only when `h` and `k` differ and the cost is below its first route.
 * Also, its length `d(s, h) + d(h, k) + d(k, t)` must be `detour` times its first route or less.
 */
function hubTrips(edges: readonly HubEdge[], nodes: ReadonlyMap<string, Point>, hubs: readonly Point[], o: Readonly<PHubOptions>): (HubTrip | undefined)[] {
  const nearest = (p: Point): number => {
    let best = 0;
    for (let i = 1; i < hubs.length; i++) if (dist(p, hubs[i]!) < dist(p, hubs[best]!)) best = i;
    return best;
  };
  const home = new Map<string, number>();
  for (const [id, c] of nodes) home.set(id, nearest(c));
  return edges.map((e) => {
    const trip = (h: number, k: number): HubTrip | undefined => {
      if (h === k) return undefined;
      const a = dist(e.s, hubs[h]!);
      const m = dist(hubs[h]!, hubs[k]!);
      const b = dist(hubs[k]!, e.t);
      const cost = a + o.alpha * m + b;
      if (cost >= e.base || a + m + b > o.detour * e.base) return undefined;
      return { h, k, cost };
    };
    if (o.allocation === "single") return trip(home.get(e.u)!, home.get(e.v)!);
    let best: HubTrip | undefined;
    for (let h = 0; h < hubs.length; h++)
      for (let k = 0; k < hubs.length; k++) {
        const t = trip(h, k);
        if (t && (!best || t.cost < best.cost - 1e-9)) best = t;
      }
    return best;
  });
}

/** This function gives the total cost of the edges: the cost of each trip, or the first route of an edge that does not ride. */
function totalCost(edges: readonly HubEdge[], trips: readonly (HubTrip | undefined)[]): number {
  return edges.reduce((s, e, i) => s + (trips[i]?.cost ?? e.base), 0);
}

/**
 * This function gives the highways of the hub location (HWY-041, the p-hub median of O'Kelly 1987). The p-median of the plugs chooses `p` hubs from the candidates.
 * Each swap pass changes one hub for one other candidate while the total cost falls. Each link between two hubs with `minSize` edges or more is a highway.
 * The edges that ride a link snap to it, from their first hub to their second hub.
 */
export function pHubPlan(input: HighwayInput, o: Readonly<PHubOptions>): HighwayPlan {
  const graph = input.graph;
  if (graph.nodes.length === 0) return { highways: [] };
  const routes = firstRoutes(input);
  const edges: HubEdge[] = edgePlugs(graph).map(({ edge, ps, pt }) => {
    const first = routes.get(edge.id);
    return { edge: edge.id, s: ps.point, t: pt.point, u: edge.source.node, v: edge.target.node, base: first ? polylineLength(first) : dist(ps.point, pt.point) };
  });
  const nodes = new Map(graph.nodes.map((n) => [n.id, center(n.box)] as const));
  const candidates = hubCandidates(input, o.candidates);
  const p = Math.round(o.p) > 0 ? Math.round(o.p) : Math.max(2, Math.round(Math.sqrt(graph.nodes.length)));
  if (candidates.length < 2 || edges.length === 0) return { highways: [] };
  const chosen = pMedian(
    edges.flatMap((e) => [e.s, e.t]),
    candidates,
    p,
  );
  const hubsOf = (list: readonly number[]): Point[] => list.map((c) => candidates[c]!);
  let trips = hubTrips(edges, nodes, hubsOf(chosen), o);
  let cost = totalCost(edges, trips);
  for (let pass = 0; pass < Math.max(0, Math.round(o.swaps)); pass++) {
    let better = false;
    for (let i = 0; i < chosen.length; i++) {
      let pick = -1;
      let pickTrips = trips;
      for (let c = 0; c < candidates.length; c++) {
        if (chosen.includes(c)) continue;
        const next = chosen.map((x, j) => (j === i ? c : x));
        const t = hubTrips(edges, nodes, hubsOf(next), o);
        const v = totalCost(edges, t);
        if (v < cost - 1e-9) [cost, pick, pickTrips] = [v, c, t];
      }
      if (pick >= 0) {
        chosen[i] = pick;
        trips = pickTrips;
        better = true;
      }
    }
    if (!better) break;
  }
  const hubs = hubsOf(chosen);
  const links = new Map<string, { a: number; b: number; members: SnapMember[] }>();
  edges.forEach((e, i) => {
    const t = trips[i];
    if (!t) return;
    const [a, b] = t.h < t.k ? [t.h, t.k] : [t.k, t.h];
    const key = `${a}:${b}`;
    const link = links.get(key) ?? { a, b, members: [] };
    link.members.push({ edge: e.edge, from: hubs[t.h]!, to: hubs[t.k]!, at: 0 });
    links.set(key, link);
  });
  const min = Math.max(2, Math.round(o.minSize));
  const lines: SnapLine[] = [...links.values()]
    .filter((l) => l.members.length >= min)
    .sort((x, y) => x.a - y.a || x.b - y.b)
    .map((l) => ({ key: `hub${l.a}-${l.b}`, a: hubs[l.a]!, b: hubs[l.b]!, members: l.members }));
  return snapPlan(input, lines, { minSize: min });
}
