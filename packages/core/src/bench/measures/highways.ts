import { follow } from "../../highways/follow.ts";
import { commonEdges, matchHighways } from "../../highways/gates/model.ts";
import type { HighwayPlan } from "../../highways/model.ts";
import { wayOptionsOf } from "../../highways/router.ts";
import type { Graph } from "../../model.ts";
import type { Strategy } from "../../strategies/model.ts";
import { changeGraph, routeStability } from "./stability.ts";

/**
 * This function gives the churn of the highways over one edit (Z10 for highways, from HWY-046). Two edges are a pair when they share a highway.
 * The churn is the share of the pairs that come or go: `|P ∆ P'| / |P ∪ P'|`. Only the edges of `edges` count, for example the edges of both graphs.
 * Two plans without pairs give 0. The scale is 0 to 1, and lower is better.
 */
export function highwayChurn(before: HighwayPlan, after: HighwayPlan, edges: ReadonlySet<string>): number {
  const pairs = (plan: HighwayPlan): Set<string> => {
    const out = new Set<string>();
    for (const h of plan.highways) {
      const list = [...new Set(h.members.map((m) => m.edge).filter((e) => edges.has(e)))].sort();
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.add(`${list[i]}\u0000${list[j]}`);
    }
    return out;
  };
  const a = pairs(before);
  const b = pairs(after);
  let common = 0;
  for (const p of a) if (b.has(p)) common++;
  const all = a.size + b.size - common;
  return all === 0 ? 0 : (all - common) / all;
}

/** The match of the highways over one edit. */
export interface HighwayIdKeep {
  /** The number of new highways with a match in the old plan: a Jaccard index of their edges of 0.5 or more. */
  readonly matched: number;
  /** The number of matched highways that keep the id of their match. */
  readonly kept: number;
  /** `kept / matched`, or `NaN` without a match. The scale is 0 to 1, and higher is better. */
  readonly share: number;
}

/**
 * This function tells how many highways keep their id over one edit (HWY-054). It matches the new highways with the old ones by `matchHighways`, with the index 0.5.
 * A matched highway keeps its id when its id is the id of its match. Only the edges of `edges` count.
 */
export function highwayIdKeep(before: HighwayPlan, after: HighwayPlan, edges: ReadonlySet<string>): HighwayIdKeep {
  const match = matchHighways(before, after, 0.5, edges);
  let kept = 0;
  for (const [i, i0] of match) if (after.highways[i]!.id === before.highways[i0]!.id) kept++;
  return { matched: match.size, kept, share: match.size === 0 ? Number.NaN : kept / match.size };
}

/** The stability of a highway strategy over a seeded sequence of edits. Each value is the mean over the edits. */
export interface HighwayEdits {
  /** The mean Fréchet distance of the routes over one edit, in units of the board (Z10). */
  readonly mean: number;
  /** The share of the routes that move over one edit (Z10). */
  readonly moved: number;
  /** The churn of the highways over one edit (`highwayChurn`). */
  readonly churn: number;
  /** The share of the matched highways that keep their id over one edit (`highwayIdKeep`), or `NaN` without a match. */
  readonly ids: number;
}

/**
 * This function measures a highway strategy over a sequence of `edits` seeded edits. Each edit is the small change of `changeGraph` with the seed `seed + i`.
 * The strategy gets the graph and its plan before the edit as `previous`, so a strategy with memory can keep its highways.
 * `follow` routes each plan with the way options of the strategy. The same graph, strategy, options and seed give the same values.
 */
export function highwayEdits(graph: Graph, strategy: Strategy<"highway", object>, options: object | undefined, edits: number, seed = 1): HighwayEdits {
  const way = wayOptionsOf({ ...strategy.defaults, ...options });
  let g = graph;
  let plan = strategy.run({ graph: g }, options);
  let routes = follow(g, plan, way);
  const mean: number[] = [];
  const moved: number[] = [];
  const churn: number[] = [];
  const ids: number[] = [];
  for (let i = 0; i < edits; i++) {
    const next = changeGraph(g, seed + i).graph;
    const p = strategy.run({ graph: next, previous: { graph: g, plan } }, options);
    const r = follow(next, p, way);
    const s = routeStability(g, routes, r, { seed });
    const edges = commonEdges(g, next);
    mean.push(s.mean);
    moved.push(s.moved);
    churn.push(highwayChurn(plan, p, edges));
    const keep = highwayIdKeep(plan, p, edges);
    if (keep.matched > 0) ids.push(keep.share);
    [g, plan, routes] = [next, p, r];
  }
  const avg = (v: readonly number[]): number => (v.length === 0 ? Number.NaN : v.reduce((a, b) => a + b, 0) / v.length);
  return { mean: avg(mean), moved: avg(moved), churn: avg(churn), ids: avg(ids) };
}
