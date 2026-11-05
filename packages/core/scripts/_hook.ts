import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { ROUTERS } from "../src/routers/index.ts";

type P = { x: number; y: number };
const legs = (pts: readonly P[]) => {
  const out: P[] = [];
  for (let i = 1; i < pts.length && out.length < 3; i++) {
    const l = { x: pts[i]!.x - pts[i - 1]!.x, y: pts[i]!.y - pts[i - 1]!.y };
    if (l.x !== 0 || l.y !== 0) out.push(l);
  }
  return out;
};
const len = (l: P) => Math.hypot(l.x, l.y);
const reg = highwaysRegistry();
const names = process.argv.slice(2);
const samples: string[] = [];
for (const name of names) {
  const router = ROUTERS.find((r) => r.name === name)!;
  const c: Record<string, number> = {};
  let routes = 0;
  const firstLeg: Record<string, number> = {};
  const byFam: Record<string, number> = {};
  for (const f of HIGHWAYS_FAMILIES) {
    for (let seed = 0; seed < 3; seed++) {
      const graph = reg.generate(f.name, seed).graph;
      const result = router.route(graph);
      const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
      const edges = new Map(graph.edges.map((e) => [e.id, e]));
      for (const r of result.routes) {
        routes++;
        if (r.frame !== undefined) continue;
        for (const pts of [r.points, [...r.points].reverse()]) {
          const [a, b, n3] = legs(pts);
          if (!a || !b || a.x * b.x + a.y * b.y >= -1e-9) continue;
          const other = pts[pts.length - 1]!;
          const start = pts[0]!;
          const faces = a.x * (other.x - start.x) + a.y * (other.y - start.y) > 0;
          const anti = Math.abs(a.x * b.y - a.y * b.x) <= 1e-6 * len(a) * len(b);
          const backPast = len(b) >= len(a) - 1e-6;
          const key = `${faces ? "faces-other" : "faces-away"} ${anti ? "straight-back" : "angled"} ${anti ? (backPast ? "past-plug" : "short") : ""}`.trim();
          c[key] = (c[key] ?? 0) + 1;
          const b1 = len(a) < 4 ? "<4" : len(a) < 12 ? "4-12" : len(a) < 24 ? "12-24" : ">=24";
          firstLeg[b1] = (firstLeg[b1] ?? 0) + 1;
          byFam[f.name] = (byFam[f.name] ?? 0) + 1;
          if (samples.length < 14 && seed === 0 && name === names[0]) {
            const e = edges.get(r.edge)!;
            const box = nodes.get(e.source.node)?.box;
            samples.push(`${f.name} ${r.edge} ${key} a=${len(a).toFixed(1)} b=${len(b).toFixed(1)} c=${n3 ? len(n3).toFixed(1) : "-"} start=${start.x},${start.y} box=${JSON.stringify(box)} pts=${pts.slice(0, 5).map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ")}`);
          }
        }
      }
    }
  }
  console.log(name, "routes", routes, JSON.stringify(c), "first leg", JSON.stringify(firstLeg));
  console.log(" families", JSON.stringify(Object.entries(byFam).sort((x, y) => y[1] - x[1]).slice(0, 8)));
}
console.log(samples.join("\n"));
