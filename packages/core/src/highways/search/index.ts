import { ambiguity, bundleStretch, inkSaved, mergeAngle } from "../../bench/measures/bundles.ts";
import type { Point } from "../../geom.ts";
import type { Graph, Route } from "../../model.ts";
import { WayFinder } from "../../ways.ts";
import { nearestPlace, orderAlongRoutes, tidyPlan, firstRoutes } from "../base.ts";
import { follow } from "../follow.ts";
import { memberAt, type Highway, type HighwayInput, type HighwayPlan } from "../model.ts";
import { candidatePlan, type CandidateSource } from "../select/index.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `search` (HWY-059 of the note on highways). */
export interface SearchOptions {
  /** The plan where the search starts. The default is `corridors`. */
  readonly from: CandidateSource;
  /** The generators of the highways that the move `add` takes. The default is `quickbundles` and `road-classes`. */
  readonly pool: readonly CandidateSource[];
  /** The number of plans that the search measures, from 0 to 400. The value 0 gives the start plan. The default is 16. */
  readonly evaluations: number;
  /** The first temperature of the annealing, on the scale of the score. Each sweep of 4 moves multiplies it by 0.95. The default is 0.02. */
  readonly temperature: number;
  /** The weight of the ink that the routes save (B1). The default is 1. */
  readonly inkWeight: number;
  /** The weight of the 0.95 quantile of the stretch against the first routes (B3). The default is 0.5. */
  readonly stretchWeight: number;
  /** The weight of the ambiguity (B4). The default is 0.5. */
  readonly ambiguityWeight: number;
  /** The weight of the largest merge angle (B6), divided by 180 degrees. The default is 0.25. */
  readonly angleWeight: number;
  /** The seed of the moves. The default is 1. */
  readonly seed: number;
}

/** The default options of the strategy `search`. */
export const SEARCH_DEFAULTS: Readonly<SearchOptions> = Object.freeze({
  from: "corridors",
  pool: Object.freeze(["quickbundles", "road-classes"] as CandidateSource[]),
  evaluations: 16,
  temperature: 0.02,
  inkWeight: 1,
  stretchWeight: 0.5,
  ambiguityWeight: 0.5,
  angleWeight: 0.25,
  seed: 1,
});

/** The moves of the search. */
export type SearchMove = "add" | "drop" | "edge" | "point";

/** The values of `SearchMove`, in the order of the draw. */
export const SEARCH_MOVES: readonly SearchMove[] = Object.freeze(["add", "drop", "edge", "point"]);

/** The number of moves of one sweep of the annealing. */
const SWEEP = 4;

/** This function gives a seeded random source with values from 0 to 1 (mulberry32). */
function random(seed: number): () => number {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * This function gives the score of the routes of a plan: `w1 B1 - w3 B3 - w4 B4 - w6 B6 / 180`. Higher is better.
 * B3 is the 0.95 quantile of the stretch against the first routes. The score reads only the graph and the routes of the plan.
 */
export function searchScore(graph: Graph, routes: readonly Route[], first: readonly Route[], o: Readonly<SearchOptions>): number {
  const ink = inkSaved(routes);
  const stretch = bundleStretch(routes, first).q95;
  const amb = o.ambiguityWeight > 0 ? ambiguity(graph, routes).value : 0;
  const angle = o.angleWeight > 0 ? mergeAngle(routes) / 180 : 0;
  return o.inkWeight * ink - o.stretchWeight * stretch - o.ambiguityWeight * amb - o.angleWeight * angle;
}

/**
 * The function `acceptance` gives the chance to keep a worse plan, for a loss `y` of 0 or more on the scale of the temperature.
 * It is `1 / (1 + y + y² / 2)`, near `exp(-y)` for a small loss.
 * It uses only exact arithmetic, so each platform keeps the same plans.
 */
function acceptance(y: number): number {
  return 1 / (1 + y + (y * y) / 2);
}

/**
 * This function gives the highways of a local search over the set of highways (HWY-059). The search starts at the plan of `from`.
 * Each move adds a highway of the pool, drops a highway, moves one edge to another highway, or moves one point of a spine.
 * The annealing keeps a worse plan with the chance `acceptance(-delta / T)`. The best plan that the search measures is the result.
 *
 * The score reads only this graph and its routes. Thus the search does not fit to the inputs of a screen.
 */
export function searchPlan(input: HighwayInput, o: Readonly<SearchOptions>): HighwayPlan {
  const graph = input.graph;
  const start = tidyPlan(candidatePlan(input, o.from));
  const budget = Math.max(0, Math.floor(o.evaluations));
  if (budget === 0 || graph.edges.length === 0) return start;
  const pool: Highway[] = [];
  for (const source of o.pool) if (source !== o.from) pool.push(...candidatePlan(input, source).highways);
  const finder = new WayFinder(graph.nodes);
  const pad = finder.margin / 2;
  const plugs = new Map(edgePlugs(graph).map((p) => [p.edge.id, p] as const));
  const routes = firstRoutes(input);
  const first = follow(graph, { highways: [] }).routes;
  const scoreOf = (plan: HighwayPlan): number => searchScore(graph, follow(graph, plan).routes, first, o);
  const next = random(o.seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length) % list.length]!;
  const tidy = (highways: Highway[]): HighwayPlan => tidyPlan(orderAlongRoutes({ highways }, routes));

  /** This function gives the plan after one move, or `undefined` when the move does not apply. */
  const moved = (plan: HighwayPlan, move: SearchMove): HighwayPlan | undefined => {
    const list = [...plan.highways];
    if (move === "add") {
      const known = new Set(list.map((h) => h.spine.map((p) => `${p.x},${p.y}`).join(";")));
      const fresh = pool.filter((h) => !known.has(h.spine.map((p) => `${p.x},${p.y}`).join(";")));
      if (fresh.length === 0) return undefined;
      return tidy([...list, pick(fresh)]);
    }
    if (list.length === 0) return undefined;
    const i = Math.floor(next() * list.length) % list.length;
    const h = list[i]!;
    if (move === "drop") return tidy(list.filter((_, j) => j !== i));
    if (move === "edge") {
      // One member leaves its highway and rides the nearest other highway that does not carry it.
      if (list.length < 2 || h.members.length < 3) return undefined;
      const m = pick(h.members);
      const plug = plugs.get(m.edge);
      if (!plug) return undefined;
      const others = list.map((g, j) => ({ g, j })).filter((x) => x.j !== i && !x.g.members.some((y) => y.edge === m.edge));
      if (others.length === 0) return undefined;
      const s = plug.ps.point;
      const t = plug.pt.point;
      const to = pick(others);
      const on = nearestPlace(to.g.spine, s);
      const off = nearestPlace(to.g.spine, t);
      if (Math.abs(on - off) < 1e-6) return undefined;
      list[i] = { ...h, members: h.members.filter((y) => y.edge !== m.edge), lanes: h.lanes.filter((e) => e !== m.edge) };
      list[to.j] = { ...to.g, members: [...to.g.members, memberAt(to.g.spine, m.edge, on, off, m.seq)], lanes: [...to.g.lanes, m.edge] };
      return tidy(list);
    }
    // The move `point`: one point of the spine moves by two margins on one axis, when the spine stays in clear view.
    const k = Math.floor(next() * h.spine.length) % h.spine.length;
    const step = 2 * finder.margin * (next() < 0.5 ? -1 : 1);
    const p = h.spine[k]!;
    const q: Point = next() < 0.5 ? { x: p.x + step, y: p.y } : { x: p.x, y: p.y + step };
    const spine = h.spine.map((x, j) => (j === k ? q : x));
    if (!finder.obstacles.clearPath(spine, pad)) return undefined;
    list[i] = { ...h, spine, members: h.members.map((m) => memberAt(spine, m.edge, m.on, m.off, m.seq)) };
    return tidy(list);
  };

  let current = start;
  let currentScore = scoreOf(start);
  let best = start;
  let bestScore = currentScore;
  let temperature = Math.max(0, o.temperature);
  for (let n = 1, tries = 0; n < budget && tries < 4 * budget; tries++) {
    const plan = moved(current, pick(SEARCH_MOVES));
    if (!plan) continue;
    n++;
    const score = scoreOf(plan);
    const delta = score - currentScore;
    if (delta >= 0 || (temperature > 0 && next() < acceptance(-delta / temperature))) [current, currentScore] = [plan, score];
    if (score > bestScore + 1e-12) [best, bestScore] = [plan, score];
    if (n % SWEEP === 0) temperature *= 0.95;
  }
  return best;
}
