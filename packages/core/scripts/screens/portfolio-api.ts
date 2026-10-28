// The screen of the portfolio router (PORTFOLIO-API): one router strategy for each rule, cap and k, with the name `portfolio-<rule>-<cap>-k<k>`.
// Each record gets the trace measures `move.pick` and `portfolio.winner-index` (0 when the base `shared` wins).
// Start: `pnpm screen --step router --set exact-v1 --module scripts/screens/portfolio-api.ts`. Start it only in CI, with the workflow `Screen`.
import type { Graph } from "../../src/model.ts";
import { PORTFOLIO_CAPS, PORTFOLIO_KS_API, PORTFOLIO_RULES } from "../../src/portfolio/bands.ts";
import { routePortfolio, type PortfolioRouterOptions } from "../../src/portfolio/router.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** The trace measures of the last run of each strategy on each graph. */
const last = new WeakMap<Graph, Map<string, Record<string, number>>>();

/** This function gives the router strategy of one form of the portfolio router. It keeps the trace measures of its last run. */
function form(o: Required<Pick<PortfolioRouterOptions, "rule" | "cap" | "k">>): Strategy<"router", object> {
  const name = `portfolio-${o.rule}-${o.cap}-k${o.k}`;
  return defineStrategy({
    step: "router",
    name,
    describe: `The portfolio router with the rule ${o.rule}, the cap ${o.cap} and k = ${o.k}.`,
    defaults: {},
    schema: {},
    maxNodes: 10_000,
    run: (graph: Graph) => {
      const r = routePortfolio(graph, o);
      if (!last.has(graph)) last.set(graph, new Map());
      last.get(graph)!.set(name, { ...r.moves, "portfolio.winner-index": r.trace.winnerIndex });
      return r.result;
    },
  });
}

/** The forms of the portfolio router: each rule, cap and k. */
export const portfolioForms: readonly Strategy<"router", object>[] = PORTFOLIO_RULES.flatMap((rule) => PORTFOLIO_CAPS.flatMap((cap) => PORTFOLIO_KS_API.map((k) => form({ rule, cap, k }))));

/** This function gives the trace measures of a form on a graph, from its last run. A name of another strategy gives `undefined`. */
export function moves(name: string, graph: Graph): Record<string, number> | undefined {
  return last.get(graph)?.get(name);
}
