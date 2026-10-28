// The map from each registered strategy to the idea records that it builds (IDEA-QUEUE).
// The queue script and the site read this module. The site shows the links on the strategy cards. A new strategy that names its ideas in `describe` gets its links with no change here.
import { BUILT_IN_STRATEGIES } from "../src/strategies/builtins.ts";

/** The ideas that one registered strategy builds. */
export interface StrategyIdeas {
  readonly step: string;
  readonly strategy: string;
  readonly ideas: readonly string[];
  /** The ideas that each option of the strategy builds, by the key of the option. An option with no idea is not in it. */
  readonly options?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The links from a strategy to an idea that the text `describe` of the strategy does not give.
 * The key is `<step>:<strategy>`. Each link names its source in a comment.
 */
export const EXTRA_LINKS: Readonly<Record<string, readonly string[]>> = {
  // CATALOG.md: "HWY-STEP (#67) added the strategy `corridors`, which is the prototype of `HWY-031`". The TSDoc of `corridors` in `builtins.ts` names it too.
  "highway:corridors": ["HWY-031"],
};

/**
 * The links from an option to an idea that the text `describe` of the option does not give.
 * The key is `<step>:<strategy>`, then the key of the option. Each link names its source in a comment.
 */
export const OPTION_LINKS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  // CATALOG.md: "`WILD-022` (shortest first) is not the same idea as `NAT-024` (longest first)". The value `shortest` of the option `order` builds `WILD-022`.
  "router:shared": { order: ["WILD-022"] },
  "router:shared-all": { order: ["WILD-022"] },
  "highway:shared-ways": { order: ["WILD-022"] },
};

/** The pattern of an idea id in a text. */
export const IDEA_ID = /\b(?:HWY|WILD|EDA|NAT|RULE)-\d{3}\b/g;

/** The fields of a strategy that the map reads. */
export interface NamedStrategy {
  readonly step: string;
  readonly name: string;
  readonly describe: string;
  /** The declarations of the options, by the key of the option. The map reads only the text `describe` of each declaration. */
  readonly schema?: object;
}

/** This function gives the idea ids of a text, each one time, in the order of the text. */
function cited(text: string): string[] {
  return [...new Set(text.match(IDEA_ID) ?? [])];
}

/**
 * This function gives the extra links of a strategy.
 * A strategy `<plan>+<gate>` applies the plan first, then the gate, so it gets the extra links of the plan too.
 */
function extraOf(step: string, name: string, extra: Readonly<Record<string, readonly string[]>>): readonly string[] {
  const plan = name.includes("+") ? name.slice(0, name.indexOf("+")) : undefined;
  return [...(plan === undefined ? [] : (extra[`${step}:${plan}`] ?? [])), ...(extra[`${step}:${name}`] ?? [])];
}

/**
 * This function gives the map of each strategy, in the order of the registry: the idea ids of its `describe`, then its extra links.
 * It also gives the idea ids of the `describe` of each option, then the option links.
 */
export function strategyIdeas(
  strategies: readonly NamedStrategy[] = BUILT_IN_STRATEGIES,
  extra: Readonly<Record<string, readonly string[]>> = EXTRA_LINKS,
  optionLinks: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = OPTION_LINKS,
): StrategyIdeas[] {
  return strategies.map((s) => {
    const links = optionLinks[`${s.step}:${s.name}`] ?? {};
    const options: Record<string, readonly string[]> = {};
    for (const [key, d] of Object.entries(s.schema ?? {}) as [string, { readonly describe?: unknown }][]) {
      const ids = [...new Set([...cited(typeof d.describe === "string" ? d.describe : ""), ...(links[key] ?? [])])];
      if (ids.length > 0) options[key] = ids;
    }
    return { step: s.step, strategy: s.name, ideas: [...new Set([...cited(s.describe), ...extraOf(s.step, s.name, extra)])], options };
  });
}

/**
 * This function gives the strategy that builds each idea: the first strategy of the map that names it.
 * The ideas of the strategies come first, then the ideas of their options.
 */
export function builders(map: readonly StrategyIdeas[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of map) for (const id of m.ideas) if (!out.has(id)) out.set(id, m.strategy);
  for (const m of map) for (const id of Object.values(m.options ?? {}).flat()) if (!out.has(id)) out.set(id, m.strategy);
  return out;
}
