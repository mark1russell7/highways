import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { ADAM_RULES } from "../rules/language.ts";
import { solveRules } from "../rules/solver.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `adam` (RULE-020: Adam with a seeded sample of pairs). */
export interface AdamOptions {
  /** The first step size `eta0`, in units of `clearance`, from 0.01 to 1. The step size falls to a tenth of it at the last step. The default is 0.1. */
  readonly eta: number;
  /** The number of other legs that each leg samples at each step, from 4 to 32. The default is 8. */
  readonly samples: number;
  /** The number of steps: the budget of the search, from 100 to 2000. The default is 200. */
  readonly steps: number;
  /** The seed of the samples, a whole number from 0. The same seed gives the same routes. The default is 1. */
  readonly seed: number;
  /** A leg nearer than this distance to another leg or to a box gets a push, from 4 to 32. The default is 8. */
  readonly clearance: number;
}

/** The default options of the router `adam`. */
export const ADAM_DEFAULTS: Readonly<AdamOptions> = Object.freeze({ eta: 0.1, samples: 8, steps: 200, seed: 1, clearance: 8 });

/** The declarations of the options of the router `adam` (RULE-020). */
export const ADAM_SCHEMA: OptionSchema<AdamOptions> = {
  eta: { type: "number", min: 0.01, max: 1, step: 0.01, marks: [0.01, 0.1, 1], default: 0.1, describe: "The first step size, in units of the clearance. It falls to a tenth at the last step." },
  samples: { type: "integer", min: 4, max: 32, step: 1, marks: [4, 8, 16, 32], default: 8, describe: "The number of other legs that each leg samples at each step." },
  steps: { type: "integer", min: 100, max: 2000, step: 100, marks: [100, 200, 500, 2000], default: 200, describe: "The number of steps: the budget of the search." },
  seed: { type: "integer", min: 0, max: 1_000_000, step: 1, marks: [1, 2, 3], default: 1, describe: "The seed of the samples. The same seed gives the same routes." },
  clearance: { type: "number", min: 4, max: 32, step: 1, marks: [4, 8, 16, 32], default: 8, describe: "A leg nearer than this distance to another leg or to a box gets a push." },
};

/**
 * This function moves the free legs of the routes of `result` with Adam (RULE-020, after Kingma and Ba 2015, and the SGD layouts of Zheng, Pawar and Goodman 2019).
 * A leg is free when its two points are inside its route, and no other route, run or trunk holds them. The variable of a leg is a shift along its normal.
 * The energy of a leg is `Σ (1 - d / c)²` over a seeded sample of `samples` other legs nearer than `c`. The near boxes add the same term times 4.
 * A term `0.05 × (t / c)²` holds each leg near its first place. The step size falls from `eta` to a tenth of it, with only `+`, `*` and `/`.
 * A moved route goes back to its first points when it has more crossings than before, or a break of a hard rule.
 * When the output still has more crossings than the routes of `shared`, it is the routes of `shared`.
 */
export function adamRoutes(input: Graph, result: Result, options: Partial<AdamOptions> = {}): Result {
  return solveRules(input, result, ADAM_RULES, { ...ADAM_DEFAULTS, ...options });
}

/**
 * This function makes the router `adam` (RULE-020). It is the router `shared`, then the steps of Adam of `adamRoutes`.
 * The runs and the bundles of `shared` stay, because no point of a run or of a trunk moves.
 */
export function adamRouter(options: Partial<AdamOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...ADAM_DEFAULTS, ...options };
  const base = sharedRouter({ name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) });
  return {
    name: o.name,
    ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }),
    route: (graph: Graph): Result => adamRoutes(graph, base.route(graph), o),
  };
}

/**
 * The router strategy `adam` (RULE-020), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const adamStrategy: Strategy<"router", AdamOptions> = defineStrategy({
  step: "router",
  name: "adam",
  describe: "Adam with a seeded sample of pairs (RULE-020). The free legs of the routes of `shared` move along their normals, away from near legs and boxes.",
  defaults: { ...ADAM_DEFAULTS },
  schema: ADAM_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<AdamOptions>): Result => adamRouter({ ...o, name: "adam", rule: byCollection }).route(graph),
});
