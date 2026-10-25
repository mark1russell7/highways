import { center } from "../geom.ts";
import { nodeIndex, type Graph, type Node, type Result, type Route, type Router } from "../model.ts";
import { placePlug } from "../plugs.ts";
import { WayFinder, type WayOptions } from "../ways.ts";

/** The options of the corner router. */
export interface CornersOptions extends WayOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
}

/**
 * This function makes a router that goes around the nodes.
 * Each edge leaves its plug along the normal of the side. It goes a shortest way (A*) through a sparse visibility graph
 * of the box corners, without the needless corners. It enters the target plug along its normal.
 */
export function cornersRouter(options: CornersOptions): Router {
  const router: Router = {
    name: options.name,
    route(graph: Graph): Result {
      const byId = nodeIndex(graph);
      const ways = new WayFinder(graph.nodes, options);
      const routes: Route[] = [];
      for (const e of graph.edges) {
        const s = byId.get(e.source.node);
        const t = byId.get(e.target.node);
        if (!s || !t) continue;
        const ps = placePlug(s, e.source, center(t.box));
        const pt = placePlug(t, e.target, center(s.box));
        routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
      }
      return { routes };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}
