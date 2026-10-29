import { outerGraph, type Graph, type Result, type Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { keepRules, relaxRoutes, simplify, type RelaxOptions } from "../physics.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `springs` (PHYSICAL): the forces on the routes of `shared`, without the push between the routes. */
export type SpringsOptions = Omit<RelaxOptions, "gap" | "edgePush">;

/** The default options of the router `springs`. */
export const SPRINGS_DEFAULTS: Readonly<SpringsOptions> = Object.freeze({ iterations: 30, leg: 6, clearance: 8, boxPush: 1, spring: 0.3 });

/** The declarations of the options of the router `springs` (PHYSICAL). */
export const SPRINGS_SCHEMA: OptionSchema<SpringsOptions> = {
  iterations: { type: "integer", min: 0, max: 200, step: 10, marks: [10, 30, 60], default: 30, describe: "The number of the steps of the forces." },
  leg: { type: "number", min: 2, max: 32, step: 1, marks: [4, 6, 12], default: 6, describe: "The largest length of a leg after the resampling." },
  clearance: { type: "number", min: 2, max: 40, step: 2, marks: [4, 8, 16], default: 8, describe: "The distance up to which a box pushes a point." },
  boxPush: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 1, 2], default: 1, describe: "The weight of the push of the boxes." },
  spring: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.1, 0.3, 0.6], default: 0.3, describe: "The weight of the spring that pulls each point to the middle of its neighbors." },
};

/** The largest distance in units of the board between a point of a route of `springs` and the polyline of the forces. */
const SIMPLIFY = 0.25;

/** The base router of `springs`: `shared` with the rule `byCollection`. */
const BASE = sharedRouter({ name: "shared", rule: byCollection });

/**
 * This function makes the router `springs` (PHYSICAL). It smooths the routes of `shared` with springs, and the boxes push the points.
 * The corners of the routes become curves. A route that goes through a box after the smoothing keeps its route of `shared` (`keepRules`).
 */
export function springsRouter(options: Partial<SpringsOptions> & { readonly name: string; readonly maxNodes?: number }): Router {
  const o = { ...SPRINGS_DEFAULTS, ...options, gap: 1, edgePush: 0 };
  return {
    name: o.name,
    ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }),
    route(input: Graph): Result {
      const graph = outerGraph(input);
      const base = BASE.route(graph).routes;
      const relaxed = relaxRoutes(graph, base, o);
      const simple = relaxed.map((r) => ({ edge: r.edge, points: simplify(r.points, SIMPLIFY) }));
      const { routes } = keepRules(graph, simple, base);
      return { routes };
    },
  };
}

/**
 * The router strategy `springs` (PHYSICAL). It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const springsStrategy: Strategy<"router", SpringsOptions> = defineStrategy({
  step: "router",
  name: "springs",
  describe: "Spring smoothing of `shared` (PHYSICAL). Springs make curves of the corners, and the boxes push the points. A route through a box keeps its route of `shared`.",
  defaults: { ...SPRINGS_DEFAULTS },
  schema: SPRINGS_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<SpringsOptions>): Result => springsRouter({ ...o, name: "springs" }).route(graph),
});
