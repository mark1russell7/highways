import type { Graph, Result, Route } from "../../model.ts";
import { shuffleEdges } from "../../order/index.ts";
import { sameData } from "../run.ts";
import { inkSaved } from "./bundles.ts";
import { crossingAngles, detourSpread, drawnSegments } from "./routes.ts";
import { quantile } from "./stats.ts";

/** The order fragility of a router on one graph (W3 of MEAS3, from WILD-056). */
export interface OrderFragility {
  /** The number of random orders. */
  readonly orders: number;
  /** `IQR / median` of the crossings (R1) over the orders. A value of 0 is a router that the order does not move. */
  readonly crossings: number;
  /** `IQR / median` of the median detour (R5) over the orders. */
  readonly detour: number;
  /** `IQR / median` of the ink saved (B1) over the orders. */
  readonly inkSaved: number;
  /** `IQR / median` of the ink over the orders. */
  readonly ink: number;
  /** The share of the orders whose routes differ from the routes of the input order. A value of 0 is a router that is free of the order. */
  readonly changed: number;
  /**
   * The crossings of the input order divided by the fewest crossings over the orders (the price of anarchy of WILD-056).
   * A value of 1 is a default order as good as the best random order. It is `NaN` when the best order has 0 crossings and the input order has more.
   */
  readonly poa: number;
}

/** The options of `orderFragility`. */
export interface OrderFragilityOptions {
  /** The number of random orders of the edges. The default is 20. */
  readonly orders?: number;
  /** The seed of the first order. The order `k` has the seed `seed + k`. The default is 1. */
  readonly seed?: number;
  /** The result of the input order, when the caller has it. Without it, the function routes the input order one time more. */
  readonly base?: Result;
}

/**
 * This function gives `IQR / median` of the values. Values with a median of 0 give `IQR / mean`, and values that are all 0 give 0.
 * An IQR below `1e-9` of the median is rounding noise of the sums, so it gives 0.
 */
function spread(values: readonly number[]): number {
  const iqr = quantile(values, 0.75) - quantile(values, 0.25);
  const mid = Math.abs(quantile(values, 0.5));
  if (iqr <= 1e-9 * Math.max(1, mid)) return 0;
  if (mid > 0) return iqr / mid;
  const mean = values.reduce((s, v) => s + Math.abs(v), 0) / values.length;
  return mean > 0 ? iqr / mean : 0;
}

/** This function gives the routes by the id of the edge, in the order of the ids, so two orders of the input compare. */
function byEdge(routes: readonly Route[]): Route[] {
  return [...routes].sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
}

/**
 * This function measures the order fragility of a router on one graph (W3, from WILD-056).
 * It routes the graph with `orders` random orders of the edges.
 * It gives the spread `IQR / median` of the crossings, the detour, the ink saved and the ink.
 * It also gives the share of orders that change a route, and the price of anarchy of the crossings.
 * The cost is `orders` extra runs of the router.
 */
export function orderFragility(graph: Graph, route: (graph: Graph) => Result, options: OrderFragilityOptions = {}): OrderFragility {
  const orders = Math.max(1, Math.floor(options.orders ?? 20));
  const seed = options.seed ?? 1;
  const base = options.base ?? route(graph);
  const baseRoutes = byEdge(base.routes);
  const crossings: number[] = [];
  const detour: number[] = [];
  const saved: number[] = [];
  const ink: number[] = [];
  let changed = 0;
  for (let k = 0; k < orders; k++) {
    const routes = route(shuffleEdges(graph, seed + k)).routes;
    const segs = drawnSegments(routes);
    crossings.push(crossingAngles(segs).crossings);
    detour.push(detourSpread(routes).median);
    saved.push(inkSaved(routes));
    let length = 0;
    for (const [a, b] of segs) length += Math.hypot(b.x - a.x, b.y - a.y);
    ink.push(length);
    if (!sameData(byEdge(routes), baseRoutes)) changed++;
  }
  const own = crossingAngles(drawnSegments(base.routes)).crossings;
  const best = Math.min(...crossings);
  return {
    orders,
    crossings: spread(crossings),
    detour: spread(detour),
    inkSaved: spread(saved),
    ink: spread(ink),
    changed: changed / orders,
    poa: best > 0 ? own / best : own === 0 ? 1 : Number.NaN,
  };
}
