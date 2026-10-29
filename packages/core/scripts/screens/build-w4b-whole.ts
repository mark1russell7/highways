// The whole settings of the screen of BUILD-W4B: the curriculum of rules (RULE-048).
// Start: `pnpm screen --step whole --strategy curriculum --module scripts/screens/build-w4b-whole.ts`. The baseline is `pipeline`.
import type { Graph } from "../../src/model.ts";
import { CURRICULUM_POOL } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy, type WholeOutput } from "../../src/strategies/model.ts";
import { CURRICULUM_DEFAULTS, curriculum, type CurriculumOptions } from "../../src/whole/curriculum/index.ts";

/** This function makes a whole strategy of `curriculum` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<CurriculumOptions>): Strategy<"whole", object> {
  const o = { ...CURRICULUM_DEFAULTS, ...options };
  const run = (graph: Graph): WholeOutput => curriculum(graph, CURRICULUM_POOL, o);
  return defineStrategy({ step: "whole", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

// RULE-048: the lane separation first, two passes in each stage, and a pool of two settings.
export const curriculumR12 = variant("curriculum-r12", { order: "R12-R1-R2" });
export const curriculumP2 = variant("curriculum-p2", { passes: 2 });
export const curriculumS2 = variant("curriculum-s2", { settings: 2 });
