import { inflectionCurve } from "../curves.ts";
import { center } from "../geom.ts";
import { nodeIndex, outerGraph, type Graph, type Result, type Route, type Router } from "../model.ts";
import { placePlug } from "../plugs.ts";

/**
 * Plugs and the inflection rule, with no obstacles. Each edge leaves its source plug at the tangent of the side.
 * It goes to the target plug on the curve of the rule. This router measures the rule alone.
 */
export const plugsRouter: Router = {
  name: "plugs",
  route(input: Graph): Result {
    const graph = outerGraph(input);
    const byId = nodeIndex(graph);
    const routes: Route[] = [];
    for (const e of graph.edges) {
      const s = byId.get(e.source.node);
      const t = byId.get(e.target.node);
      if (!s || !t) continue;
      const ps = placePlug(s, e.source, center(t.box));
      const pt = placePlug(t, e.target, center(s.box));
      routes.push({ edge: e.id, points: inflectionCurve(ps.point, ps.normal, pt.point) });
    }
    return { routes };
  },
};
