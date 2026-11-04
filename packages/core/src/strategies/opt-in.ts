import { sharedStretchStrategy } from "../lane-orders/stretch/router.ts";
import { portfolioStrategy } from "../portfolio/router.ts";
import { adamStrategy, annealingStrategy, attractionStrategy, canalStrategy, nudgeStrategy, repelStrategy, rerouteStrategy, springsStrategy, tightStrategy } from "../routers/index.ts";
import { STRATEGIES } from "./builtins.ts";
import { register, type AnyStrategy, type Registry, type Step } from "./model.ts";

/**
 * The opt-in strategies, in the order of their names. Each one is a router with its own recorded numbers, and no default uses it.
 * The registry `STRATEGIES` does not hold them, so its bench rows, its screen rows and its default routes stay the same.
 */
export const OPT_IN_STRATEGIES: readonly AnyStrategy[] = [
  adamStrategy,
  annealingStrategy,
  attractionStrategy,
  canalStrategy,
  nudgeStrategy,
  portfolioStrategy,
  repelStrategy,
  rerouteStrategy,
  sharedStretchStrategy,
  springsStrategy,
  tightStrategy,
];

/** The registry of each built-in strategy and each opt-in strategy. A page that shows every strategy reads this registry. A benchmark and a screen read `STRATEGIES`. */
export const ALL_STRATEGIES: Registry = register(STRATEGIES, ...OPT_IN_STRATEGIES);

/**
 * The default strategy of each step. The steps `highway` and `curve` have no default: a caller picks one.
 * The defaults of `plugs`, `levels` and `whole` come from STEP-SLOTS: they give the output of the steps before the slots.
 */
export const STEP_DEFAULTS: Readonly<Partial<Record<Step, string>>> = { group: "quadtree", plugs: "facing", router: "shared", levels: "depths", room: "routes", whole: "pipeline" };
