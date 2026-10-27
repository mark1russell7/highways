import type { Highway, HighwayInput, HighwayPlan } from "../../model.ts";
import { commonEdges, matchHighways, type Gate } from "../model.ts";

/** The options of the gate `ids` (HWY-054). */
export interface StableIdOptions {
  /** A new highway takes the id of an old highway when the Jaccard index of their edges is this value or more. The default is 0.5. */
  readonly minJaccard: number;
}

/** The default options of the gate `ids`. */
export const STABLE_ID_DEFAULTS: Readonly<StableIdOptions> = Object.freeze({ minJaccard: 0.5 });

/** This function gives the number at the end of an id, or -1 for an id without a number at its end. */
function numberOf(id: string): number {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : -1;
}

/**
 * This function gives stable ids to the highways of a plan (HWY-054). The earlier plan is `input.previous`.
 * Each new highway takes the id of the old highway with the most common edges.
 * The pairs with the largest Jaccard index of their edges come first.
 *
 * A pair needs an index of `minJaccard` or more, and only the edges of both graphs count.
 * A new highway without a match gets a new id `h<n>` that no old highway and no new highway has. Thus the old highway of a new id ends.
 * The gate changes only the ids, so the routes do not change. Without an earlier plan, the plan does not change.
 */
export function stableIdPlan(input: HighwayInput, plan: HighwayPlan, options: Readonly<StableIdOptions>): HighwayPlan {
  if (!input.previous) return plan;
  const before = input.previous.plan;
  const matched = matchHighways(before, plan, options.minJaccard, commonEdges(input.previous.graph, input.graph));
  const taken = new Set<string>([...before.highways.map((h) => h.id)]);
  for (const [, i0] of matched) taken.add(before.highways[i0]!.id);
  let next = 1 + Math.max(-1, ...before.highways.map((h) => numberOf(h.id)), ...plan.highways.map((h) => numberOf(h.id)));
  const fresh = (): string => {
    while (taken.has(`h${next}`)) next++;
    const id = `h${next++}`;
    taken.add(id);
    return id;
  };
  const highways = plan.highways.map((h, i): Highway => {
    const i0 = matched.get(i);
    const id = i0 === undefined ? fresh() : before.highways[i0]!.id;
    return id === h.id ? h : { ...h, id };
  });
  return { highways };
}

/** The gate `ids` (HWY-054): stable highway ids across edits. A highway keeps the id of its match in the earlier plan. */
export const stableIdGate: Gate<StableIdOptions> = {
  name: "ids",
  describe: "The gate `ids` (HWY-054) gives each highway the id of the highway of the earlier plan with the most common edges. The routes do not change.",
  defaults: STABLE_ID_DEFAULTS,
  schema: {
    minJaccard: { type: "number", min: 0.3, max: 0.8, step: 0.05, default: 0.5, describe: "A new highway takes the id of an old highway when the Jaccard index of their edges is this value or more." },
  },
  apply: (input, plan, options) => stableIdPlan(input, plan, options),
};
