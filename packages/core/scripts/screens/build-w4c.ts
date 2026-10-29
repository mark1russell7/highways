// The highway settings of the screen of BUILD-W4C: the pull toward the lane slots of the highway skeleton (RULE-047).
// The module has changes of the options of the strategy.
// Start: `pnpm screen --step highway --strategy slots --module scripts/screens/build-w4c.ts`. The baseline is `shared`.
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { SLOT_DEFAULTS, slotPlan, type SlotOptions } from "../../src/highways/slots/index.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy of `slots` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<SlotOptions>): Strategy<"highway", object> {
  const o = { ...SLOT_DEFAULTS, ...options };
  const run = (input: HighwayInput): HighwayPlan => slotPlan(input, o);
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// RULE-047: each edge can join, a stronger pull, and the trunks of `corridors`.
export const slotsAny = variant("slots-any", { keys: "any" });
export const slotsPull4 = variant("slots-pull4", { pull: 4 });
export const slotsCorridors = variant("slots-corridors", { from: "corridors" });
