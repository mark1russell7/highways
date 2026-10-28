// The map from each registered strategy to the idea records that it builds (IDEA-QUEUE).
// The queue script and the site read this module. A new strategy that names its ideas in `describe` gets its links with no change here.
import { BUILT_IN_STRATEGIES } from "../src/strategies/builtins.ts";

/** The ideas that one registered strategy builds. */
export interface StrategyIdeas {
  readonly step: string;
  readonly strategy: string;
  readonly ideas: readonly string[];
}

/**
 * The links from a strategy to an idea that the text `describe` of the strategy does not give.
 * The key is `<step>:<strategy>`. Each link names its source in a comment.
 */
export const EXTRA_LINKS: Readonly<Record<string, readonly string[]>> = {
  // CATALOG.md: "HWY-STEP (#67) added the strategy `corridors`, which is the prototype of `HWY-031`". The TSDoc of `corridors` in `builtins.ts` names it too.
  "highway:corridors": ["HWY-031"],
};

/** The pattern of an idea id in a text. */
export const IDEA_ID = /\b(?:HWY|WILD|EDA|NAT|RULE)-\d{3}\b/g;

/** The fields of a strategy that the map reads. */
export interface NamedStrategy {
  readonly step: string;
  readonly name: string;
  readonly describe: string;
}

/** This function gives the map of each strategy, in the order of the registry: the idea ids of its `describe`, then its extra links. */
export function strategyIdeas(strategies: readonly NamedStrategy[] = BUILT_IN_STRATEGIES, extra: Readonly<Record<string, readonly string[]>> = EXTRA_LINKS): StrategyIdeas[] {
  return strategies.map((s) => ({ step: s.step, strategy: s.name, ideas: [...new Set([...(s.describe.match(IDEA_ID) ?? []), ...(extra[`${s.step}:${s.name}`] ?? [])])] }));
}

/** This function gives the strategy that builds each idea: the first strategy of the map that names it. */
export function builders(map: readonly StrategyIdeas[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of map) for (const id of m.ideas) if (!out.has(id)) out.set(id, m.strategy);
  return out;
}
