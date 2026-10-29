// The whole settings of the screen of BUILD-W4A: the portfolio for each board (WILD-045).
// Start: `pnpm screen --step whole --strategy board-portfolio --module scripts/screens/build-w4a-whole.ts`. The baseline is `pipeline`.
import type { Graph } from "../../src/model.ts";
import { BOARD_PORTFOLIO_SETTINGS } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy, type WholeOutput } from "../../src/strategies/model.ts";
import { BOARD_PORTFOLIO_DEFAULTS, boardPortfolio, type BoardPortfolioOptions } from "../../src/whole/portfolio/index.ts";

/** This function makes a whole strategy of `board-portfolio` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<BoardPortfolioOptions>): Strategy<"whole", object> {
  const o = { ...BOARD_PORTFOLIO_DEFAULTS, ...options };
  const run = (graph: Graph): WholeOutput => boardPortfolio(graph, BOARD_PORTFOLIO_SETTINGS, o).output;
  return defineStrategy({ step: "whole", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

// WILD-045: all 12 settings, and the ink alone.
export const portfolioS12 = variant("board-portfolio-s12", { settings: 12 });
export const portfolioInk = variant("board-portfolio-ink", { crossings: 0, detour: 0 });
