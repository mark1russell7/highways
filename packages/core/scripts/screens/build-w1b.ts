// The router settings of the screen of BUILD-W1B: the plug options of the router `corners` (WILD-001 and WILD-002).
// Start: `pnpm screen --step router --strategy corners --module scripts/screens/build-w1b.ts`. The baseline is the router `corners`.
import { nodeIndex, type Graph, type Node, type Result, type Route } from "../../src/model.ts";
import { sidePlugs, type SidePlugOptions } from "../../src/plugs/side.ts";
import { cornersRouter, type CornersOptions } from "../../src/routers/corners.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";
import { WayFinder } from "../../src/ways.ts";

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

/** This function makes a strategy of the router `corners` with `plugs: side` and other options of `sidePlugs`. */
function sideWith(name: string, options: SidePlugOptions): Strategy<"router", object> {
  const run = (graph: Graph): Result => {
    const byId = nodeIndex(graph);
    const ways = new WayFinder(graph.nodes);
    const routes: Route[] = [];
    for (const e of graph.edges) {
      const s = byId.get(e.source.node);
      const t = byId.get(e.target.node);
      if (!s || !t) continue;
      const [ps, pt] = sidePlugs(ways, s, e.source, t, e.target, options);
      routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
    }
    return { routes };
  };
  return defineStrategy({ step: "router", name, describe: `The router \`corners\` with \`plugs: side\` and ${JSON.stringify(options)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

/** The weight of a slant first leg: 0 and 4, against the default 1. */
export const cornersSideBend0 = sideWith("corners-side-bend0", { bend: 0 });
export const cornersSideBend4 = sideWith("corners-side-bend4", { bend: 4 });
/** More places on each side. */
export const cornersSideMost32 = sideWith("corners-side-most32", { most: 32 });
