// The portfolio router (PORTFOLIO-API): it runs the base `shared` and a small greedy set of members on an input, and gives the output with the most ink saved
// inside the rule and the stretch cap of the caller. The combinator is the local copy of `portfolio` of `@mark1russell7/layout-contract` 0.2.6.
// The router is opt-in: it is not in the registry `STRATEGIES`, so no default output changes.
import { exactStretches } from "../bench/exact/index.ts";
import { inkSaved } from "../bench/measures/bundles.ts";
import { checkProperties } from "../bench/properties.ts";
import { resultHash } from "../bench/screen/exercise.ts";
import { mixedSegments } from "../bench/screen/gap.ts";
import { compareSpec, measureByKey } from "../bench/screen/measures.ts";
import { pickMoves, portfolio, type Member, type PortfolioKey, type PortfolioTrace } from "../bench/screen/portfolio-pick.ts";
import type { Graph, Result, Router } from "../model.ts";
import { asRouter, defineStrategy, type Strategy } from "../strategies/model.ts";
import { PORTFOLIO_CAPS, PORTFOLIO_KS_API, PORTFOLIO_RULES, portfolioBand, type PortfolioCap, type PortfolioRule } from "./bands.ts";
import { portfolioMember } from "./members.ts";
import { PORTFOLIO_SETS } from "./sets.ts";

/** The options of the portfolio router. */
export interface PortfolioRouterOptions {
  /** The rule of the caller. Under `collection` (the default), a shared segment must hold edges of one collection only. Under `all`, collections can mix. */
  readonly rule?: PortfolioRule;
  /** The stretch cap of the caller: 1.1, 1.25 or 1.5 (the default). Each edge above the cap counts as a hard break. */
  readonly cap?: PortfolioCap;
  /** The count of members after the base: 3 (the default), 5 or 8. */
  readonly k?: 3 | 5 | 8;
  /** The time limit of the pick in milliseconds. The base always runs. The combinator cuts the members that start after the limit. */
  readonly budgetMs?: number;
  /** The largest count of members that run, with the base. */
  readonly maxMembers?: number;
  /** The clock in milliseconds. The default is `performance.now`. */
  readonly now?: () => number;
}

/** The base member of each portfolio: the router `shared` with the rule `byCollection`. It is the fallback output above the cap. */
export const PORTFOLIO_BASE_MEMBER = "shared";

/** The id of the B1 level of the key of the portfolio router. */
export const PORTFOLIO_B1 = "B1";

/** The result of the portfolio router: the output of the winner, the winner, the trace of the pick, the move counts and the band. */
export interface PortfolioRoute {
  readonly result: Result;
  readonly winner: string;
  readonly trace: PortfolioTrace;
  /** The move count of the pick (ACTIVATION): `{ "move.pick": 1 }` when the winner is not the base and has another output. */
  readonly moves: Readonly<Record<string, number>>;
  /** The size band of the input, from its node count. */
  readonly band: string;
  /** The names of the members, in their order. */
  readonly members: readonly string[];
}

/** This function checks the options of the portfolio router, and gives them with their defaults. It throws a `RangeError` for a bad value. */
function checked(o: PortfolioRouterOptions): { rule: PortfolioRule; cap: PortfolioCap; k: 3 | 5 | 8 } {
  const rule = o.rule ?? "collection";
  const cap = o.cap ?? 1.5;
  const k = o.k ?? 3;
  if (!PORTFOLIO_RULES.includes(rule)) throw new RangeError(`The portfolio router has the rule "${String(rule)}". It must be ${PORTFOLIO_RULES.join(" or ")}.`);
  if (!PORTFOLIO_CAPS.includes(cap)) throw new RangeError(`The portfolio router has the cap ${String(cap)}. It must be ${PORTFOLIO_CAPS.join(", ")}.`);
  if (!PORTFOLIO_KS_API.includes(k)) throw new RangeError(`The portfolio router has the k ${String(k)}. It must be ${PORTFOLIO_KS_API.join(", ")}.`);
  return { rule, cap, k };
}

/** This function gives the names of the members of the portfolio router for an input with `nodes` nodes: the base, then the first `k` names of the set of the band. */
export function portfolioMembers(nodes: number, options: PortfolioRouterOptions = {}): string[] {
  const { rule, cap, k } = checked(options);
  const set = PORTFOLIO_SETS[`${rule}|${cap}|${portfolioBand(nodes).id}`] ?? [];
  return [PORTFOLIO_BASE_MEMBER, ...set.filter((s) => s !== PORTFOLIO_BASE_MEMBER).slice(0, k)];
}

/**
 * This function gives the key of the portfolio router on the graph `graph`.
 * - `hard` counts the breaks of the hard rules of the routes (`checkProperties`), plus each edge with a stretch above the cap, as the exact model counts it.
 *   Under the rule `collection`, it also counts each shared segment that holds edges of two collections.
 * - The one level `B1` is the ink saved (higher is better), with the `minEffect` of the table `MEASURES`.
 * - The hash is `resultHash`.
 * The key builds the network of the stretch one time for the graph.
 */
export function portfolioKey(graph: Graph, options: PortfolioRouterOptions = {}): PortfolioKey<Graph, Result> {
  const { rule, cap } = checked(options);
  const stretches = exactStretches(graph);
  const info = measureByKey("B1.inkSaved");
  if (info === undefined) throw new Error("The table MEASURES has no row B1.inkSaved.");
  return {
    hard: (g, result) => {
      const breaks = checkProperties(g, result, 1_000_000).length;
      let over = 0;
      for (const v of stretches(result.routes).values()) if (v > cap + 1e-9) over++;
      return breaks + over + (rule === "collection" ? mixedSegments(g, result) : 0);
    },
    levels: [{ id: PORTFOLIO_B1, spec: compareSpec(info), value: (_g, result) => inkSaved(result.routes) }],
    hash: resultHash,
  };
}

/**
 * This function routes the graph `graph` with the portfolio of its size band, rule and cap. The base runs first, then the members of the set in their order.
 * The winner has the fewest hard breaks, then the most ink saved. A tie within the `minEffect` of B1 goes to the first member.
 * A member that throws does not win. The result carries the trace of the pick and the move count `move.pick`.
 */
export function routePortfolio(graph: Graph, options: PortfolioRouterOptions = {}): PortfolioRoute {
  const names = portfolioMembers(graph.nodes.length, options);
  const members: Member<Graph, Result>[] = names.map((name) => {
    const s = portfolioMember(name);
    if (s === undefined) throw new Error(`The portfolio router has no member "${name}".`);
    const router = asRouter(s);
    return { id: name, run: (g: Graph) => router.route(g) };
  });
  const id = `portfolio-${options.rule ?? "collection"}-${options.cap ?? 1.5}-k${options.k ?? 3}`;
  const p = portfolio(id, members, portfolioKey(graph, options), {
    ...(options.budgetMs === undefined ? {} : { budgetMs: options.budgetMs }),
    ...(options.maxMembers === undefined ? {} : { maxMembers: options.maxMembers }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const pick = p.pick(graph);
  const moves = Object.fromEntries(Object.entries(pickMoves(pick.trace)).map(([k, v]) => [`move.${k}`, v]));
  return { result: pick.output, winner: pick.winner, trace: pick.trace, moves, band: portfolioBand(graph.nodes.length).id, members: names };
}

/** This function gives a router that routes each graph with `routePortfolio` and the options `options`. Its name tells the rule, the cap and k. */
export function portfolioRouter(options: PortfolioRouterOptions = {}): Router {
  const { rule, cap, k } = checked(options);
  return { name: `portfolio-${rule}-${cap}-k${k}`, maxNodes: 10_000, route: (graph) => routePortfolio(graph, options).result };
}

/**
 * The portfolio router as a router strategy. It is not in the registry `STRATEGIES`, so the benchmark and the site do not race it by default.
 * A caller adds it to a registry of its own, or calls `routePortfolio` for the trace.
 */
export const portfolioStrategy: Strategy<"router", PortfolioRouterOptions> = defineStrategy<"router", PortfolioRouterOptions>({
  step: "router",
  name: "portfolio",
  describe: "The portfolio router (PORTFOLIO-API). It runs `shared` and the greedy set of the size band, and gives the output with the most ink saved inside the rule and the cap.",
  defaults: { rule: "collection", cap: 1.5, k: 3 },
  maxNodes: 10_000,
  run: (graph, options) => routePortfolio(graph, options).result,
});
