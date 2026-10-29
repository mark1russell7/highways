// The router settings of the screen of BUILD-W4A: the simulated annealing over candidate routes (RULE-021, with WILD-028) and the tight edges first (WILD-023).
// Start: `pnpm screen --step router --strategy shared --module scripts/screens/build-w4a-router.ts`. The baseline is `shared`.
import type { Graph, Result } from "../../src/model.ts";
import { ANNEALING_DEFAULTS, annealingRouter, annealingStrategy, type AnnealingOptions } from "../../src/routers/annealing/index.ts";
import { TIGHT_DEFAULTS, tightRouter, tightStrategy, type TightOptions } from "../../src/routers/tight/index.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of `annealing` with the name `name` and the options `options`. */
function annealing(name: string, options: Partial<AnnealingOptions>): Strategy<"router", object> {
  const o = { ...ANNEALING_DEFAULTS, ...options };
  const run = (graph: Graph): Result => annealingRouter({ ...o, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`annealing\` with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

/** This function makes a router strategy of `tight` with the name `name` and the options `options`. */
function tight(name: string, options: Partial<TightOptions>): Strategy<"router", object> {
  const o = { ...TIGHT_DEFAULTS, ...options };
  const run = (graph: Graph): Result => tightRouter({ ...o, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`tight\` with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// The default settings of RULE-021 and WILD-023.
export const annealingDefault = annealingStrategy;
export const tightDefault = tightStrategy;

// RULE-021: another seed, no crossing cost (the ink alone), and a budget of 200 changes for each edge.
export const annealingS2 = annealing("annealing-s2", { seed: 2 });
export const annealingX0 = annealing("annealing-x0", { crossing: 0 });
export const annealingB200 = annealing("annealing-b200", { budget: 200 });

// WILD-023: the order of the record (the rising slack), and a larger penalty.
export const tightLoose = tight("tight-loose", { first: "loose" });
export const tightP6 = tight("tight-p6", { penalty: 6 });
