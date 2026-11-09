// The plug settings of the screen of D23-PHYSICAL: charged plugs on a side, with a spring to the facing place (RULE-054).
// Start: `pnpm screen --step plugs --module scripts/screens/d23-physical-plugs.ts`. The baseline is the built-in plug strategies.
import { CHARGE_DEFAULTS, chargeEnds, type ChargeOptions } from "../../src/plugs/charges/index.ts";
import { defineStrategy, type PlugInput, type PlugPair, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a plug strategy of `charges` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<ChargeOptions>): Strategy<"plugs", object> {
  const o = { ...CHARGE_DEFAULTS, ...options };
  const run = (input: PlugInput): PlugPair[] => chargeEnds(input, o);
  return defineStrategy({ step: "plugs", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

// RULE-054: the defaults, a smaller and a larger spacing, and a short descent.
export const charges = variant("charges", {});
export const chargesS4 = variant("charges-s4", { spacing: 4 });
export const chargesS12 = variant("charges-s12", { spacing: 12 });
export const chargesR10 = variant("charges-r10", { rounds: 10 });
