// The whole settings of the screen of BUILD-W4D: the tune on crops of the board (WILD-048) and the learned choice of the setting (WILD-046).
// Start: `pnpm screen --step whole --strategy crops,choice,board-portfolio --module scripts/screens/build-w4d-whole.ts`. The baseline is `pipeline`.
import type { Graph } from "../../src/model.ts";
import { BOARD_PORTFOLIO_SETTINGS } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy, type WholeOutput } from "../../src/strategies/model.ts";
import { CHOICE_DEFAULTS, choice, type ChoiceOptions } from "../../src/whole/choice/index.ts";
import { CROP_DEFAULTS, crops, type CropOptions } from "../../src/whole/crops/index.ts";

/** This function makes a whole strategy with the name `name` from the function `run` and the options `o`. */
function variant(name: string, o: object, run: (graph: Graph) => WholeOutput): Strategy<"whole", object> {
  return defineStrategy({ step: "whole", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

const crop = (name: string, options: Partial<CropOptions>): Strategy<"whole", object> => {
  const o = { ...CROP_DEFAULTS, ...options };
  return variant(name, o, (graph) => crops(graph, BOARD_PORTFOLIO_SETTINGS, o).output);
};
const pick = (name: string, options: Partial<ChoiceOptions>): Strategy<"whole", object> => {
  const o = { ...CHOICE_DEFAULTS, ...options };
  return variant(name, o, (graph) => choice(graph, BOARD_PORTFOLIO_SETTINGS, o).output);
};

// WILD-048: more windows, larger windows, and another seed.
export const cropsW6 = crop("crops-w6", { windows: 6 });
export const cropsN100 = crop("crops-n100", { nodes: 100 });
export const cropsSeed2 = crop("crops-seed2", { seed: 2 });

// WILD-046: one nearest board, the size features only, and the shape features only.
export const choiceK1 = pick("choice-k1", { k: 1 });
export const choiceSize = pick("choice-size", { features: "size" });
export const choiceShape = pick("choice-shape", { features: "shape" });
