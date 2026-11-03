// The whole settings of the screen of BUILD-W6: the layers of rules of RULE-017.
// Start: `pnpm screen --step whole --strategy layers,board-portfolio --module scripts/screens/build-w6-whole.ts`. The baseline is `pipeline`.
import { BOARD_PORTFOLIO_SETTINGS } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";
import { LAYER_DEFAULTS, layers, type LayerOptions } from "../../src/whole/layers/index.ts";

/** This function makes a whole strategy of `layers` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<LayerOptions>): Strategy<"whole", object> {
  const o = { ...LAYER_DEFAULTS, ...options };
  return defineStrategy({ step: "whole", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run: (graph) => layers(graph, BOARD_PORTFOLIO_SETTINGS, o) });
}

// RULE-017: the ink first, the detour first, no slack, and twelve settings.
export const layersInk = variant("layers-ink", { order: "ink,crossings,detour" });
export const layersDetour = variant("layers-detour", { order: "detour,crossings,ink" });
export const layersS0 = variant("layers-s0", { slack: 0 });
export const layersS12 = variant("layers-s12", { settings: 12 });
