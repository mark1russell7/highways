import { highwaysRegistry } from "../src/families/index.ts";
import { levelLinks } from "../src/levels.ts";
import { JOIN_WORK } from "../src/visibility.ts";
const reg = highwaysRegistry();
const hit = (a: {x:number;y:number}, b: {x:number;y:number}, r: {x:number;y:number;w:number;h:number}): boolean => {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  if (x1 <= r.x || x0 >= r.x + r.w || y1 <= r.y || y0 >= r.y + r.h) return false;
  if (a.x !== b.x && a.y !== b.y) { // a slanted part: sample it
    for (let t = 0; t <= 200; t++) { const x = a.x + (b.x - a.x) * t / 200, y = a.y + (b.y - a.y) * t / 200; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true; }
    return false;
  }
  return true;
};
type P = {x:number;y:number};
const len = (p: readonly P[]): number => p.reduce((s, q, i) => i ? s + Math.hypot(q.x - p[i-1]!.x, q.y - p[i-1]!.y) : 0, 0);
for (const [seed, dims] of [[60599, undefined], [7122, {cols:24,rows:16,nodes:60,edges:120}], [39410, undefined], [10, undefined], [3086, {cols:24,rows:16,nodes:60,edges:120}]] as const) {
  const { graph } = dims ? reg.generate("maze", seed, dims as never) : reg.generate("maze", seed);
  const items = graph.nodes.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] }));
  const seen = new Map<string, {source:string;target:string;count:number}>();
  for (const e of graph.edges) { const a = e.source.node, b = e.target.node; if (a === b) continue; const k = a < b ? a + "|" + b : b + "|" + a; const o = seen.get(k); if (o) o.count++; else seen.set(k, { source: a < b ? a : b, target: a < b ? b : a, count: 1 }); }
  const pairs = [...seen.values()];
  const a = levelLinks(items, pairs), b = levelLinks(items, pairs, { levelJoinWork: JOIN_WORK });
  const box = new Map(items.map((i) => [i.id, i.box]));
  const cross = (l: {source:string;target:string;points:readonly P[]}): number => { let c = 0; for (const it of items) { if (it.id === l.source || it.id === l.target) continue; if (l.points.some((q, i) => i > 0 && hit(l.points[i-1]!, q, it.box))) c++; } return c; };
  let changed = 0, ca = 0, cb = 0, worse = 0, la = 0, lb = 0;
  a.forEach((l, i) => { const m = b[i]!; const x = cross(l), y = cross(m); ca += x; cb += y; la += len(l.points); lb += len(m.points); if (JSON.stringify(l) !== JSON.stringify(m)) { changed++; if (x > y) worse++; } });
  console.log("seed", seed, "nodes", items.length, "pairs", pairs.length, "links off", a.length, "on", b.length, "changed", changed, "off crosses boxes", ca, "on", cb, "links worse off", worse, "length off", Math.round(la), "on", Math.round(lb), box.size);
}
