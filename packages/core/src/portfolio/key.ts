// The key of the portfolio router (PORTFOLIO-FIT): one guard for the router, the records and the greedy choice of the sets.
// A member passes the guard when it has no more breaks of each hard rule than the base, a stretch at or below the cap, and, under `collection`, no mixed segment.
// The base `shared` is the fallback output, so it passes the guard at each cap. The script `portfolio.ts` applies the same guard to the records.
import { exactStretches } from "../bench/exact/index.ts";
import { inkSaved } from "../bench/measures/bundles.ts";
import { checkProperties } from "../bench/properties.ts";
import { resultHash } from "../bench/screen/exercise.ts";
import { mixedSegments } from "../bench/screen/gap.ts";
import type { CompareSpec } from "../bench/screen/compare.ts";
import { compareSpec, measureByKey } from "../bench/screen/measures.ts";
import type { PortfolioKey } from "../bench/screen/portfolio-pick.ts";
import type { Graph, Result } from "../model.ts";
import type { PortfolioCap, PortfolioRule } from "./bands.ts";

/** The id of the B1 level of the key of the portfolio router. */
export const PORTFOLIO_B1 = "B1";

/** This function gives the spec of the B1 level: higher is better, with the `minEffect` of the row `B1.inkSaved` of the table `MEASURES`. */
export function portfolioB1Spec(): CompareSpec {
  const info = measureByKey("B1.inkSaved");
  if (info === undefined) throw new Error("The table MEASURES has no row B1.inkSaved.");
  return compareSpec(info);
}

/** The facts of one output that the guard reads. The router takes them from the output, and the script `portfolio.ts` from a record. */
export interface PortfolioFacts {
  /** The count of the breaks of each hard rule. */
  readonly hard: Readonly<Record<string, number>>;
  /** The count of the edges with a stretch above each cap, by the cap. The largest stretch of a record gives 1 or 0. */
  readonly over: (cap: number) => number;
  /** The count of the shared segments that hold edges of two collections. */
  readonly mixed: number;
}

/**
 * This function gives the count of the breaks of the guard of an output against the base, with the rule `rule` and the cap `cap`.
 * The count is the sum of three parts:
 * - for each hard rule, the breaks above the breaks of the base;
 * - the edges with a stretch above the cap;
 * - under the rule `collection`, the mixed segments.
 * An output passes the guard when the count is 0.
 */
export function guardBreaks(facts: PortfolioFacts, base: PortfolioFacts | undefined, rule: PortfolioRule, cap: number): number {
  let n = 0;
  for (const [k, v] of Object.entries(facts.hard)) n += Math.max(0, v - (base?.hard[k] ?? 0));
  n += facts.over(cap);
  if (rule === "collection") n += facts.mixed;
  return n;
}

/** This function counts the breaks of each hard rule in a list of breaks. */
function countRules(breaks: readonly { readonly rule: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of breaks) out[b.rule] = (out[b.rule] ?? 0) + 1;
  return out;
}

/**
 * This function gives the function of the facts of the outputs on the graph `graph`. It builds the network of the stretch one time for the graph.
 * The hard rules are the rules of `checkProperties`. The stretch is the stretch of the exact model, as the records of the gap screen give it.
 */
export function portfolioFacts(graph: Graph): (result: Result) => PortfolioFacts {
  // The network of the stretch is built at the first call. A portfolio of the base alone does not build it.
  let stretches: ReturnType<typeof exactStretches> | undefined;
  return (result) => {
    stretches ??= exactStretches(graph);
    const values = [...stretches(result.routes).values()];
    return {
      hard: countRules(checkProperties(graph, result, 1_000_000)),
      over: (cap) => values.filter((v) => v > cap + 1e-9).length,
      mixed: mixedSegments(graph, result),
    };
  };
}

/**
 * This function gives the key of the portfolio router on the graph `graph`, with the rule `rule` and the cap `cap`.
 * - `hard` is `guardBreaks` against the output of the base. `base` gives that output after the base runs. The output of the base has 0 breaks.
 *   Before the base runs, or when the base throws, a member has its own breaks of the hard rules.
 * - The one level `B1` is the ink saved (higher is better), with the `minEffect` of the table `MEASURES`.
 * - The hash is `resultHash`.
 * The winner is the first member with the most B1 of the members with 0 breaks (`selectBest`). The base has 0 breaks, so a member that fails the guard does not win.
 */
export function portfolioKey(graph: Graph, rule: PortfolioRule, cap: PortfolioCap, base: () => Result | undefined = () => undefined): PortfolioKey<Graph, Result> {
  const facts = portfolioFacts(graph);
  const spec = portfolioB1Spec();
  let baseFacts: { readonly of: Result; readonly facts: PortfolioFacts } | undefined;
  return {
    hard: (_g, result) => {
      const b = base();
      if (b !== undefined && result === b) return 0;
      if (b !== undefined && baseFacts?.of !== b) baseFacts = { of: b, facts: facts(b) };
      return guardBreaks(facts(result), b === undefined ? undefined : baseFacts!.facts, rule, cap);
    },
    levels: [{ id: PORTFOLIO_B1, spec, value: (_g, result) => inkSaved(result.routes) }],
    hash: resultHash,
  };
}
