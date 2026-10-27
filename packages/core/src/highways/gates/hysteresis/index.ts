import type { HighwayInput, HighwayPlan } from "../../model.ts";
import { commonEdges, matchHighways, type Gate } from "../model.ts";

/** The options of the gate `hysteresis` (HWY-046). */
export interface HysteresisOptions {
  /** A new highway needs this number of edges or more. The default is 3. */
  readonly kOn: number;
  /** A highway of the earlier plan stays while it has this number of edges or more. The default is 2. */
  readonly kOff: number;
}

/** The default options of the gate `hysteresis`. */
export const HYSTERESIS_DEFAULTS: Readonly<HysteresisOptions> = Object.freeze({ kOn: 3, kOff: 2 });

/** Two highways of two plans are the same highway when the Jaccard index of their edges is this value or more. */
export const SAME_HIGHWAY = 0.5;

/**
 * This function applies the count threshold with hysteresis of HWY-046 to a plan.
 * A highway with `kOn` edges or more stays. A highway with fewer than `kOff` edges goes away.
 * A highway between the two limits stays only when it was in the earlier plan, `input.previous`.
 * The highway of the earlier plan with the most common edges is its match, with a Jaccard index of `SAME_HIGHWAY` or more.
 *
 * Thus an edit that adds or removes one edge near the limit does not make a highway come and go. Without an earlier plan, the limit is `kOn`.
 */
export function hysteresisPlan(input: HighwayInput, plan: HighwayPlan, options: Readonly<HysteresisOptions>): HighwayPlan {
  const matched = input.previous ? matchHighways(input.previous.plan, plan, SAME_HIGHWAY, commonEdges(input.previous.graph, input.graph)) : new Map<number, number>();
  const kOff = Math.max(2, Math.min(options.kOff, options.kOn));
  const highways = plan.highways.filter((h, i) => {
    const n = h.members.length;
    if (n >= options.kOn) return true;
    if (n < kOff) return false;
    return matched.has(i);
  });
  return highways.length === plan.highways.length ? plan : { highways };
}

/** The gate `hysteresis` (HWY-046): a highway forms at `kOn` edges and goes away below `kOff` edges. */
export const hysteresisGate: Gate<HysteresisOptions> = {
  name: "hysteresis",
  describe: "The gate `hysteresis` (HWY-046) keeps a new highway with `kOn` edges or more. A highway of the earlier plan stays while it has `kOff` edges or more.",
  defaults: HYSTERESIS_DEFAULTS,
  schema: {
    kOn: { type: "integer", min: 2, max: 16, step: 1, default: 3, describe: "A new highway needs this number of edges or more." },
    kOff: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway of the earlier plan stays while it has this number of edges or more." },
  },
  apply: (input, plan, options) => hysteresisPlan(input, plan, options),
};
