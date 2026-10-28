// The router `shared-stretch` (LANE-STRETCH): the router `shared` with one lane order for each stretch of runs.
// The router is opt-in: it is not in the registry `STRATEGIES`, so no default output changes. The benchmark adds it with `--opt-in shared-stretch`.
import type { RouterPreset } from "../../strategies/builtins.ts";
import { byCollection } from "../../routers/trunks.ts";
import type { Graph, Result } from "../../model.ts";
import { sharedRouter, type SharedOptions } from "../../routers/shared.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import { SHARED_SCHEMA } from "../../strategies/schemas.ts";

/**
 * The router strategy `shared-stretch` (LANE-STRETCH). It routes as `shared`, and the runs of one stretch share one lane order.
 * The default stretch order is `consensus`. The option `stretchOrder` selects `periphery` or `sifting`.
 */
export const sharedStretchStrategy: Strategy<"router", RouterPreset<SharedOptions>> = defineStrategy<"router", RouterPreset<SharedOptions>>({
  step: "router",
  name: "shared-stretch",
  describe: "The same ways as `shared`. The runs that follow each other on the routes share one lane order, so fewer lanes cross between them (LANE-STRETCH).",
  defaults: { rule: byCollection, stretchOrder: "consensus" },
  schema: { ...SHARED_SCHEMA, stretchOrder: { ...SHARED_SCHEMA.stretchOrder!, default: "consensus" } },
  maxNodes: 10_000,
  run: (graph: Graph, options: Readonly<RouterPreset<SharedOptions>>): Result => sharedRouter({ ...options, name: "shared-stretch" }).route(graph),
});
