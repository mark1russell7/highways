// The whole settings of the screen of BUILD-W5: the pick by the ink floor of moats (WILD-054).
// Start: `pnpm screen --step whole --strategy moats,board-portfolio --module scripts/screens/build-w5-whole.ts`. The baseline is `pipeline`.
import { BOARD_PORTFOLIO_SETTINGS } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";
import { MOAT_DEFAULTS, moats, type MoatOptions } from "../../src/whole/moats/index.ts";

/** This function makes a whole strategy of `moats` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<MoatOptions>): Strategy<"whole", object> {
  const o = { ...MOAT_DEFAULTS, ...options };
  return defineStrategy({ step: "whole", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run: (graph) => moats(graph, BOARD_PORTFOLIO_SETTINGS, o).output });
}

// WILD-054: two settings, eight settings, and twelve settings.
export const moatsS2 = variant("moats-s2", { settings: 2 });
export const moatsS8 = variant("moats-s8", { settings: 8 });
export const moatsS12 = variant("moats-s12", { settings: 12 });
