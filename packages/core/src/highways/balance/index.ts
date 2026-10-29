/**
 * The highway strategy `balance` (EDA-017): the stretch of each edge of a bundle stays near a target.
 * A Lagrange price for each edge grows while its stretch is above the target, and the price moves the exit of the edge forward.
 */
import { polylineLength } from "../../geom.ts";
import { outerGraph, type Graph } from "../../model.ts";
import { basePlan, tidyPlan, type HighwayBase } from "../base.ts";
import { follow } from "../follow.ts";
import { lengthBetween, memberAt, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/** The end of a ride that the price moves: the exit, the entry, or both by half. */
export type BalanceEnd = "exit" | "entry" | "both";

/** The values of `BalanceEnd`. */
export const BALANCE_ENDS: readonly BalanceEnd[] = Object.freeze(["exit", "entry", "both"]);

/** The options of the highway strategy `balance` (EDA-017). */
export interface BalanceOptions {
  /** The target of the stretch of an edge: its route on the plan over its route alone, from 1.1 to 2. The default is 1.2. */
  readonly tau: number;
  /** The number of updates of the prices, from 5 to 30. The default is 5. */
  readonly iterations: number;
  /** The end of a ride that the price moves. The default is `exit`. */
  readonly end: BalanceEnd;
  /** The plan that the strategy balances. The default is `shared-ways`. */
  readonly from: HighwayBase;
}

/** The default options of the strategy `balance`. */
export const BALANCE_DEFAULTS: Readonly<BalanceOptions> = Object.freeze({ tau: 1.2, iterations: 5, end: "exit", from: "shared-ways" });

/** The margin of the way finder of `follow`. A ride shorter than this length leaves the plan. */
const MARGIN = 5;

/** This function gives the length of the route of each edge of a plan after `follow`. */
function routeLengths(graph: Graph, plan: HighwayPlan): Map<string, number> {
  return new Map(follow(graph, plan).routes.map((r) => [r.edge, polylineLength(r.points)]));
}

/**
 * This function gives the plan of the highway strategy `balance` (EDA-017, after the Lagrange relaxation of the stretch).
 * The stretch of an edge is its route on the plan over its route alone, as the gate `stretch` measures it.
 * At each update, an edge with a stretch above `tau` adds `stretch - tau` to its price. Each of its rides keeps the share `1 - price` of its first length.
 * A ride shorter than the margin leaves the plan. The updates stop when no edge is above `tau`.
 */
export function balancePlan(input: HighwayInput, options: Partial<BalanceOptions> = {}): HighwayPlan {
  const o = { ...BALANCE_DEFAULTS, ...options };
  const graph = outerGraph(input.graph);
  return balanceOf(graph, basePlan({ ...input, graph }, o.from), o);
}

/** This function balances the plan `first` of the graph, as `balancePlan` does. It reads all the options except `from`. */
export function balanceOf(graph: Graph, first: HighwayPlan, options: Partial<BalanceOptions> = {}): HighwayPlan {
  const o = { ...BALANCE_DEFAULTS, ...options };
  const riders = new Set(first.highways.flatMap((h) => h.members.map((m) => m.edge)));
  if (riders.size === 0) return first;
  const sub: Graph = { nodes: graph.nodes, edges: graph.edges.filter((e) => riders.has(e.id)) };
  const alone = routeLengths(sub, { highways: [] });
  const price = new Map<string, number>();
  let plan = first;
  for (let k = 0; k < Math.max(1, Math.floor(o.iterations)); k++) {
    const along = routeLengths(sub, plan);
    let over = false;
    for (const [edge, length] of along) {
      const base = alone.get(edge) ?? 0;
      if (base <= 1e-9) continue;
      const stretch = length / base;
      if (stretch <= o.tau + 1e-9) continue;
      price.set(edge, (price.get(edge) ?? 0) + stretch - o.tau);
      over = true;
    }
    if (!over) break;
    // Each update cuts the rides of the first plan by the prices as they are now.
    plan = tidyPlan({
      highways: first.highways.map((h) => ({
        ...h,
        members: h.members.flatMap((m): HighwayMember[] => {
          const keep = 1 - Math.min(1, price.get(m.edge) ?? 0);
          if (keep >= 1) return [m];
          const span = m.off - m.on;
          // The exit moves back toward the entry, the entry moves forward toward the exit, or each moves by half the cut.
          const cut = (1 - keep) * span;
          const on = o.end === "entry" ? m.on + cut : o.end === "both" ? m.on + cut / 2 : m.on;
          const off = o.end === "exit" ? m.off - cut : o.end === "both" ? m.off - cut / 2 : m.off;
          if (lengthBetween(h.spine, Math.min(on, off), Math.max(on, off)) < MARGIN) return [];
          return [memberAt(h.spine, m.edge, on, off, m.seq)];
        }),
      })),
    });
    if (plan.highways.length === 0) break;
  }
  return plan;
}
