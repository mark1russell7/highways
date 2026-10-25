import { center, type Box, type Point } from "../geom.ts";
import { fixedPortPoint, nodeIndex, type Graph, type Result, type Route, type Router } from "../model.ts";

/** This function gives the point where the ray from the center of the box to `toward` leaves the box. */
export function boxExit(box: Box, toward: Point): Point {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const tx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * The control of the benchmark: each edge is one straight line between its plugs.
 * A free plug goes where the line between the two centers leaves the box.
 */
export const straightRouter: Router = {
  name: "straight",
  route(graph: Graph): Result {
    const byId = nodeIndex(graph);
    const routes: Route[] = [];
    for (const e of graph.edges) {
      const s = byId.get(e.source.node);
      const t = byId.get(e.target.node);
      if (!s || !t) continue;
      const fs = fixedPortPoint(s, e.source);
      const ft = fixedPortPoint(t, e.target);
      const a = fs ?? boxExit(s.box, ft ?? center(t.box));
      const b = ft ?? boxExit(t.box, fs ?? center(s.box));
      routes.push({ edge: e.id, points: [a, b] });
    }
    return { routes };
  },
};
