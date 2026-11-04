import { center, inflate, type Point } from "../../geom.ts";
import { nodeIndex, resolvePorts, splitFrames, type Graph, type Node, type Result, type Route, type Router } from "../../model.ts";
import { placePlug } from "../../plugs.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import { joinNote } from "../../through.ts";
import { CornerGraph, Obstacles } from "../../visibility.ts";
import { WayFinder } from "../../ways.ts";

/** The options of the router `seams` (PASS-SEAMS). */
export interface SeamOptions {
  /** The distance from a box to the corners of the plain way finder. The default is 5. */
  readonly margin: number;
  /** The number of visible neighbours of each corner. The four boxes at a meeting of two seams give four copies of one corner, so the default is 12. */
  readonly k: number;
}

/** The default options of the router `seams`. */
export const SEAM_DEFAULTS: Readonly<SeamOptions> = Object.freeze({ margin: 5, k: 12 });

/** The schema of the options of the router `seams`. */
const SEAM_SCHEMA: Strategy<"router", SeamOptions>["schema"] = {
  margin: { type: "number", min: 1, max: 20, step: 1, marks: [1, 5, 20], default: 5, describe: "The distance from a box to the corners of the plain way finder." },
  k: { type: "integer", min: 4, max: 24, step: 1, default: 12, describe: "The number of visible neighbours of each corner of the seam graph." },
};

/** The inset of each box of the seam graph. The corners of the graph are at this distance from the small box, so they are on the real box. */
const SEAM_INSET = 1;

/**
 * This function makes the corner graph of the seams (PASS-SEAMS). The graph takes each box smaller by 1 and has the margin 1.
 * Thus its corners are on the corners of the real boxes, and two boxes that touch have a free line between them.
 * The obstacle test keeps a way at most 0.5 inside a real box.
 */
export function seamGraph(nodes: readonly Node[], k: number): CornerGraph {
  const small = nodes.map((n) => ({ ...n, box: inflate(n.box, -Math.min(SEAM_INSET, Math.min(n.box.w, n.box.h) / 4)) }));
  return new CornerGraph(small, new Obstacles(small, 180), { margin: SEAM_INSET, k, cones: true });
}

/**
 * This function makes the router `seams` (PASS-SEAMS). It is for boards with boxes that touch, where the plain corner graph has no way.
 * Each edge first takes the way of the plain way finder. An edge with no such way goes from plug to plug along the sides of the boxes.
 * Only an edge with no way in both graphs gets the straight line.
 */
export function seamsRouter(options: Partial<SeamOptions> & { readonly name: string; readonly maxNodes?: number }): Router {
  const router: Router = {
    name: options.name,
    route(input: Graph): Result {
      const { graph } = splitFrames(resolvePorts(input));
      const byId = nodeIndex(graph);
      const ways = new WayFinder(graph.nodes, { margin: options.margin ?? SEAM_DEFAULTS.margin });
      const seams = seamGraph(graph.nodes, options.k ?? SEAM_DEFAULTS.k);
      const seamWay = (a: Point, b: Point): Point[] => {
        const way = seams.path(a, b);
        return way ? seams.pull(way) : [a, b];
      };
      const routes: Route[] = [];
      for (const e of graph.edges) {
        const s = byId.get(e.source.node);
        const t = byId.get(e.target.node);
        if (!s || !t) continue;
        const ps = placePlug(s, e.source, center(t.box));
        const pt = placePlug(t, e.target, center(s.box));
        const way = ways.corners.path(ways.out(ps), ways.out(pt));
        routes.push({ edge: e.id, points: way ? [ps.point, ...ways.corners.pull(way), pt.point] : seamWay(ps.point, pt.point) });
      }
      return { routes, ...joinNote(ways) };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}

/**
 * The router strategy `seams` (PASS-SEAMS). It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const seamsStrategy: Strategy<"router", SeamOptions> = defineStrategy({
  step: "router",
  name: "seams",
  describe: "Ways along the sides of boxes that touch (PASS-SEAMS). An edge with no way in the plain corner graph goes along the seams.",
  defaults: { ...SEAM_DEFAULTS },
  schema: SEAM_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<SeamOptions>): Result => seamsRouter({ ...o, name: "seams" }).route(graph),
});
