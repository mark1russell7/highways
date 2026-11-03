// The router settings of the screen of BUILD-W6: the angle-priced crossings of WILD-025.
// Start: `pnpm screen --step router --strategy shared --module scripts/screens/build-w6-router.ts`. The baseline is `shared`.
import type { Graph, Result } from "../../src/model.ts";
import { ANGLE_CROSS_DEFAULTS, angleCrossRouter, angleCrossStrategy, type AngleCrossOptions } from "../../src/routers/angle-cross/index.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of `angle-cross` with the name `name` and the options `options`. */
function angleCross(name: string, options: Partial<AngleCrossOptions>): Strategy<"router", object> {
  const o = { ...ANGLE_CROSS_DEFAULTS, ...options };
  const run = (graph: Graph): Result => angleCrossRouter({ ...o, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`angle-cross\` with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// The default settings of WILD-025.
export const angleCrossDefault = angleCrossStrategy;

// WILD-025: a high price of a shallow crossing, a fourth power, and three rounds.
export const angleCrossA100 = angleCross("angle-cross-a100", { alpha: 100 });
export const angleCrossP4 = angleCross("angle-cross-p4", { p: 4 });
export const angleCrossR3 = angleCross("angle-cross-r3", { rounds: 3 });
