// SEARCH-BUDGET: the highway strategy `search` at its default, at 3 work budgets and with 0 evaluations (the start plan), each as a router.
// Start: `pnpm screen --step router --module scripts/screens/search-budget.ts --strategy corners --set screen-v3`. Start it only in CI, with the workflow `Screen`.
import { highwayRouterStrategy } from "../../src/highways/router.ts";
import { SEARCH_DEFAULTS, type SearchOptions } from "../../src/highways/search/index.ts";
import { STRATEGIES } from "../../src/strategies/builtins.ts";
import { defineStrategy, getStrategy, type Strategy } from "../../src/strategies/model.ts";

const search = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "search") as Strategy<"highway", SearchOptions>);

/** This function gives the router strategy of `search` with a name and options of its own. */
const variant = (name: string, options: Partial<SearchOptions>): Strategy<"router", SearchOptions> =>
  defineStrategy({ ...search, name, describe: `${search.describe} SEARCH-BUDGET: ${JSON.stringify(options)}.`, defaults: { ...SEARCH_DEFAULTS, ...options } });

/** The strategies of the screen. */
export const strategies: readonly Strategy<"router", SearchOptions>[] = [
  variant("search", {}),
  variant("search-e0", { evaluations: 0 }),
  variant("search-w500", { work: 500 }),
  variant("search-w2000", { work: 2000 }),
  variant("search-w8000", { work: 8000 }),
];
