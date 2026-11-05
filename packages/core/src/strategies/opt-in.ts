import { sharedWaysAll } from "../bench/screen/gap.ts";
import { sharedStretchStrategy } from "../lane-orders/stretch/router.ts";
import { portfolioStrategy } from "../portfolio/router.ts";
import { adamStrategy, annealingStrategy, attractionStrategy, canalStrategy, nudgeStrategy, repelStrategy, rerouteStrategy, springsStrategy, tightStrategy } from "../routers/index.ts";
import { oneTrunkStrategy } from "../routers/one-trunk/index.ts";
import { borderWalkStrategy } from "../routers/border-walk/index.ts";
import { perimeterStrategy } from "../routers/perimeter/index.ts";
import { seamsStrategy } from "../routers/seams/index.ts";
import { STRATEGIES } from "./builtins.ts";
import { findStrategy, register, STEPS, type AnyStrategy, type Registry, type Step } from "./model.ts";

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

/** The baselines and the controls: a screen or a benchmark compares a strategy with them, and no chooser offers them. */
export const BASELINE_STRATEGIES: readonly AnyStrategy[] = [sharedWaysAll, oneTrunkStrategy, perimeterStrategy, borderWalkStrategy];

/** The opt-in strategies with no recorded numbers. Each one moves to `OPT_IN_STRATEGIES`, with its note on the compare page, after its screen. */
export const UNSCREENED_STRATEGIES: readonly AnyStrategy[] = [seamsStrategy];

/** The registry of each strategy that has a key: `ALL_STRATEGIES`, `BASELINE_STRATEGIES` and `UNSCREENED_STRATEGIES`. A test holds that no strategy of the source is outside it. */
export const KEYED_STRATEGIES: Registry = register(ALL_STRATEGIES, ...BASELINE_STRATEGIES, ...UNSCREENED_STRATEGIES);

/** The result of a lookup by key: the strategy, or the reason that the key has no strategy. */
export type StrategyLookup = { readonly ok: true; readonly strategy: AnyStrategy } | { readonly ok: false; readonly reason: string };

/** This function gives the key of a strategy: its step, a slash and its name. Two steps can use one name, so the name alone is not a key. */
export function keyOfStrategy(strategy: AnyStrategy): string {
  return `${strategy.step}/${strategy.name}`;
}

/** This function gives the strategy of a key from `keyOfStrategy`, or a reason. It reads `KEYED_STRATEGIES` when the caller gives no registry. */
export function strategyOfKey(key: string, registry: Registry = KEYED_STRATEGIES): StrategyLookup {
  const slash = key.indexOf("/");
  if (slash < 0) return { ok: false, reason: `The key ${key} has no step. A key has the form step/name.` };
  const step = key.slice(0, slash) as Step;
  const name = key.slice(slash + 1);
  if (!STEPS.includes(step)) return { ok: false, reason: `There is no step ${step}. The steps are ${STEPS.join(", ")}.` };
  const strategy = findStrategy(registry, step, name) as AnyStrategy | undefined;
  return strategy ? { ok: true, strategy } : { ok: false, reason: `The step ${step} has no strategy ${name}.` };
}

/**
 * The default strategy of each step. The steps `highway` and `curve` have no default: a caller picks one.
 * The defaults of `plugs`, `levels` and `whole` come from STEP-SLOTS: they give the output of the steps before the slots.
 */
export const STEP_DEFAULTS: Readonly<Partial<Record<Step, string>>> = { group: "quadtree", plugs: "facing", router: "shared", levels: "depths", room: "routes", whole: "pipeline" };
