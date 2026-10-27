import { trunksRouter, type TrunksOptions } from "../../routers/trunks.ts";
import { planOfResult } from "../result.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";

/** The options of the highway strategy `keys`: the options of the router `trunks`, without the name and the limit of the benchmark. */
export type KeysOptions = Omit<TrunksOptions, "name" | "maxNodes">;

/**
 * This function gives the highways that the router `trunks` decides. A rule gives each edge a key.
 * The edges from one plug with one key share a trunk to a split point. The edges that go on together share a run past it.
 * Each trunk and each run becomes one highway. The function does not change the router: it reads its bundles and its runs.
 */
export function keysPlan(input: HighwayInput, options: KeysOptions): HighwayPlan {
  return planOfResult(trunksRouter({ ...options, name: "keys" }).route(input.graph));
}
