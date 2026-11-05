// The router settings of the screen of BUILD-W5: the rip-up and reroute of EDA-010.
// Start: `pnpm screen --step router --strategy shared --module scripts/screens/build-w5-router.ts`. The baseline is `shared`.
import type { Graph, Result } from "../../src/model.ts";
import { RIP_UP_DEFAULTS, ripUpRouter, ripUpStrategy, type RipUpOptions } from "../../src/routers/rip-up/index.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of `rip-up` with the name `name` and the options `options`. */
function ripUp(name: string, options: Partial<RipUpOptions>): Strategy<"router", object> {
  const o = { ...RIP_UP_DEFAULTS, ...options };
  const run = (graph: Graph): Result => ripUpRouter({ ...o, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`rip-up\` with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// The default settings of EDA-010.
export const ripUpDefault = ripUpStrategy;

// EDA-010: only the ways with faults, two seeds of the order, and five rounds.
export const ripUpFault = ripUp("rip-up-fault", { scope: "fault" });
export const ripUpSeed1 = ripUp("rip-up-seed1", { order: "seed", seed: 1 });
export const ripUpSeed2 = ripUp("rip-up-seed2", { order: "seed", seed: 2 });
export const ripUpR5 = ripUp("rip-up-r5", { rounds: 5 });
