// The router settings of the screen of BUILD-W4B: the corner graph with the prices of the rules, and rounds of rip-up and reroute (RULE-044).
// Start: `pnpm screen --step router --strategy shared --module scripts/screens/build-w4b-router.ts`. The baseline is `shared`.
import type { Graph, Result } from "../../src/model.ts";
import { REROUTE_DEFAULTS, rerouteRouter, rerouteStrategy, type RerouteOptions } from "../../src/routers/reroute/index.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of `reroute` with the name `name` and the options `options`. */
function reroute(name: string, options: Partial<RerouteOptions>): Strategy<"router", object> {
  const o = { ...REROUTE_DEFAULTS, ...options };
  const run = (graph: Graph): Result => rerouteRouter({ ...o, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`reroute\` with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// The default settings of RULE-044.
export const rerouteDefault = rerouteStrategy;

// RULE-044: no price of the channels, a larger price of the other keys, and more rounds with a larger share.
export const rerouteA0 = reroute("reroute-a0", { alpha: 0 });
export const rerouteB1 = reroute("reroute-b1", { beta: 1 });
export const rerouteR4 = reroute("reroute-r4", { rounds: 4, q: 0.3 });
