// The router settings of the screen of BUILD-W3G: the negotiated attraction (HWY-044, PathFinder turned around).
// Start: `pnpm screen --step router --strategy shared --module scripts/screens/build-w3g-router.ts`. The baseline is `shared`.
import type { Graph, Result } from "../../src/model.ts";
import { ATTRACTION_DEFAULTS, attractionRouter, attractionStrategy, type AttractionOptions } from "../../src/routers/attraction/index.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of `attraction` with the name `name` and the options `options`. */
function attraction(name: string, options: Partial<AttractionOptions>): Strategy<"router", object> {
  const o = { ...ATTRACTION_DEFAULTS, ...options };
  const run = (graph: Graph): Result => attractionRouter({ ...o, rule: byCollection, name }).route(graph);
  return defineStrategy({ step: "router", name, describe: `The router \`attraction\` with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// The default settings of HWY-044.
export const attractionDefault = attractionStrategy;

// The passes, the pull and the capacity weight, one at a time.
export const attractionP2 = attraction("attraction-p2", { passes: 2 });
export const attractionP5 = attraction("attraction-p5", { passes: 5 });
export const attractionA025 = attraction("attraction-a0.25", { attraction: 0.25 });
export const attractionA1 = attraction("attraction-a1", { attraction: 1 });
export const attractionB0 = attraction("attraction-b0", { capacityWeight: 0 });
export const attractionB4 = attraction("attraction-b4", { capacityWeight: 4 });
