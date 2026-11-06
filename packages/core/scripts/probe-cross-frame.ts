// The probe of CROSS-FRAME-ROUTE: an independent check of the routes of `corners` on `nested`, with no code of the router or of the measures.
// For each edge, it counts the boxes that a segment of the route goes into, except the two ends and the frames that hold an end.
// It also checks that each route starts on the box of its source and ends on the box of its target. Start: `node scripts/probe-cross-frame.ts [seeds]`.
import { highwaysRegistry } from "../src/families/index.ts";
import { ROUTERS } from "../src/routers/index.ts";
import type { Box, Point } from "../src/geom.ts";
import type { Graph } from "../src/model.ts";

const seeds = Number(process.argv[2] ?? 20);
const reg = highwaysRegistry();

/** This function tells if the segment from a to b goes into the open inside of the box. */
function into(a: Point, b: Point, box: Box): boolean {
  const e = 1e-6;
  let [t0, t1] = [0, 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - (box.x + e)],
    [dx, box.x + box.w - e - a.x],
    [-dy, a.y - (box.y + e)],
    [dy, box.y + box.h - e - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-9;
}

/** This function tells if the point is on the edge of the box, within a small tolerance. */
function onBox(p: Point, box: Box): boolean {
  const e = 1e-6;
  const inX = p.x >= box.x - e && p.x <= box.x + box.w + e;
  const inY = p.y >= box.y - e && p.y <= box.y + box.h + e;
  const edgeX = Math.abs(p.x - box.x) < e || Math.abs(p.x - box.x - box.w) < e;
  const edgeY = Math.abs(p.y - box.y) < e || Math.abs(p.y - box.y - box.h) < e;
  return inX && inY && (edgeX || edgeY);
}

const ancestors = (g: Graph, id: string): string[] => {
  const parent = new Map(g.nodes.map((n) => [n.id, n.parent] as const));
  const out: string[] = [];
  for (let p = parent.get(id); p !== undefined; p = parent.get(p)) out.push(p);
  return out;
};

for (const name of ["corners", "straight"]) {
  const router = ROUTERS.find((r) => r.name === name)!;
  let [cross, crossBad, within, withinBad, offEnd, missing] = [0, 0, 0, 0, 0, 0];
  const sample: unknown[] = [];
  for (let seed = 0; seed < seeds; seed++) {
    const { graph } = reg.generate("nested", seed, {});
    const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
    const routes = new Map(router.route(graph).routes.map((r) => [r.edge, r] as const));
    for (const e of graph.edges) {
      const r = routes.get(e.id);
      if (!r) {
        missing++;
        continue;
      }
      const as = ancestors(graph, e.source.node);
      const at = ancestors(graph, e.target.node);
      const isCross = as.at(-1) !== at.at(-1);
      const skip = new Set([e.source.node, e.target.node, ...as, ...at]);
      const hit = new Set<string>();
      for (let i = 1; i < r.points.length; i++) for (const n of graph.nodes) if (!skip.has(n.id) && into(r.points[i - 1]!, r.points[i]!, n.box)) hit.add(n.id);
      if (isCross) {
        cross++;
        if (hit.size > 0) crossBad++;
      } else {
        within++;
        if (hit.size > 0) withinBad++;
      }
      if (!onBox(r.points[0]!, byId.get(e.source.node)!.box) || !onBox(r.points.at(-1)!, byId.get(e.target.node)!.box)) offEnd++;
      if (isCross && seed === 0 && sample.length < 2) sample.push({ edge: e.id, from: e.source.node, to: e.target.node, points: r.points, hit: [...hit] });
    }
  }
  console.log(JSON.stringify({ router: name, seeds, cross, crossBad, within, withinBad, offEnd, missing }));
  console.log(JSON.stringify({ router: name, sample }));
}
