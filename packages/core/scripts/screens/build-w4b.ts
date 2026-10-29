// The highway settings of the screen of BUILD-W4B: the stretch balance in a bundle (EDA-017) and the manifolds for a fan to a row (WILD-036).
// The module has changes of the options of each strategy.
// Start: `pnpm screen --step highway --strategy balance,manifolds --module scripts/screens/build-w4b.ts`. The baseline is `shared`.
import { BALANCE_DEFAULTS, balancePlan } from "../../src/highways/balance/index.ts";
import { MANIFOLD_DEFAULTS, manifoldPlan } from "../../src/highways/manifolds/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name`, from the plan function `plan` and the options `options`. */
function variant<O extends object>(name: string, plan: (input: HighwayInput, o: Readonly<O>) => HighwayPlan, options: O): Strategy<"highway", object> {
  const run = (input: HighwayInput): HighwayPlan => plan(input, options);
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(options)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// EDA-017: the lowest target, both ends, and the plan of `corridors`.
export const balanceT11 = variant("balance-t1.1", balancePlan, { ...BALANCE_DEFAULTS, tau: 1.1, iterations: 10 });
export const balanceBoth = variant("balance-both", balancePlan, { ...BALANCE_DEFAULTS, end: "both" as const });
export const balanceCorridors = variant("balance-corridors", balancePlan, { ...BALANCE_DEFAULTS, from: "corridors" as const });

// WILD-036: the header near the feed node, larger fans, and no plan for the other edges.
export const manifoldsFar = variant("manifolds-far", manifoldPlan, { ...MANIFOLD_DEFAULTS, side: "far" as const });
export const manifoldsK5 = variant("manifolds-k5", manifoldPlan, { ...MANIFOLD_DEFAULTS, kMin: 5 });
export const manifoldsNone = variant("manifolds-none", manifoldPlan, { ...MANIFOLD_DEFAULTS, from: "none" as const });
