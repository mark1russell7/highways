// Throwaway. Which step makes `shared` differ from `corners` on boards with no ways.
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { ROUTERS } from "../src/routers/index.ts";
import { center } from "../src/geom.ts";
import { nodeIndex, outerGraph, type Node, type Route } from "../src/model.ts";
import { placePlug } from "../src/plugs.ts";
import { WayFinder } from "../src/ways.ts";
const reg = highwaysRegistry();
const [a, b] = [ROUTERS.find((r) => r.name === "corners")!, ROUTERS.find((r) => r.name === "shared")!];
type P = { x: number; y: number };
const same = (p: readonly P[], q: readonly P[]) => p.length === q.length && p.every((v, i) => Math.abs(v.x - q[i]!.x) + Math.abs(v.y - q[i]!.y) < 1e-9);
const length = (p: readonly P[]) => p.reduce((s, v, i) => (i ? s + Math.hypot(v.x - p[i - 1]!.x, v.y - p[i - 1]!.y) : 0), 0);
for (const f of ["many-groups", "frame-rows", "two-hubs", "bipartite", "fan-out"]) {
  const c: Record<string, number> = {};
  const add = (k: string) => (c[k] = (c[k] ?? 0) + 1);
  let [rawGap, rawN] = [0, 0];
  for (let seed = 0; seed < 10; seed++) {
    const board = reg.generate(f, seed).graph;
    const [ra, rb] = [a.route(board), b.route(board)];
    if ((rb.runs?.length ?? 0) > 0) continue;
    const graph = outerGraph(board);
    const byId = nodeIndex(graph);
    const ways = new WayFinder(graph.nodes, {});
    const A = new Map(ra.routes.map((r: Route) => [r.edge, r.points]));
    const B = new Map(rb.routes.map((r: Route) => [r.edge, r.points]));
    for (const e of graph.edges) {
      const s = byId.get(e.source.node)!, t = byId.get(e.target.node)!;
      const ps = placePlug(s, e.source, center(t.box)), pt = placePlug(t, e.target, center(s.box));
      const [from, to] = [ways.out(ps), ways.out(pt)];
      const plain = ways.corners.path(from, to);
      const half = ways.corners.path(from, to, (_i, _j, d) => d, 0.5);
      const costOnly = ways.corners.path(from, to, (_i, _j, d) => d, 1);
      const pa = A.get(e.id)!, pb = B.get(e.id)!;
      if (same(pa, pb)) { add("same-final"); }
      else {
        add("differ-final");
        add(plain && half && same(plain, half) ? " raw-same" : " raw-differ");
        add(plain && costOnly && same(plain, costOnly) ? " cost-fn-only-same" : " cost-fn-only-differs");
        if (plain && half) { rawN++; rawGap = Math.max(rawGap, Math.abs(length(plain) - length(half))); }
        const wrapA = plain ? [ps.point, ...ways.corners.pull(plain), pt.point] : undefined;
        const wrapB = half ? [ps.point, ...ways.corners.pull(half), pt.point] : undefined;
        add(wrapA && same(wrapA, pa) ? "  rebuilt-corners" : "  not-rebuilt-corners");
        add(wrapB && same(wrapB, pb) ? "  rebuilt-shared" : "  not-rebuilt-shared");
      }
    }
  }
  console.log(f, JSON.stringify(c), `worst raw length gap ${rawGap.toExponential(2)} on ${rawN}`);
}
