import { inflectionCurve, roundCorners } from "../curves.ts";
import { center, type Point } from "../geom.ts";
import { nodeIndex, type Graph, type Node, type Result, type Route, type Router } from "../model.ts";
import { placePlug } from "../plugs.ts";
import { CornerGraph, Obstacles } from "../visibility.ts";

/** The options of the corner router. */
export interface CornersOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /** The distance from a box to the corners of the graph. The default is 5. */
  readonly margin?: number;
  /** The number of visible neighbours of each corner. The default is 8. */
  readonly k?: number;
  /** With `smooth`, a route in clear view uses the inflection rule, and the other routes get round corners. */
  readonly smooth?: boolean;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
}

/**
 * This function makes a router that goes around the nodes.
 * Each edge leaves its plug along the normal of the side. It goes a shortest way (A*) through a sparse visibility graph
 * of the box corners, without the needless corners. It enters the target plug along its normal.
 */
export function cornersRouter(options: CornersOptions): Router {
  const margin = options.margin ?? 5;
  const k = options.k ?? 8;
  const router: Router = {
    name: options.name,
    route(graph: Graph): Result {
      const byId = nodeIndex(graph);
      const obstacles = new Obstacles(graph.nodes, 180);
      const corners = new CornerGraph(graph.nodes, obstacles, { margin, k });
      const routes: Route[] = [];
      const out = (p: Point, n: Point): Point => ({ x: p.x + n.x * margin, y: p.y + n.y * margin });
      for (const e of graph.edges) {
        const s = byId.get(e.source.node);
        const t = byId.get(e.target.node);
        if (!s || !t) continue;
        const ps = placePlug(s, e.source, center(t.box));
        const pt = placePlug(t, e.target, center(s.box));
        const ends = new Set<Node>([s, t]);
        if (options.smooth) {
          const curve = inflectionCurve(ps.point, ps.normal, pt.point);
          if (obstacles.clearPath(curve, margin / 2, ends)) {
            routes.push({ edge: e.id, points: curve });
            continue;
          }
        }
        const os = out(ps.point, ps.normal);
        const ot = out(pt.point, pt.normal);
        const way = corners.path(os, ot);
        const poly = way ? [ps.point, ...corners.pull(way), pt.point] : [ps.point, pt.point];
        if (options.smooth && way) {
          const round = roundCorners(poly, margin);
          if (obstacles.clearPath(round, 0, ends)) {
            routes.push({ edge: e.id, points: round });
            continue;
          }
        }
        routes.push({ edge: e.id, points: poly });
      }
      return { routes };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}
