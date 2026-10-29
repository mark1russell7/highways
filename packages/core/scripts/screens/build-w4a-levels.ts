// The level settings of the screen of BUILD-W4A: the closed venation backbone (NAT-016).
// Start: `pnpm screen --step levels --strategy venation --module scripts/screens/build-w4a-levels.ts`. The baseline is `depths`.
import { VENATION_DEFAULTS, venationLevels, type VenationOptions } from "../../src/levels/venation/index.ts";
import type { Level } from "../../src/model.ts";
import { defineStrategy, type LevelInput, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a level strategy of `venation` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<VenationOptions>): Strategy<"levels", object> {
  const o = { ...VENATION_DEFAULTS, ...options };
  const run = (input: LevelInput): Level[] => venationLevels(input, o);
  return defineStrategy({ step: "levels", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

// NAT-016: the Gabriel graph, and the largest discount.
export const venationGabriel = variant("venation-gabriel", { backbone: "gabriel" });
export const venationD08 = variant("venation-d0.8", { discount: 0.8 });
