// The probe of the bends of CROSS-FRAME-ROUTE: the bends of each route of `corners` on `nested`, by the kind of the edge.
// For each route, it gives the stops (`points.length - 2`, the count of the record), the real turns (`bendCount`), the stops on a straight line, and the turns back.
// Start: `node scripts/probe-cross-bends.ts [seeds]`. Each line of the output is one JSON row.
import { highwaysRegistry } from "../src/families/index.ts";
import { bendCount, type Point } from "../src/geom.ts";
import { ROUTERS } from "../src/routers/index.ts";
import type { Graph } from "../src/model.ts";

const seeds = Number(process.argv[2] ?? 20);
const reg = highwaysRegistry();
const router = ROUTERS.find((r) => r.name === "corners")!;

/** This function gives the top node that holds a node. A node at the top level is its own top node. */
function topOf(g: Graph, id: string): string {
  const parent = new Map(g.nodes.map((n) => [n.id, n.parent] as const));
  let at = id;
  for (let p = parent.get(at); p !== undefined; p = parent.get(at)) at = p;
  return at;
}

/** This function counts the inner stops with a cross product of 0: a stop on a straight line (dot over 0) or a turn back (dot under 0). */
function straights(points: readonly Point[]): { readonly line: number; readonly back: number } {
  let [line, back] = [0, 0];
  for (let i = 1; i + 1 < points.length; i++) {
    const [a, b, c] = [points[i - 1]!, points[i]!, points[i + 1]!];
    const [ux, uy, vx, vy] = [b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y];
    if (Math.abs(ux * vy - uy * vx) > 1e-9 * Math.hypot(ux, uy) * Math.hypot(vx, vy)) continue;
    if (ux * vx + uy * vy >= 0) line++;
    else back++;
  }
  return { line, back };
}

const sums = new Map<string, { routes: number; stops: number; turns: number; line: number; back: number; most: number }>();
for (let seed = 0; seed < seeds; seed++) {
  const { graph } = reg.generate("nested", seed, {});
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const edges = new Map(graph.edges.map((e) => [e.id, e] as const));
  for (const r of router.route(graph).routes) {
    const e = edges.get(r.edge)!;
    const s = byId.get(e.source.node)!;
    const t = byId.get(e.target.node)!;
    const kind = r.frame !== undefined ? "inner" : topOf(graph, s.id) !== topOf(graph, t.id) && (s.parent !== undefined || t.parent !== undefined) ? "between" : "outer";
    const sum = sums.get(kind) ?? { routes: 0, stops: 0, turns: 0, line: 0, back: 0, most: 0 };
    const { line, back } = straights(r.points);
    const turns = bendCount(r.points);
    sums.set(kind, { routes: sum.routes + 1, stops: sum.stops + Math.max(0, r.points.length - 2), turns: sum.turns + turns, line: sum.line + line, back: sum.back + back, most: Math.max(sum.most, turns) });
  }
}
for (const [kind, s] of sums) console.log(JSON.stringify({ router: "corners", family: "nested", seeds, kind, ...s, stopsPerRoute: s.stops / s.routes, turnsPerRoute: s.turns / s.routes }));
