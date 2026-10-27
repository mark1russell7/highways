// The router settings of the screen of BUILD-W1C: the flow cost, the pioneer order and the Snell merges of `shared` (EDA-029, NAT-024, NAT-035),
// and the Gilbert split and the balancing-factor trees of `trunks` (EDA-030, NAT-017).
// Start: `pnpm screen --step router --strategy shared,shared-all,trunks --module scripts/screens/build-w1c.ts`. The baselines are `shared`, `shared-all` and `trunks`.
import type { Graph, Result } from "../../src/model.ts";
import { sharedRouter, type SharedOptions } from "../../src/routers/shared.ts";
import { byCollection, trunksRouter, type TrunksOptions } from "../../src/routers/trunks.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of `shared` (with the rule `byCollection`) or `shared-all` (without a rule), with the options `options`. */
function shared(name: string, all: boolean, options: Omit<SharedOptions, "name" | "rule">): Strategy<"router", object> {
  const describe = `The router \`${all ? "shared-all" : "shared"}\` with ${JSON.stringify(options)}.`;
  const run = (graph: Graph): Result => sharedRouter({ ...options, ...(all ? {} : { rule: byCollection }), name }).route(graph);
  return defineStrategy({ step: "router", name, describe, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

/** This function makes a router strategy of `trunks` with the options `options`. */
function trunks(name: string, options: Omit<TrunksOptions, "name" | "rule">): Strategy<"router", object> {
  const run = (graph: Graph): Result => trunksRouter({ ...options, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`trunks\` with ${JSON.stringify(options)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// EDA-029 (with HWY-038 and HWY-039): the flow cost len * f^alpha, against `discount` 0.5.
export const sharedFlow05 = shared("shared-flow-a05", false, { cost: "flow", alpha: 0.5 });
export const sharedFlow06 = shared("shared-flow-a06", false, { cost: "flow", alpha: 0.6 });
export const sharedFlow07 = shared("shared-flow-a07", false, { cost: "flow", alpha: 0.7 });
export const sharedFlow08 = shared("shared-flow-a08", false, { cost: "flow", alpha: 0.8 });
export const sharedAllFlow05 = shared("shared-all-flow-a05", true, { cost: "flow", alpha: 0.5 });
export const sharedAllFlow06 = shared("shared-all-flow-a06", true, { cost: "flow", alpha: 0.6 });
export const sharedAllFlow07 = shared("shared-all-flow-a07", true, { cost: "flow", alpha: 0.7 });
export const sharedAllFlow08 = shared("shared-all-flow-a08", true, { cost: "flow", alpha: 0.8 });
// HWY-039: three passes of rip-up, with the fixed discount and with the flow cost.
export const sharedPasses3 = shared("shared-p3", false, { passes: 3 });
export const sharedAllPasses3 = shared("shared-all-p3", true, { passes: 3 });
export const sharedFlow06Passes3 = shared("shared-flow-a06-p3", false, { cost: "flow", alpha: 0.6, passes: 3 });
export const sharedAllFlow06Passes3 = shared("shared-all-flow-a06-p3", true, { cost: "flow", alpha: 0.6, passes: 3 });

// NAT-024 (with WILD-022): the order of the edges. The default `span` is the longest first.
export const sharedInput = shared("shared-order-input", false, { order: "input" });
export const sharedLoad = shared("shared-order-load", false, { order: "load" });
export const sharedShortest = shared("shared-order-shortest", false, { order: "shortest" });
export const sharedAllInput = shared("shared-all-order-input", true, { order: "input" });
export const sharedAllLoad = shared("shared-all-order-load", true, { order: "load" });
export const sharedAllShortest = shared("shared-all-order-shortest", true, { order: "shortest" });

// NAT-035: the Snell merges, with the fixed discount and with the flow cost.
export const sharedSnell = shared("shared-snell", false, { merge: "snell" });
export const sharedAllSnell = shared("shared-all-snell", true, { merge: "snell" });
export const sharedFlow06Snell = shared("shared-flow-a06-snell", false, { cost: "flow", alpha: 0.6, merge: "snell" });
export const sharedAllFlow06Snell = shared("shared-all-flow-a06-snell", true, { cost: "flow", alpha: 0.6, merge: "snell" });

// EDA-030: the Gilbert split point of `trunks`.
export const trunksGilbert03 = trunks("trunks-gilbert-a03", { splitAt: "gilbert", alpha: 0.3 });
export const trunksGilbert05 = trunks("trunks-gilbert-a05", { splitAt: "gilbert", alpha: 0.5 });
export const trunksGilbert07 = trunks("trunks-gilbert-a07", { splitAt: "gilbert", alpha: 0.7 });

// NAT-017: the balancing-factor trees.
export const trunksTree02 = trunks("trunks-tree-bf02", { fan: "tree", bf: 0.2 });
export const trunksTree04 = trunks("trunks-tree-bf04", { fan: "tree", bf: 0.4 });
export const trunksTree06 = trunks("trunks-tree-bf06", { fan: "tree", bf: 0.6 });
export const trunksTree08 = trunks("trunks-tree-bf08", { fan: "tree", bf: 0.8 });
