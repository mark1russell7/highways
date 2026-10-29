// The plug settings of the screen of BUILD-W4B: the boundary leaders as plug stubs (EDA-041).
// Start: `pnpm screen --step plugs --strategy leaders --module scripts/screens/build-w4b-plugs.ts`. The baseline is `facing`.
import { LEADER_DEFAULTS, leaderEnds, type LeaderOptions } from "../../src/plugs/leaders/index.ts";
import { defineStrategy, type PlugInput, type PlugPair, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a plug strategy of `leaders` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<LeaderOptions>): Strategy<"plugs", object> {
  const o = { ...LEADER_DEFAULTS, ...options };
  const run = (input: PlugInput): PlugPair[] => leaderEnds(input, o);
  return defineStrategy({ step: "plugs", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

// EDA-041: the s-leaders and the opo-leaders, and the least slot spacing.
export const leadersS = variant("leaders-s", { leader: "s" });
export const leadersOpo = variant("leaders-opo", { leader: "opo" });
export const leadersGap2 = variant("leaders-gap2", { slotSpacing: 2 });
