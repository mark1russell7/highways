// The plug settings of the screen of BUILD-W4D: the ordered escape of the plugs (EDA-022).
// Start: `pnpm screen --step plugs --strategy escape --module scripts/screens/build-w4d-plugs.ts`. The baseline is `facing`.
import { ESCAPE_DEFAULTS, escapeEnds, type EscapeOptions } from "../../src/plugs/escape/index.ts";
import { defineStrategy, type PlugInput, type PlugPair, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a plug strategy of `escape` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<EscapeOptions>): Strategy<"plugs", object> {
  const o = { ...ESCAPE_DEFAULTS, ...options };
  const run = (input: PlugInput): PlugPair[] => escapeEnds(input, o);
  return defineStrategy({ step: "plugs", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

// EDA-022: the slots of the flow method, the least slot spacing, and no second round.
export const escapeFlow = variant("escape-flow", { method: "flow" });
export const escapeGap2 = variant("escape-gap2", { slotSpacing: 2 });
export const escapeR0 = variant("escape-r0", { rounds: 0 });
