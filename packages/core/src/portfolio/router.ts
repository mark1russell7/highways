// The portfolio router (PORTFOLIO-API, PORTFOLIO-FIT): it runs the base `shared` and a small greedy set of members on an input, and gives the output with the most
// ink saved inside the rule and the stretch cap of the caller. The combinator is `portfolio` of `@mark1russell7/layout-contract`.
// The router is opt-in: it is not in the registry `STRATEGIES`, so no default output changes.
import { pickMoves, portfolio, type Member, type PortfolioTrace } from "../bench/screen/portfolio-pick.ts";
import type { Graph, Result, Router } from "../model.ts";
import { asRouter, defineStrategy, type Strategy } from "../strategies/model.ts";
import type { OptionSchema } from "../strategies/options.ts";
import { PORTFOLIO_CAPS, PORTFOLIO_KS_API, PORTFOLIO_RULES, portfolioBand, type PortfolioCap, type PortfolioRule } from "./bands.ts";
import { PORTFOLIO_FIT } from "./fit.ts";
import { portfolioKey } from "./key.ts";
import { portfolioMember } from "./members.ts";
import { PORTFOLIO_SETS } from "./sets.ts";

/** The options of the portfolio router. */
export interface PortfolioRouterOptions {
  /** The rule of the caller. Under `collection` (the default), a shared segment must hold edges of one collection only. Under `all`, collections can mix. */
  readonly rule?: PortfolioRule;
  /** The stretch cap of the caller: 1.1, 1.25 or 1.5 (the default). An output with an edge above the cap does not win. The base is the fallback output. */
  readonly cap?: PortfolioCap;
  /**
   * The count of members after the base: 3, 5 or 8. Without `k` (the default), the router runs the fit of `fit.ts`.
   * The fit gives a member count for each rule, cap and band, and a node limit for each member. Thus the default is deterministic.
   */
  readonly k?: 3 | 5 | 8;
  /**
   * A time limit of the pick in milliseconds, as a ceiling that the caller sets. The base always runs. The combinator cuts the members that start after the limit.
   * A cut by the budget makes the output depend on the speed of the machine. Then the trace has `deterministic: false`.
   */
  readonly budgetMs?: number;
  /** The largest count of members that run, with the base. */
  readonly maxMembers?: number;
  /** The clock in milliseconds. The default is `performance.now`. */
  readonly now?: () => number;
  /**
   * The members that get an output hash in the trace (HASH-LAZY). The pick does not use the hashes, so the winner and the output do not change.
   * - With `pick` (the default), only the base and the winner get a hash, and only when the winner is not the base.
   * - With `all`, each member that ran gets a hash, as before HASH-LAZY. Use it when you need the `outputHash` of each member.
   */
  readonly hashes?: PortfolioHashes;
}

/** The values of the option `hashes` of the portfolio router. */
export type PortfolioHashes = "all" | "pick";

/** The values of the option `hashes`, in order. The default is `pick`. */
export const PORTFOLIO_HASHES: readonly PortfolioHashes[] = ["pick", "all"];

/** The base member of each portfolio: the router `shared` with the rule `byCollection`. It is the fallback output above the cap. */
export const PORTFOLIO_BASE_MEMBER = "shared";

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
function checked(o: PortfolioRouterOptions): { rule: PortfolioRule; cap: PortfolioCap; k: 3 | 5 | 8 | undefined; hashes: PortfolioHashes } {
  const rule = o.rule ?? "collection";
  const cap = o.cap ?? 1.5;
  const k = o.k;
  const hashes = o.hashes ?? "pick";
  if (!PORTFOLIO_RULES.includes(rule)) throw new RangeError(`The portfolio router has the rule "${String(rule)}". It must be ${PORTFOLIO_RULES.join(" or ")}.`);
  if (!PORTFOLIO_CAPS.includes(cap)) throw new RangeError(`The portfolio router has the cap ${String(cap)}. It must be ${PORTFOLIO_CAPS.join(", ")}.`);
  if (k !== undefined && !PORTFOLIO_KS_API.includes(k)) throw new RangeError(`The portfolio router has the k ${String(k)}. It must be ${PORTFOLIO_KS_API.join(", ")}.`);
  if (!PORTFOLIO_HASHES.includes(hashes)) throw new RangeError(`The portfolio router has the hashes "${String(hashes)}". It must be ${PORTFOLIO_HASHES.join(" or ")}.`);
  return { rule, cap, k, hashes };
}

/** This function gives the name of the portfolio router with the options `options`: `portfolio-<rule>-<cap>-k<k>`, or `portfolio-<rule>-<cap>-fit` without `k`. */
export function portfolioName(options: PortfolioRouterOptions = {}): string {
  const { rule, cap, k } = checked(options);
  return `portfolio-${rule}-${cap}-${k === undefined ? "fit" : `k${k}`}`;
}

/**
 * This function gives the names of the members for an input with `nodes` nodes. The base comes first.
 * - With `k`, the first `k` names of the set of the band follow.
 * - Without `k`, the members of the fit of the band follow, each only when `nodes` is at or below its node limit.
 */
export function portfolioMembers(nodes: number, options: PortfolioRouterOptions = {}): string[] {
  const { rule, cap, k } = checked(options);
  const key: `${PortfolioRule}|${PortfolioCap}|${string}` = `${rule}|${cap}|${portfolioBand(nodes).id}`;
  if (k === undefined) return [PORTFOLIO_BASE_MEMBER, ...(PORTFOLIO_FIT[key] ?? []).filter(([s, limit]) => s !== PORTFOLIO_BASE_MEMBER && nodes <= limit).map(([s]) => s)];
  const set = PORTFOLIO_SETS[key] ?? [];
  return [PORTFOLIO_BASE_MEMBER, ...set.filter((s) => s !== PORTFOLIO_BASE_MEMBER).slice(0, k)];
}

/**
 * This function routes the graph `graph` with the portfolio of its size band, rule and cap. The base runs first, then the members in their order.
 * The key is `portfolioKey`: a member wins only when it passes the guard against the base. Of those members, the winner has the most ink saved.
 * A tie within the `minEffect` of B1 goes to the first member (`selectBest`). A member that throws does not win.
 * The result carries the trace of the pick and the move count `move.pick`.
 * With the option `hashes` "pick" (the default), only the base and the winner get an `outputHash` in the trace. They get it only when the winner is not the base.
 */
export function routePortfolio(graph: Graph, options: PortfolioRouterOptions = {}): PortfolioRoute {
  // A member with a node limit below the size of the graph does not run. The base `shared` has no such limit below the limit of the router.
  const names = portfolioMembers(graph.nodes.length, options).filter((name) => name === PORTFOLIO_BASE_MEMBER || (portfolioMember(name)?.maxNodes ?? Infinity) >= graph.nodes.length);
  const { rule, cap, hashes } = checked(options);
  // The key compares each member with the output of the base, so the run of the base keeps its output.
  let base: Result | undefined;
  const members: Member<Graph, Result>[] = names.map((name) => {
    const s = portfolioMember(name);
    if (s === undefined) throw new Error(`The portfolio router has no member "${name}".`);
    const router = asRouter(s);
    if (name !== PORTFOLIO_BASE_MEMBER) return { id: name, run: (g: Graph) => router.route(g) };
    return {
      id: name,
      run: (g: Graph) => {
        base = router.route(g);
        return base;
      },
    };
  });
  const p = portfolio(portfolioName(options), members, portfolioKey(graph, rule, cap, () => base), {
    hashes,
    ...(options.budgetMs === undefined ? {} : { budgetMs: options.budgetMs }),
    ...(options.maxMembers === undefined ? {} : { maxMembers: options.maxMembers }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const pick = p.pick(graph);
  const moves = Object.fromEntries(Object.entries(pickMoves(pick.trace)).map(([k, v]) => [`move.${k}`, v]));
  return { result: pick.output, winner: pick.winner, trace: pick.trace, moves, band: portfolioBand(graph.nodes.length).id, members: names };
}

/** This function gives a router that routes each graph with `routePortfolio` and the options `options`. Its name is `portfolioName(options)`. */
export function portfolioRouter(options: PortfolioRouterOptions = {}): Router {
  checked(options);
  return { name: portfolioName(options), maxNodes: 10_000, route: (graph) => routePortfolio(graph, options).result };
}

/** The largest count of members after the base: the largest list of the fit and of the sets. */
const MAX_AFTER_BASE = Math.max(...PORTFOLIO_KS_API, ...Object.values(PORTFOLIO_FIT).map((l) => l.length), ...Object.values(PORTFOLIO_SETS).map((l) => l.length));

/**
 * The declarations of the options of the portfolio router (SCHEMA-GAPS). The lists of values come from the constants, so a new rule or cap needs no change here.
 * The option `now` has no declaration. It is a clock for the tests, not a choice of the layout, and no control or sweep can set a function.
 */
const PORTFOLIO_SCHEMA: OptionSchema<Omit<PortfolioRouterOptions, "now">> = {
  rule: { type: "enum", values: PORTFOLIO_RULES, default: "collection", describe: "With `collection`, a shared segment holds edges of one collection only. With `all`, collections can mix." },
  cap: {
    type: "number",
    min: Math.min(...PORTFOLIO_CAPS),
    max: Math.max(...PORTFOLIO_CAPS),
    values: PORTFOLIO_CAPS,
    default: 1.5,
    describe: "The stretch cap. An output with an edge above the cap does not win.",
  },
  k: {
    type: "integer",
    min: Math.min(...PORTFOLIO_KS_API),
    max: Math.max(...PORTFOLIO_KS_API),
    values: PORTFOLIO_KS_API,
    describe: "The count of members after the base. Without it, the router uses the fit of the size band.",
  },
  budgetMs: {
    type: "integer",
    min: 0,
    max: 10_000,
    step: 10,
    describe: "The time limit of the pick in milliseconds. Without it, there is no limit. A cut by the limit makes the output depend on the machine.",
  },
  maxMembers: {
    type: "integer",
    min: 1,
    max: 1 + MAX_AFTER_BASE,
    step: 1,
    describe: "The largest count of members that run, with the base. Without it, each member of the pick runs.",
  },
  hashes: { type: "enum", values: PORTFOLIO_HASHES, default: "pick", describe: "With `pick`, only the base and the winner get an output hash in the trace. With `all`, each member gets one." },
};

/**
 * The portfolio router as a router strategy. It is not in the registry `STRATEGIES`, so the benchmark and the site do not race it by default.
 * A caller adds it to a registry of its own, or calls `routePortfolio` for the trace.
 */
export const portfolioStrategy: Strategy<"router", PortfolioRouterOptions> = defineStrategy<"router", PortfolioRouterOptions>({
  step: "router",
  name: "portfolio",
  describe: "The portfolio router (PORTFOLIO-API). It runs `shared` and the fit of the size band, and gives the output with the most ink saved inside the rule and the cap.",
  defaults: { rule: "collection", cap: 1.5 },
  // The schema leaves out the clock `now`, so its type is the options without `now`.
  schema: PORTFOLIO_SCHEMA as OptionSchema<PortfolioRouterOptions>,
  maxNodes: 10_000,
  run: (graph, options) => routePortfolio(graph, options).result,
});
