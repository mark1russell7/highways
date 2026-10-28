// The screen of the portfolio router (PORTFOLIO-API, PORTFOLIO-FIT): one router strategy for each rule, cap and variant, with the name `portfolio-<rule>-<cap>-<variant>`.
// The variants are k = 3, 5 and 8, k = 5 with a budget of 16, 50 and 100 ms, and the fit (the default of the router).
// Each record gets the trace measures `move.pick`, `portfolio.winner-index` (0 when the base `shared` wins) and `portfolio.cut` (the members that the budget cut).
// Start: `pnpm screen --step router --set exact-v1 --module scripts/screens/portfolio-api.ts`. Start it only in CI, with the workflow `Screen`.
import type { Graph } from "../../src/model.ts";
import { PORTFOLIO_CAPS, PORTFOLIO_RULES, type PortfolioCap, type PortfolioRule } from "../../src/portfolio/bands.ts";
import { routePortfolio, type PortfolioRouterOptions } from "../../src/portfolio/router.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** One variant of the portfolio router: its id and its options without the rule and the cap. */
export interface PortfolioVariant {
  readonly id: string;
  readonly options: Pick<PortfolioRouterOptions, "k" | "budgetMs">;
}

/** The variants of the screen. A budget variant has k = 5 and a budget in ms. */
export const PORTFOLIO_VARIANTS: readonly PortfolioVariant[] = [
  { id: "k3", options: { k: 3 } },
  { id: "k5", options: { k: 5 } },
  { id: "k8", options: { k: 8 } },
  { id: "k5-b16", options: { k: 5, budgetMs: 16 } },
  { id: "k5-b50", options: { k: 5, budgetMs: 50 } },
  { id: "k5-b100", options: { k: 5, budgetMs: 100 } },
  { id: "fit", options: {} },
];

/** This function gives the name of the form of a rule, a cap and a variant. */
export const formName = (rule: string, cap: number, variant: string): string => `portfolio-${rule}-${cap}-${variant}`;

/** The trace measures of the last run of each strategy on each graph. */
const last = new WeakMap<Graph, Map<string, Record<string, number>>>();

/** This function gives the router strategy of one form of the portfolio router. It keeps the trace measures of its last run. */
function form(rule: PortfolioRule, cap: PortfolioCap, v: PortfolioVariant): Strategy<"router", object> {
  const name = formName(rule, cap, v.id);
  const o: PortfolioRouterOptions = { rule, cap, ...v.options };
  return defineStrategy({
    step: "router",
    name,
    describe: `The portfolio router with the rule ${rule}, the cap ${cap} and the variant ${v.id}.`,
    defaults: {},
    schema: {},
    maxNodes: 10_000,
    run: (graph: Graph) => {
      const r = routePortfolio(graph, o);
      if (!last.has(graph)) last.set(graph, new Map());
      last.get(graph)!.set(name, { ...r.moves, "portfolio.winner-index": r.trace.winnerIndex, "portfolio.cut": r.trace.cut });
      return r.result;
    },
  });
}

/** The forms of the portfolio router: each rule, cap and variant. */
export const portfolioForms: readonly Strategy<"router", object>[] = PORTFOLIO_RULES.flatMap((rule) => PORTFOLIO_CAPS.flatMap((cap) => PORTFOLIO_VARIANTS.map((v) => form(rule, cap, v))));

/** This function gives the trace measures of a form on a graph, from its last run. A name of another strategy gives `undefined`. */
export function moves(name: string, graph: Graph): Record<string, number> | undefined {
  return last.get(graph)?.get(name);
}
