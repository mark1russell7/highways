// The settings of RESCREEN-M3A: the ideas of waves 1 to 3 again, on the measures of MEAS3A (R12, M4, B7, M1, R14, B5, Z2, B8, Z9 and B9).
// The module has the options of the router `shared` that the records name, and one gate after `shared-ways`. Each record keeps its own baseline.
// The finders of the step `highway` are built-in strategies, so the screen runs them without this module.
// Start the routers: `pnpm screen --step router --module scripts/screens/rescreen-m3a.ts --families small-clustered,dense-groups,hub-chain,many-groups`.
// Start the finders: `pnpm screen --step highway --module scripts/screens/rescreen-m3a.ts --families small-clustered,dense-groups,hub-chain,many-groups`.
// Start the repair step (RULE-046): `pnpm screen --step router --wrap repair`.
import type { Graph, Result } from "../../src/model.ts";
import { sharedRouter, type SharedOptions } from "../../src/routers/shared.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of `shared` (with the rule `byCollection`) or `shared-all` (without a rule), with the options `options`. */
function shared(name: string, all: boolean, options: Omit<SharedOptions, "name" | "rule">): Strategy<"router", object> {
  const describe = `The router \`${all ? "shared-all" : "shared"}\` with ${JSON.stringify(options)}.`;
  const run = (graph: Graph): Result => sharedRouter({ ...options, ...(all ? {} : { rule: byCollection }), name }).route(graph);
  return defineStrategy({ step: "router", name, describe, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// EDA-029 and HWY-038: the flow cost, at the alpha of each record. The baselines are `shared` and `shared-all`.
export const sharedFlow06 = shared("shared-flow-a06", false, { cost: "flow", alpha: 0.6 });
export const sharedAllFlow07 = shared("shared-all-flow-a07", true, { cost: "flow", alpha: 0.7 });

// HWY-039: three passes of rip-up. The baselines are `shared` and `shared-all`.
export const sharedPasses3 = shared("shared-p3", false, { passes: 3 });
export const sharedAllPasses3 = shared("shared-all-p3", true, { passes: 3 });

// HWY-005 and NAT-005: Winding Roads with 2 passes and `reuse: 1`. The baselines are `shared` and `shared-all`.
export const windP2R1 = shared("shared-wind-p2-r1", false, { passes: 2, reuse: 1 });
export const windAllP2R1 = shared("shared-all-wind-p2-r1", true, { passes: 2, reuse: 1 });

// HWY-016: the channel capacity 1 and 3. The baseline is `shared`.
export const cap1 = shared("shared-cap-1", false, { capacity: 1 });
export const cap3 = shared("shared-cap-3", false, { capacity: 3 });

// NAT-035: the Snell merges, for the lane crossings (B5). The baselines are `shared` and `shared-all`.
export const sharedSnell = shared("shared-snell", false, { merge: "snell" });
export const sharedAllSnell = shared("shared-all-snell", true, { merge: "snell" });

// HWY-046: the gate `hysteresis` after `shared-ways`. The baseline is `shared-ways`. The gate after `corridors` is a built-in strategy.
export { sharedWaysHysteresis } from "./build-w2a.ts";
