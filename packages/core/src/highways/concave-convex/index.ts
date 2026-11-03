/**
 * The highway strategy `concave-convex` (EDA-032): a concave cost of a link below its capacity, and a convex cost above it.
 * Below the capacity, each more edge on a link costs less, so bundles form. Above it, each more edge costs much more, so the next bundle takes the next corridor.
 */
import { channelWidth } from "../../channels.ts";
import { dist, type Point } from "../../geom.ts";
import { byCollection } from "../../routers/trunks.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The edges that can share a link at a low cost: all the edges, or only the edges of one collection. */
export type ConcaveKeys = "all" | "collection";

/** The values of `ConcaveKeys`. */
export const CONCAVE_KEYS: readonly ConcaveKeys[] = Object.freeze(["all", "collection"]);

/** The options of the highway strategy `concave-convex` (EDA-032). */
export interface ConcaveOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The exponent of the concave cost below the capacity, from 0.3 to 1. The default is 0.5. */
  readonly alpha: number;
  /** The growth of the convex cost above the capacity, from 0.15 to 1. The default is 0.5. */
  readonly beta: number;
  /** The power of the convex cost above the capacity, from 1 to 4. The default is 2. */
  readonly power: number;
  /** The cost of each edge above the capacity, as a share of the length, from 1 to 10. The default is 4. */
  readonly mu: number;
  /** The width of one lane: the capacity of a link is its free width over this value, from 2 to 8. The default is 4. */
  readonly spacing: number;
  /** The number of passes of the negotiation, from 1 to 4. The default is 3. */
  readonly passes: number;
  /** The edges that can share a link at a low cost. The default is `all`. */
  readonly keys: ConcaveKeys;
  /** A highway has this number of edges or more, from 2 to 16. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `concave-convex`. */
export const CONCAVE_DEFAULTS: Readonly<Required<Omit<ConcaveOptions, "margin" | "k">>> = Object.freeze({
  alpha: 0.5,
  beta: 0.5,
  power: 2,
  mu: 4,
  spacing: 4,
  passes: 3,
  keys: "all",
  minSize: 2,
});

/** The largest capacity of one link, in edges. A larger capacity does not change the cost of a link. */
export const CONCAVE_MAX_CAP = 16;

/** The growth of the history of a link at each pass, for each edge above its capacity (EDA-009). */
const HISTORY = 0.5;

/** The parameters of the cost of one link: the exponent, the growth, the power and the cost above the capacity. */
export type ConcaveCost = Readonly<Pick<ConcaveOptions, "alpha" | "beta" | "power" | "mu">>;

/**
 * This function gives the cost of a link of length 1 and capacity `cap` (EDA-032). The link has `f` edges of all the keys and `own` edges of one key.
 * The cost is `min(own, cap)^alpha`, plus `(f - cap) × mu × (1 + beta × ((f - cap) / cap)^power)` above the capacity.
 */
export function concaveCost(own: number, f: number, cap: number, o: ConcaveCost): number {
  const below = Math.min(own, cap) ** o.alpha;
  if (f <= cap) return below;
  const over = f - cap;
  return below + over * o.mu * (1 + o.beta * (over / cap) ** o.power);
}

/** This function gives the marginal cost of one more edge of the key, for a length of 1. The arguments are those of `concaveCost`. */
export function concaveMarginal(own: number, f: number, cap: number, o: ConcaveCost): number {
  return concaveCost(own + 1, f + 1, cap, o) - concaveCost(own, f, cap, o);
}

/**
 * This function gives the highways of the concave and convex cost (EDA-032). Each pass routes each edge through the corner graph in the order of the longest first.
 * A link costs its length times the marginal cost of `concaveMarginal`, times `1 + 0.5 × history`. After each pass, the history of a link grows by its edges above its capacity.
 * The ways of the last pass give the highways: each stretch that `minSize` ways of one key or more share is one highway.
 */
export function concavePlan(input: HighwayInput, o: Readonly<ConcaveOptions>): HighwayPlan {
  const graph = input.graph;
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const M = corners.points.length;
  const link = (i: number, j: number): number => (i < j ? i * M + j : j * M + i);
  const id = new Map<Point, number>();
  corners.points.forEach((p, i) => id.set(p, i));
  const cost: ConcaveCost = {
    alpha: Math.min(1, Math.max(0.3, o.alpha)),
    beta: Math.max(0, o.beta),
    power: Math.max(1, o.power),
    mu: Math.max(1, o.mu),
  };
  const spacing = Math.max(1, o.spacing);
  const caps = new Map<number, number>();
  const capOf = (i: number, j: number): number => {
    const k = link(i, j);
    let c = caps.get(k);
    if (c === undefined) caps.set(k, (c = Math.max(1, Math.min(CONCAVE_MAX_CAP, Math.floor(channelWidth(finder.obstacles, corners.points[i]!, corners.points[j]!) / spacing)))));
    return c;
  };
  const edges = edgePlugs(graph)
    .map(({ edge, ps, pt }) => ({ edge, a: finder.out(ps), b: finder.out(pt), key: o.keys === "collection" ? (byCollection(edge) ?? `\u0000${edge.id}`) : "*" }))
    .filter((e) => !finder.obstacles.clear(e.a, e.b, finder.margin))
    .sort((p, q) => dist(q.a, q.b) - dist(p.a, p.b) || (p.edge.id < q.edge.id ? -1 : p.edge.id > q.edge.id ? 1 : 0));
  // The least marginal cost of a link: the step of the concave cost at the largest capacity, or the cost above the capacity.
  const floor = Math.max(1e-3, Math.min(CONCAVE_MAX_CAP ** cost.alpha - (CONCAVE_MAX_CAP - 1) ** cost.alpha, cost.mu));
  const history = new Map<number, number>();
  let ways: (Point[] | undefined)[] = [];
  for (let pass = 0; pass < Math.max(1, Math.floor(o.passes)); pass++) {
    const total = new Map<number, number>();
    const own = new Map<string, Map<number, number>>();
    ways = [];
    for (const e of edges) {
      let mine = own.get(e.key);
      if (!mine) own.set(e.key, (mine = new Map()));
      const m = mine;
      const price = (i: number, j: number, d: number): number => {
        const k = link(i, j);
        return d * concaveMarginal(m.get(k) ?? 0, total.get(k) ?? 0, capOf(i, j), cost) * (1 + HISTORY * (history.get(k) ?? 0));
      };
      const way = corners.path(e.a, e.b, price, floor);
      ways.push(way);
      if (!way) continue;
      const ids = way.map((p) => id.get(p) ?? -1);
      for (let i = 1; i < ids.length; i++) {
        const a = ids[i - 1]!;
        const b = ids[i]!;
        if (a < 0 || b < 0) continue;
        const k = link(a, b);
        total.set(k, (total.get(k) ?? 0) + 1);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    for (const [k, f] of total) {
      const i = Math.floor(k / M);
      const j = k % M;
      const over = f - capOf(i, j);
      if (over > 0) history.set(k, (history.get(k) ?? 0) + over);
    }
  }
  const keyed: KeyedWay[] = [];
  edges.forEach((e, n) => {
    const way = ways[n];
    if (way) keyed.push({ edge: e.edge.id, key: e.key, points: way });
  });
  return sharedStretches(keyed, { minSize: Math.max(2, Math.floor(o.minSize)), pull: (p) => corners.pull(p) });
}
