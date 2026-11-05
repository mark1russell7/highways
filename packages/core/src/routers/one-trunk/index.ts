import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import { center, type Point } from "../../geom.ts";
import { fixedPortPoint, nodeIndex, outerGraph, type End, type Graph, type Node, type Result, type Route, type Router } from "../../model.ts";

/** The size limit of this router: its routes hold one vertex for each plug on the trunk. */
const MAX_NODES = 2_000;

/**
 * This function gives the plug of an end on the trunk at the height `y`.
 * A free plug is the middle of the side of the box that faces the trunk. A trunk through the box takes the lower side.
 */
function plugOf(node: Node, end: End, y: number): Point {
  const fixed = fixedPortPoint(node, end);
  if (fixed) return fixed;
  return { x: center(node.box).x, y: y < center(node.box).y ? node.box.y : node.box.y + node.box.h };
}

/**
 * The adversary of the benchmark: all routes go on one horizontal trunk through the middle of the board.
 * Each end goes straight to the trunk. The trunk has a vertex at each of those places, so two routes share each stretch that they have in common.
 * This router lowers a count that reads each shared segment one time, and it pays with length and with routes through boxes.
 * A measure that it wins cannot call a win alone. The router does not mark `through`, and it gives no shared run, as `straight`.
 */
export const oneTrunkRouter: Router = {
  name: "one-trunk",
  maxNodes: MAX_NODES,
  route(input: Graph): Result {
    const graph = outerGraph(input);
    if (graph.nodes.length === 0) return { routes: [] };
    const top = Math.min(...graph.nodes.map((n) => n.box.y));
    const bottom = Math.max(...graph.nodes.map((n) => n.box.y + n.box.h));
    const y = (top + bottom) / 2;
    const byId = nodeIndex(graph);
    const ends = graph.edges.flatMap((e) => {
      const s = byId.get(e.source.node);
      const t = byId.get(e.target.node);
      return s && t ? [{ edge: e.id, a: plugOf(s, e.source, y), b: plugOf(t, e.target, y) }] : [];
    });
    const stops = [...new Set(ends.flatMap((e) => [e.a.x, e.b.x]))].sort((p, q) => p - q);
    const stopOf = new Map(stops.map((x, i) => [x, i]));
    const routes: Route[] = ends.map(({ edge, a, b }) => {
      const from = stopOf.get(a.x)!;
      const to = stopOf.get(b.x)!;
      const step = to >= from ? 1 : -1;
      const points: Point[] = a.y === y ? [] : [a];
      for (let i = from; i !== to + step; i += step) points.push({ x: stops[i]!, y });
      if (b.y !== y) points.push(b);
      return { edge, points: points.length > 1 ? points : [a, b] };
    });
    return { routes };
  },
};

/** The strategy of the control `one-trunk`. It is a baseline, so no chooser offers it and no default uses it. */
export const oneTrunkStrategy: Strategy<"router", object> = defineStrategy({
  step: "router",
  name: oneTrunkRouter.name,
  describe: "The adversary control. All routes go on one horizontal trunk through the middle of the board.",
  defaults: {},
  schema: {},
  maxNodes: MAX_NODES,
  run: (graph: Graph): Result => oneTrunkRouter.route(graph),
});
