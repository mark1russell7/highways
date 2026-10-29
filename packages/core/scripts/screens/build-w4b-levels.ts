// The level settings of the screen of BUILD-W4B: the level of detail of the bundles (WILD-016 with EDA-038).
// Start: `pnpm screen --step levels --strategy detail --module scripts/screens/build-w4b-levels.ts`. The baseline is `depths`.
import { DETAIL_DEFAULTS, detailLevels, type DetailOptions } from "../../src/levels/detail/index.ts";
import type { Level } from "../../src/model.ts";
import { defineStrategy, type LevelInput, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a level strategy of `detail` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<DetailOptions>): Strategy<"levels", object> {
  const o = { ...DETAIL_DEFAULTS, ...options };
  const run = (input: LevelInput): Level[] => detailLevels(input, o);
  return defineStrategy({ step: "levels", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

// WILD-016 and EDA-038: the widest collapse, and strokes of 3 edges or more.
export const detailPx4 = variant("detail-px4", { pxMin: 4 });
export const detailMin3 = variant("detail-min3", { minCount: 3 });
