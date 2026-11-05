// Throwaway. Where do `shared` and `corners` differ on a board where `shared` has no ways.
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { ROUTERS } from "../src/routers/index.ts";
import type { Route } from "../src/model.ts";
const reg = highwaysRegistry();
const [a, b] = [ROUTERS.find((r) => r.name === "corners")!, ROUTERS.find((r) => r.name === "shared")!];
const len = (r: Route): number => r.points.reduce((s, p, i) => (i ? s + Math.hypot(p.x - r.points[i - 1]!.x, p.y - r.points[i - 1]!.y) : 0), 0);
const fams = process.argv[2] ? process.argv[2].split(",") : HIGHWAYS_FAMILIES.slice(0, 15).map((f) => f.name);
for (const f of fams) {
  const cl: Record<string, number> = {};
  let shown = 0;
  let [routes, runs, inner] = [0, 0, 0];
  for (let seed = 0; seed < 3; seed++) {
    const board = reg.generate(f, seed).graph;
    const [ra, rb] = [a.route(board), b.route(board)];
    routes += ra.routes.length;
    runs += rb.runs?.length ?? 0;
    const of = new Map(rb.routes.map((r) => [r.edge, r]));
    inner += ra.routes.length - rb.routes.length;
    for (const p of ra.routes) {
      const q = of.get(p.edge);
      if (!q) { cl["only-corners"] = (cl["only-corners"] ?? 0) + 1; continue; }
      const same = p.points.length === q.points.length && p.points.every((v, i) => Math.abs(v.x - q.points[i]!.x) + Math.abs(v.y - q.points[i]!.y) < 1e-9);
      if (same) { cl.same = (cl.same ?? 0) + 1; continue; }
      const d = len(q) - len(p);
      const c = `${Math.abs(d) < 1e-6 ? "equal-length" : d > 0 ? "shared-longer" : "shared-shorter"} ${p.points.length === q.points.length ? "same-count" : p.points.length < q.points.length ? "shared-more" : "shared-fewer"}`;
      cl[c] = (cl[c] ?? 0) + 1;
      if (shown++ < 3) console.log(`  ${f} ${seed} ${p.edge} ${len(p).toFixed(2)} ${len(q).toFixed(2)}\n    c ${p.points.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ")}\n    s ${q.points.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(" ")}`);
    }
  }
  console.log(f, `routes ${routes}, runs ${runs}, corners extra ${inner}`, JSON.stringify(cl));
}
