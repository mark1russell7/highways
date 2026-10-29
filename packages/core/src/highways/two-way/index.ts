/**
 * The highway strategy `two-way` (NAT-009): two-way lanes, after the lanes of army ants and of walkers in a counterflow.
 * Each shared run sorts its lanes by the direction of each edge first, then by the bundle order. Thus the edges that go one way stay side by side.
 */
import { basePlan, type HighwayBase } from "../base.ts";
import type { HighwayInput, HighwayPlan, TwoWaySide } from "../model.ts";

/** The options of the highway strategy `two-way` (NAT-009). */
export interface TwoWayOptions {
  /** The side of each direction. The default is `right`: each edge keeps to the right of its own direction. */
  readonly side: TwoWaySide;
  /** The weight of the direction against the bundle order, from 0 to 1. The default is 1: each direction is on its side. */
  readonly weight: number;
  /** The plan that gives the highways. The default is `shared-ways`. */
  readonly from: HighwayBase;
}

/** The default options of the strategy `two-way`. */
export const TWO_WAY_DEFAULTS: Readonly<TwoWayOptions> = Object.freeze({ side: "right", weight: 1, from: "shared-ways" });

/**
 * This function gives the plan of the strategy `two-way` (NAT-009). It is the plan of `from` with the lane rule `two-way`.
 * The highways do not change. Only the lane order of each run of `follow` changes, so the routes and the ink stay the same.
 */
export function twoWayPlan(input: HighwayInput, o: Readonly<TwoWayOptions>): HighwayPlan {
  const plan = basePlan(input, o.from);
  return { highways: plan.highways, laneRule: { order: "two-way", side: o.side, weight: o.weight } };
}
