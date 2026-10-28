// The router settings of the screen of BUILD-W3B: Winding Roads (HWY-005 with NAT-005) and the channel capacity (HWY-016) of the router `shared`.
// Start: `pnpm screen --step router --strategy shared,shared-all --module scripts/screens/build-w3b-router.ts`. The baselines are `shared` and `shared-all`.
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

// The rip-up passes of HWY-039, as the reference of the passes.
export const sharedP2 = shared("shared-p2", false, { passes: 2 });

// HWY-005 with NAT-005: Winding Roads. Each later pass routes each edge again from no ways, and the busy links of the pass before pull it.
export const windP2R05 = shared("shared-wind-p2-r0.5", false, { passes: 2, reuse: 0.5 });
export const windP2R1 = shared("shared-wind-p2-r1", false, { passes: 2, reuse: 1 });
export const windP2R2 = shared("shared-wind-p2-r2", false, { passes: 2, reuse: 2 });
export const windP3R1 = shared("shared-wind-p3-r1", false, { passes: 3, reuse: 1 });
export const windP2R1E2 = shared("shared-wind-p2-r1-e2", false, { passes: 2, reuse: 1, reuseExponent: 2 });
export const windAllP2R1 = shared("shared-all-wind-p2-r1", true, { passes: 2, reuse: 1 });

// HWY-016: the channel capacity, alone and with the metro-line lane order.
export const cap1 = shared("shared-cap-1", false, { capacity: 1 });
export const cap3 = shared("shared-cap-3", false, { capacity: 3 });
export const cap1Run = shared("shared-cap-1-run", false, { capacity: 1, laneOrder: "run" });
export const cap1W6 = shared("shared-cap-1-w6", false, { capacity: 1, laneWidth: 6 });
export const capAll1 = shared("shared-all-cap-1", true, { capacity: 1 });
