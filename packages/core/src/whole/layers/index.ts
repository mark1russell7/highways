/**
 * The whole strategy `layers` (RULE-017): layers of rules in priority order, after the lexicographic method of the survey of Marler and Arora (2004).
 * The user orders the rules and gives no weights. Each layer keeps the settings near its best value, and the next layer picks among them.
 * The idea RULE-019 is not built, so the fixed list of settings of `board-portfolio` is the inner solver.
 */
import type { Graph } from "../../model.ts";
import type { WholeOutput } from "../../strategies/model.ts";
import { boardPortfolio, type PortfolioEntry, type PortfolioSetting } from "../portfolio/index.ts";

/** The soft rules of the layers: the crossings (R1), the median detour (R5) and the ink saved (B1). */
export type LayerRule = "crossings" | "detour" | "ink";

/** The order of the three layers. The first rule has the highest priority. */
export type LayerOrder = "crossings,detour,ink" | "crossings,ink,detour" | "detour,crossings,ink" | "detour,ink,crossings" | "ink,crossings,detour" | "ink,detour,crossings";

/** The values of `LayerOrder`. */
export const LAYER_ORDERS: readonly LayerOrder[] = Object.freeze(["crossings,detour,ink", "crossings,ink,detour", "detour,crossings,ink", "detour,ink,crossings", "ink,crossings,detour", "ink,detour,crossings"]);

/** The options of the whole strategy `layers` (RULE-017). */
export interface LayerOptions {
  /** The order of the layers. The default is `crossings,detour,ink`. */
  readonly order: LayerOrder;
  /** Each layer holds its value within this share of its best value, from 0 to 0.2. The default is 0.05. */
  readonly slack: number;
  /** The number of settings that the layers rank, from the start of the list, from 3 to 12. The default is 4. */
  readonly settings: number;
}

/** The default options of the strategy `layers`. */
export const LAYER_DEFAULTS: Readonly<LayerOptions> = Object.freeze({ order: "crossings,detour,ink", slack: 0.05, settings: 4 });

/**
 * This function gives the index of the entry that the layers keep (RULE-017), or -1 for a list with no entry.
 * The entries already obey the hard rules: layer 0. Each next layer keeps the entries within `1 + slack` of its best value, or `1 - slack` for the ink saved.
 * The first entry of the rest wins, so a tie goes to the earlier setting.
 */
export function layerPick(entries: readonly Pick<PortfolioEntry, LayerRule>[], order: LayerOrder, slack: number): number {
  let rest = entries.map((_, i) => i);
  for (const rule of order.split(",") as LayerRule[]) {
    const values = rest.map((i) => entries[i]![rule]);
    if (rule === "ink") {
      const best = Math.max(...values);
      const limit = best - slack * Math.abs(best);
      rest = rest.filter((i) => entries[i]!.ink >= limit);
    } else {
      const best = Math.min(...values);
      const limit = best + slack * Math.abs(best);
      rest = rest.filter((i) => entries[i]![rule] <= limit);
    }
  }
  return rest[0] ?? -1;
}

/** This function runs the settings of the list, and it gives the output of the entry of `layerPick`. A board with no good entry gives the output of the portfolio. */
export function layers(graph: Graph, list: readonly PortfolioSetting[], o: Readonly<LayerOptions>): WholeOutput {
  const run = boardPortfolio(graph, list, { settings: o.settings, crossings: 1, detour: 1, ink: 1, budget: 0 });
  const i = layerPick(run.entries, o.order, o.slack);
  return i < 0 ? run.output : run.entries[i]!.output;
}
