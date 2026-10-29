// The router settings of the screen of BUILD-W4C: the canalization feeder trees to hubs (NAT-004) and Adam with a seeded sample of pairs (RULE-020).
// Start: `pnpm screen --step router --strategy shared --module scripts/screens/build-w4c-router.ts`. The baseline is `shared`.
import type { Graph, Result } from "../../src/model.ts";
import { ADAM_DEFAULTS, adamRouter, adamStrategy, type AdamOptions } from "../../src/routers/adam/index.ts";
import { CANAL_DEFAULTS, canalRouter, canalStrategy, type CanalOptions } from "../../src/routers/canals/index.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of `canals` with the name `name` and the options `options`. */
function canals(name: string, options: Partial<CanalOptions>): Strategy<"router", object> {
  const o = { ...CANAL_DEFAULTS, ...options };
  const run = (graph: Graph): Result => canalRouter({ ...o, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`canals\` with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

/** This function makes a router strategy of `adam` with the name `name` and the options `options`. */
function adam(name: string, options: Partial<AdamOptions>): Strategy<"router", object> {
  const o = { ...ADAM_DEFAULTS, ...options };
  const run = (graph: Graph): Result => adamRouter({ ...o, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`adam\` with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// The default settings of NAT-004 and RULE-020.
export const canalsDefault = canalStrategy;
export const adamDefault = adamStrategy;

// NAT-004: no gain for a larger flux, a larger gain, and a faster decay.
export const canalsMu1 = canals("canals-mu1", { mu: 1 });
export const canalsMu3 = canals("canals-mu3", { mu: 3 });
export const canalsDecay2 = canals("canals-decay2", { decay: 2 });

// RULE-020: another seed, a larger step size, and the largest budget.
export const adamSeed2 = adam("adam-seed2", { seed: 2 });
export const adamEta05 = adam("adam-eta0.5", { eta: 0.5 });
export const adamSteps2000 = adam("adam-steps2000", { steps: 2000 });
