import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { ADAM_DEFAULTS, ADAM_SCHEMA } from "../adam/index.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { RULE_PRESETS, type RuleSet } from "./language.ts";
import { solveRules, type SolverOptions } from "./solver.ts";

export * from "./language.ts";
export { compileRules, type CompiledTerm, type Leg, type LegRef, type LegView, type TermContext } from "./terms.ts";
export { solveRules, type SolverOptions } from "./solver.ts";

/** The options of the router `rules` (RULE-036: a rule language that compiles to energy). */
export interface RulesOptions extends SolverOptions {
  /** The rule file. The default is `elastic`. */
  readonly preset: keyof typeof RULE_PRESETS;
  /** The method. The default is `adam`. */
  readonly descent: "adam" | "gradient";
}

/** The default options of the router `rules`. The solver has the defaults of the router `adam`. */
export const RULES_DEFAULTS: Readonly<RulesOptions> = Object.freeze({ ...ADAM_DEFAULTS, preset: "elastic", descent: "adam" });

/** The declarations of the options of the router `rules` (RULE-036). */
export const RULES_SCHEMA: OptionSchema<RulesOptions> = {
  ...ADAM_SCHEMA,
  preset: { type: "enum", values: ["elastic", "repulsion", "adam", "energy"], default: "elastic", describe: "The rule file. A caller of `rulesRouter` gives its own file as data." },
  descent: { type: "enum", values: ["adam", "gradient"], default: "adam", describe: "The method: `adam` with a sample of legs, or `gradient` over all near legs." },
};

/**
 * This function makes the router `rules` (RULE-036). It is the router `shared`, then the solver of `solveRules`.
 * The option `rules` takes a rule file as data, and it comes before the option `preset`.
 */
export function rulesRouter(options: Partial<RulesOptions> & { readonly name: string; readonly rules?: RuleSet; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...RULES_DEFAULTS, ...options };
  const set = o.rules ?? RULE_PRESETS[o.preset];
  const base = sharedRouter({ name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) });
  return {
    name: o.name,
    ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }),
    route: (graph: Graph): Result => solveRules(graph, base.route(graph), set, o),
  };
}

/**
 * The router strategy `rules` (RULE-036), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const rulesStrategy: Strategy<"router", RulesOptions> = defineStrategy({
  step: "router",
  name: "rules",
  describe: "Rules of the drawing as data (RULE-036). A rule file compiles to one energy, and the free legs of the routes of `shared` move down it.",
  defaults: { ...RULES_DEFAULTS },
  schema: RULES_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<RulesOptions>): Result => rulesRouter({ ...o, name: "rules", rule: byCollection }).route(graph),
});
