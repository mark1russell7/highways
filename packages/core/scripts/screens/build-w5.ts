// The highway settings of the screen of BUILD-W5: streets along the cuts (WILD-035), a concave then convex link cost (EDA-032) and summed currents (RULE-051).
// The module has changes of the options of the strategies.
// Start: `pnpm screen --step highway --strategy cut-streets,concave-convex,currents --module scripts/screens/build-w5.ts`. The baseline is `shared`.
import { CONCAVE_DEFAULTS, concavePlan, type ConcaveOptions } from "../../src/highways/concave-convex/index.ts";
import { CURRENT_DEFAULTS, currentPlan, type CurrentOptions } from "../../src/highways/currents/index.ts";
import { CUT_STREET_DEFAULTS, cutStreetPlan, type CutStreetOptions } from "../../src/highways/cut-streets/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name` from the function `run` and the options `o`. */
function variant(name: string, o: object, run: (input: HighwayInput) => HighwayPlan): Strategy<"highway", object> {
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

const streets = (name: string, options: Partial<CutStreetOptions>): Strategy<"highway", object> => {
  const o = { ...CUT_STREET_DEFAULTS, ...options };
  return variant(name, o, (input) => cutStreetPlan(input, o));
};
const concave = (name: string, options: Partial<ConcaveOptions>): Strategy<"highway", object> => {
  const o = { ...CONCAVE_DEFAULTS, ...options };
  return variant(name, o, (input) => concavePlan(input, o));
};
const currents = (name: string, options: Partial<CurrentOptions>): Strategy<"highway", object> => {
  const o = { ...CURRENT_DEFAULTS, ...options };
  return variant(name, o, (input) => currentPlan(input, o));
};

// WILD-035: the median split, three levels of cuts, and a longer detour.
export const cutStreetsKd = streets("cut-streets-kd", { grouping: "kd" });
export const cutStreetsL3 = streets("cut-streets-l3", { levels: 3 });
export const cutStreetsD2 = streets("cut-streets-d2", { detour: 2 });

// EDA-032: a linear cost below the capacity, the keys of the collections, and narrow lanes.
export const concaveA1 = concave("concave-convex-a1", { alpha: 1 });
export const concaveKeys = concave("concave-convex-keys", { keys: "collection" });
export const concaveS2 = concave("concave-convex-s2", { spacing: 2 });

// RULE-051: no pull of the current, eight direction classes, and larger cells.
export const currentsB0 = currents("currents-b0", { beta: 0 });
export const currentsC8 = currents("currents-c8", { classes: 8 });
export const currentsCell8 = currents("currents-cell8", { cell: 8 });
