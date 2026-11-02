import { outerGraph, type Graph, type Result, type Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { keepRules, relaxRoutes, simplify, type RelaxOptions } from "../physics.ts";
import { straightRouter } from "../straight.ts";

/** The options of the router `repel` (PHYSICAL): the forces on the straight lines. */
export type RepelOptions = RelaxOptions;

/** The default options of the router `repel`. */
export const REPEL_DEFAULTS: Readonly<RepelOptions> = Object.freeze({ iterations: 60, leg: 6, clearance: 8, boxPush: 1, gap: 6, edgePush: 0.5, spring: 0.5 });

/** The declarations of the options of the router `repel` (PHYSICAL). */
export const REPEL_SCHEMA: OptionSchema<RepelOptions> = {
  iterations: { type: "integer", min: 0, max: 200, step: 10, marks: [30, 60, 120], default: 60, describe: "The number of the steps of the forces." },
  leg: { type: "number", min: 2, max: 32, step: 1, marks: [4, 6, 12], default: 6, describe: "The largest length of a leg after the resampling." },
  clearance: { type: "number", min: 2, max: 40, step: 2, marks: [4, 8, 16], default: 8, describe: "The distance up to which a box pushes a point." },
  boxPush: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 1, 2], default: 1, describe: "The weight of the push of the boxes." },
  gap: { type: "number", min: 1, max: 32, step: 1, marks: [4, 6, 12], default: 6, describe: "The distance up to which a point of another route pushes a point." },
  edgePush: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 0.5, 1], default: 0.5, describe: "The weight of the push between the routes." },
  spring: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.2, 0.5, 0.8], default: 0.5, describe: "The weight of the spring that pulls each point to the middle of its neighbors." },
};

/** The largest distance in units of the board between a point of a route of `repel` and the polyline of the forces. */
const SIMPLIFY = 0.25;

/**
 * This function makes the router `repel` (PHYSICAL). Each edge starts as the straight line of `straight`.
 * The forces of `relaxRoutes` then push the lines away from the boxes and from each other. Each line goes round a box at the side away from its center.
 * No grid and no search change the points, so a small move of a node gives a small move of the routes.
 * A route that goes through a box gets the route of `corners` (`keepRules`).
 */
export function repelRouter(options: Partial<RepelOptions> & { readonly name: string; readonly maxNodes?: number }): Router {
  const o = { ...REPEL_DEFAULTS, ...options };
  return {
    name: o.name,
    ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }),
    route(input: Graph): Result {
      const graph = outerGraph(input);
      const relaxed = relaxRoutes(graph, straightRouter.route(graph).routes, o, "chord");
      const simple = relaxed.map((r) => ({ edge: r.edge, points: simplify(r.points, SIMPLIFY) }));
      const { routes } = keepRules(graph, simple, relaxed);
      return { routes };
    },
  };
}

/**
 * The router strategy `repel` (PHYSICAL). It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const repelStrategy: Strategy<"router", RepelOptions> = defineStrategy({
  step: "router",
  name: "repel",
  describe: "Physical routes (PHYSICAL). The boxes and the other routes push the straight lines, and springs keep them smooth. A route through a box gets the route of `corners`.",
  defaults: { ...REPEL_DEFAULTS },
  schema: REPEL_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<RepelOptions>): Result => repelRouter({ ...o, name: "repel" }).route(graph),
});
