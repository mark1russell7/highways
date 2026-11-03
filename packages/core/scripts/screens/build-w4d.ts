// The highway settings of the screen of BUILD-W4D: two-way lanes (NAT-009), one global lane order (WILD-039) and approval corridors (WILD-031).
// The module has changes of the options of the strategies.
// Start: `pnpm screen --step highway --strategy two-way,global-order,approval --module scripts/screens/build-w4d.ts`. The baseline is `shared`.
import { APPROVAL_DEFAULTS, approvalPlan, type ApprovalOptions } from "../../src/highways/approval/index.ts";
import { GLOBAL_ORDER_DEFAULTS, globalOrderPlan, type GlobalOrderOptions } from "../../src/highways/global-order/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { TWO_WAY_DEFAULTS, twoWayPlan, type TwoWayOptions } from "../../src/highways/two-way/index.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name` from the function `run` and the options `o`. */
function variant(name: string, o: object, run: (input: HighwayInput) => HighwayPlan): Strategy<"highway", object> {
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

const twoWay = (name: string, options: Partial<TwoWayOptions>): Strategy<"highway", object> => {
  const o = { ...TWO_WAY_DEFAULTS, ...options };
  return variant(name, o, (input) => twoWayPlan(input, o));
};
const globalOrder = (name: string, options: Partial<GlobalOrderOptions>): Strategy<"highway", object> => {
  const o = { ...GLOBAL_ORDER_DEFAULTS, ...options };
  return variant(name, o, (input) => globalOrderPlan(input, o));
};
const approval = (name: string, options: Partial<ApprovalOptions>): Strategy<"highway", object> => {
  const o = { ...APPROVAL_DEFAULTS, ...options };
  return variant(name, o, (input) => approvalPlan(input, o));
};

// NAT-009: keep left, the outer lanes, and half the weight of the direction.
export const twoWayLeft = twoWay("two-way-left", { side: "left" });
export const twoWayOuter = twoWay("two-way-outer", { side: "outer" });
export const twoWayW05 = twoWay("two-way-w0.5", { weight: 0.5 });

// WILD-039: the key angle, no sifting, and three passes.
export const globalOrderAngle = globalOrder("global-order-angle", { key: "angle" });
export const globalOrderP0 = globalOrder("global-order-p0", { passes: 0 });
export const globalOrderP3 = globalOrder("global-order-p3", { passes: 3 });

// WILD-031: the greedy cover, a small epsilon, and a larger budget of links.
export const approvalCover = approval("approval-cover", { pick: "cover" });
export const approvalEps005 = approval("approval-eps0.05", { eps: 0.05 });
export const approvalBudget05 = approval("approval-budget0.5", { budget: 0.5 });
