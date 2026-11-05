// Throwaway. Sizes on the boards of the screen: routes that differ and the length after the pull.
import { highwaysRegistry } from "../src/families/index.ts";
import { ROUTERS } from "../src/routers/index.ts";
import { measureQuality } from "../src/bench/quality.ts";
const reg = highwaysRegistry();
const [a, b] = [ROUTERS.find((r) => r.name === "corners")!, ROUTERS.find((r) => r.name === "shared")!];
const len = (p: readonly { x: number; y: number }[]) => p.reduce((s, v, i) => (i ? s + Math.hypot(v.x - p[i - 1]!.x, v.y - p[i - 1]!.y) : 0), 0);
for (const f of ["many-groups", "frame-rows", "two-hubs", "bipartite"]) {
  let [edges, diff, boards, lensum, shorter, longer, equal, ca, cb, worst] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let seed = 0; seed < 10; seed++) {
    const g = reg.generate(f, seed).graph;
    const [ra, rb] = [a.route(g), b.route(g)];
    ca += measureQuality(g, ra).crossings;
    cb += measureQuality(g, rb).crossings;
    const B = new Map(rb.routes.map((r) => [r.edge, r.points]));
    let any = false;
    for (const r of ra.routes) {
      edges++;
      const q = B.get(r.edge)!;
      if (q.length === r.points.length && q.every((v, i) => Math.abs(v.x - r.points[i]!.x) + Math.abs(v.y - r.points[i]!.y) < 1e-9)) continue;
      diff++; any = true;
      const d = len(q) - len(r.points);
      lensum += d; worst = Math.max(worst, Math.abs(d));
      if (Math.abs(d) < 1e-6) equal++; else if (d < 0) shorter++; else longer++;
    }
    if (any) boards++;
  }
  console.log(f, `boards ${boards} of 10, routes ${diff} of ${edges}, equal ${equal}, shared shorter ${shorter}, longer ${longer}, worst ${worst.toFixed(2)}, net ${lensum.toFixed(2)}, crossings corners ${ca} shared ${cb}`);
}
