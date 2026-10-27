// The router settings of the screen of BUILD-W1B: the plug options of the router `corners` (WILD-001 and WILD-002).
// Start: `pnpm screen --step router --strategy corners --module scripts/screens/build-w1b.ts`. The baseline is the router `corners`.
import type { Graph, Result } from "../../src/model.ts";
import { cornersRouter, type CornersOptions } from "../../src/routers/corners.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a router strategy of the router `corners` with the options `options`. */
function corners(name: string, describe: string, options: Omit<CornersOptions, "name">): Strategy<"router", object> {
  return defineStrategy({ step: "router", name, describe, defaults: {}, schema: {}, maxNodes: 10_000, run: (graph: Graph): Result => cornersRouter({ ...options, name }).route(graph) });
}

/** WILD-001: the search starts from the whole free side. */
export const cornersSide = corners("corners-side", "The router `corners` with `plugs: side`.", { plugs: "side" });
/** WILD-002 at the gap of its record (6). */
export const cornersGap6 = corners("corners-gap6", "The router `corners` with `plugGap: 6`.", { plugGap: 6 });
/** NAT-031 at the gap of its record (8). */
export const cornersGap8 = corners("corners-gap8", "The router `corners` with `plugGap: 8`.", { plugGap: 8 });
/** WILD-001 and WILD-002 together. */
export const cornersSideGap6 = corners("corners-side-gap6", "The router `corners` with `plugs: side` and `plugGap: 6`.", { plugs: "side", plugGap: 6 });
