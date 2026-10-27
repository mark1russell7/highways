import { sharedRouter, type SharedOptions } from "../../routers/shared.ts";
import { planOfResult } from "../result.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";

/** The options of the highway strategy `shared-ways`: the options of the router `shared`, without the name and the limit of the benchmark. */
export type SharedWaysOptions = Omit<SharedOptions, "name" | "maxNodes">;

/**
 * This function gives the highways that the router `shared` decides. The edges of one key go one by one through the corner graph.
 * A link that the key uses already costs less, so the ways of a key come together. Each stretch that two edges or more share becomes one highway.
 * The function does not change the router: it reads its runs.
 */
export function sharedWaysPlan(input: HighwayInput, options: SharedWaysOptions): HighwayPlan {
  return planOfResult(sharedRouter({ ...options, name: "shared-ways" }).route(input.graph));
}
