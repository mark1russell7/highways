import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `attraction` (HWY-044 of the note on highways: negotiated attraction, PathFinder turned around). */
export interface AttractionOptions {
  /** The number of passes, from 1 to 10. Each pass after the first routes each edge again from no ways. The default is 3. */
  readonly passes: number;
  /** The pull `a` of the history of a link, from 0 to 1. A link then costs `1 - a h` times more. The default is 0.5. */
  readonly attraction: number;
  /** The cost weight `b` of each edge over the capacity of a link, from 0 to 10. The default is 1. */
  readonly capacityWeight: number;
  /** The width of one lane. The capacity of a link is its free width divided by this width. The default is 4. */
  readonly laneWidth: number;
}

/** The default options of the router `attraction`. */
export const ATTRACTION_DEFAULTS: Readonly<AttractionOptions> = Object.freeze({ passes: 3, attraction: 0.5, capacityWeight: 1, laneWidth: 4 });

/** The declarations of the options of the router `attraction` (HWY-044). */
export const ATTRACTION_SCHEMA: OptionSchema<AttractionOptions> = {
  passes: { type: "integer", min: 1, max: 10, step: 1, marks: [2, 3, 5], default: 3, describe: "The number of passes. Each later pass routes each edge again from no ways." },
  attraction: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.25, 0.5, 0.75], default: 0.5, describe: "The pull of the history of a link. A busy link of the passes before costs less." },
  capacityWeight: { type: "number", min: 0, max: 10, step: 0.5, marks: [0, 1, 4], default: 1, describe: "The cost weight of each edge over the capacity of a link." },
  laneWidth: { type: "number", min: 1, max: 12, step: 1, marks: [4, 6], default: 4, describe: "The width of one lane. The capacity of a link is its free width divided by this width." },
};

/**
 * This function makes the router `attraction` (HWY-044). It is the router `shared` with a negotiation over the passes.
 * After each pass, the history `h` of each link grows by `use / m`, with `m` the edges of the key. The history stops at `0.9 / a`.
 * In each pass, a link costs `len (1 - a h) (1 + b max(0, use - cap))` times the cost in `shared`.
 * The busy links of the passes before thus pull the edges, and a link over its capacity pushes them away.
 */
export function attractionRouter(options: Partial<AttractionOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...ATTRACTION_DEFAULTS, ...options };
  return sharedRouter(
    { name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) },
    {
      passes: Math.max(1, Math.floor(o.passes)),
      attraction: Math.min(1, Math.max(0, o.attraction)),
      capacityWeight: Math.max(0, o.capacityWeight),
      laneWidth: Math.max(1e-6, o.laneWidth),
    },
  );
}

/**
 * The router strategy `attraction` (HWY-044), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const attractionStrategy: Strategy<"router", AttractionOptions> = defineStrategy({
  step: "router",
  name: "attraction",
  describe: "Negotiated attraction (HWY-044). The router `shared` routes each edge again in each pass, and the busy links of the passes before pull the edges.",
  defaults: { ...ATTRACTION_DEFAULTS },
  schema: ATTRACTION_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<AttractionOptions>): Result => attractionRouter({ ...o, name: "attraction", rule: byCollection }).route(graph),
});
