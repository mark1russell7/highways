// The whole settings of the screen of BUILD-W4C: the rule weights from preferences (RULE-038), the firefly and bee searches (NAT-047) and the tracing load (WILD-057).
// Start: `pnpm screen --step whole --strategy preferences,fireflies,tracing --module scripts/screens/build-w4c-whole.ts`. The baseline is `pipeline`.
import type { Graph } from "../../src/model.ts";
import { BOARD_PORTFOLIO_SETTINGS, CURRICULUM_POOL, routerStrategies } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy, type WholeOutput } from "../../src/strategies/model.ts";
import { FIREFLY_DEFAULTS, fireflies, type FireflyOptions } from "../../src/whole/fireflies/index.ts";
import { PREFERENCE_DEFAULTS, preferences, type PreferenceOptions } from "../../src/whole/preferences/index.ts";
import { TRACING_DEFAULTS, tracing, type TracingOptions } from "../../src/whole/tracing/index.ts";

/** This function makes a whole strategy with the name `name` from the function `run` and the options `o`. */
function variant(name: string, o: object, run: (graph: Graph) => WholeOutput): Strategy<"whole", object> {
  return defineStrategy({ step: "whole", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

const pref = (name: string, options: Partial<PreferenceOptions>): Strategy<"whole", object> => {
  const o = { ...PREFERENCE_DEFAULTS, ...options };
  return variant(name, o, (graph) => preferences(graph, CURRICULUM_POOL, o));
};
const swarm = (name: string, options: Partial<FireflyOptions>): Strategy<"whole", object> => {
  const o = { ...FIREFLY_DEFAULTS, ...options };
  return variant(name, o, (graph) => fireflies(graph, routerStrategies.shared as Strategy<"router">, o).output);
};
const trace = (name: string, options: Partial<TracingOptions>): Strategy<"whole", object> => {
  const o = { ...TRACING_DEFAULTS, ...options };
  return variant(name, o, (graph) => tracing(graph, BOARD_PORTFOLIO_SETTINGS, o).output);
};

// RULE-038: a larger L2 term, two passes, and a pool of two settings.
export const preferencesL2 = pref("preferences-l2", { l2: 0.1 });
export const preferencesP2 = pref("preferences-p2", { passes: 2 });
export const preferencesS2 = pref("preferences-s2", { settings: 2 });

// NAT-047: the bee colony, a larger budget, and another seed.
export const firefliesBees = swarm("fireflies-bees", { search: "bees" });
export const firefliesB24 = swarm("fireflies-b24", { budget: 24 });
export const firefliesSeed2 = swarm("fireflies-seed2", { seed: 2 });

// WILD-057: a smaller weight of the merges, the median load, and each of the 12 settings.
export const tracingM05 = trace("tracing-m0.5", { merge: 0.5 });
export const tracingQ50 = trace("tracing-q50", { quantile: "q50" });
export const tracingS12 = trace("tracing-s12", { settings: 12 });
