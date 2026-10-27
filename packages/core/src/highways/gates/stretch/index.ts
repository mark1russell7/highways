import type { WayOptions } from "../../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../../model.ts";
import { edgeLengths, keepMembers, type Gate } from "../model.ts";

/** The options of the gate `stretch` (HWY-048). */
export interface StretchOptions {
  /** An edge stays on its highways when its route is at most this number times its route alone, plus `pad`. The default is 1.2. */
  readonly budget: number;
  /** The added length that each edge can use, in units of the board. The default is 0. */
  readonly pad: number;
}

/** The default options of the gate `stretch`. */
export const STRETCH_DEFAULTS: Readonly<StretchOptions> = Object.freeze({ budget: 1.2, pad: 0 });

/**
 * This function applies the stretch budget of HWY-048 to a plan: the join test of each edge.
 * An edge stays on its highways only when its route along the plan is at most `budget` times its route alone, plus `pad`.
 * The route alone is the route of the router `corners`. An edge that fails leaves each of its highways and goes alone, so the highways do not bend for it.
 * `follow` routes each edge on its own, so the test of one edge does not change with the other edges. One pass is enough.
 */
export function stretchPlan(input: HighwayInput, plan: HighwayPlan, options: Readonly<StretchOptions>, way: WayOptions = {}): HighwayPlan {
  const lengths = edgeLengths(input.graph, plan, way);
  const out = new Set<string>();
  for (const [edge, l] of lengths) if (l.route > options.budget * l.alone + options.pad + 1e-9) out.add(edge);
  return out.size === 0 ? plan : keepMembers(plan, (_, m) => !out.has(m.edge));
}

/** The gate `stretch` (HWY-048): an edge joins a highway only when its route stays in a budget of its route alone. */
export const stretchGate: Gate<StretchOptions> = {
  name: "stretch",
  describe: "The gate `stretch` (HWY-048) keeps an edge on a highway only when its route is at most `budget` times its route alone, plus `pad`.",
  defaults: STRETCH_DEFAULTS,
  schema: {
    budget: { type: "number", min: 1, max: 2, step: 0.05, marks: [1.1, 1.2, 1.3, 1.5], default: 1.2, describe: "The largest ratio of the route along the plan to the route alone." },
    pad: { type: "number", min: 0, max: 40, step: 5, default: 0, describe: "The added length that each edge can use, in units of the board." },
  },
  apply: stretchPlan,
};
