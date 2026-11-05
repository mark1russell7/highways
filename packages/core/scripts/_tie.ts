// Throwaway. Which routes of `corners` move under a shift of 1e-12, and is each move a tie of equal length.
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import type { Graph, Route } from "../src/model.ts";
import { ROUTERS } from "../src/routers/index.ts";

const SHIFT = 1e-12;
const reg = highwaysRegistry();
const name = process.argv[2] ?? "corners";
const router = ROUTERS.find((r) => r.name === name)!;
const shifted = (board: Graph, dx: number, dy: number): Graph => ({ ...board, nodes: board.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + dx, y: n.box.y + dy } })) });
const len = (r: Route): number => {
  let s = 0;
  for (let i = 1; i < r.points.length; i++) s += Math.hypot(r.points[i]!.x - r.points[i - 1]!.x, r.points[i]!.y - r.points[i - 1]!.y);
  return s;
};
const gap = (a: Route, b: Route): number => {
  if (a.points.length !== b.points.length) return Infinity;
  let w = 0;
  a.points.forEach((p, i) => (w = Math.max(w, Math.abs(p.x - b.points[i]!.x), Math.abs(p.y - b.points[i]!.y))));
  return w;
};
const classes: Record<string, number> = {};
const by: Record<string, number> = {};
let shown = 0;
let total = 0;
for (const f of HIGHWAYS_FAMILIES) {
  for (let seed = 0; seed < 3; seed++) {
    const board = reg.generate(f.name, seed).graph;
    const base = router.route(board).routes;
    const other = router.route(shifted(board, SHIFT, -SHIFT)).routes;
    total += base.length;
    const of = new Map(other.map((r) => [r.edge, r]));
    for (const a of base) {
      const b = of.get(a.edge)!;
      const g = gap(a, b);
      if (g <= 1e-6) continue;
      const d = Math.abs(len(a) - len(b));
      const ends = Math.abs(a.points[0]!.x - b.points[0]!.x) + Math.abs(a.points[0]!.y - b.points[0]!.y) + Math.abs(a.points.at(-1)!.x - b.points.at(-1)!.x) + Math.abs(a.points.at(-1)!.y - b.points.at(-1)!.y);
      const c = `${d < 1e-9 ? "equal-length" : d < 1e-6 ? "near-1e-6" : d < 1 ? "under-1" : "over-1"} ${ends > 1e-6 ? "ends-move" : "ends-stay"} ${a.points.length === b.points.length ? "same-count" : "other-count"}`;
      classes[c] = (classes[c] ?? 0) + 1;
      by[f.name] = (by[f.name] ?? 0) + 1;
      if (shown++ < 8) console.log(`${f.name} ${seed} ${a.edge}: length ${len(a).toFixed(6)} ${len(b).toFixed(6)}; points ${a.points.length} ${b.points.length}; ${c}\n  a ${a.points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")}\n  b ${b.points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")}`);
    }
  }
}
console.log(`routes ${total}`, JSON.stringify(classes), JSON.stringify(by));

// The corner graph of each board, with and without the shift.
import { WayFinder } from "../src/ways.ts";
let [boards, changed, moved] = [0, 0, 0];
const rowsG: string[] = [];
for (const f of HIGHWAYS_FAMILIES) {
  for (let seed = 0; seed < 3; seed++) {
    const board = reg.generate(f.name, seed).graph;
    const sb = shifted(board, SHIFT, -SHIFT);
    const [ga, gb] = [new WayFinder(board.nodes).corners, new WayFinder(sb.nodes).corners];
    boards++;
    let diff = 0;
    let links = 0;
    if (ga.points.length !== gb.points.length) diff = -1;
    else
      for (let i = 0; i < ga.points.length; i++) {
        const [x, y] = [ga.neighbours(i), gb.neighbours(i)];
        links += x.length;
        if (x.length !== y.length || x.some((v, k) => v !== y[k])) diff++;
      }
    const ra = router.route(board).routes;
    const rb = new Map(router.route(sb).routes.map((r) => [r.edge, r]));
    const m = ra.filter((a) => gap(a, rb.get(a.edge)!) > 1e-6).length;
    if (diff !== 0) changed++;
    if (m > 0) moved++;
    if (diff !== 0 || m > 0) rowsG.push(`${f.name} ${seed}: points ${ga.points.length}/${gb.points.length}, links ${links}, corners with other links ${diff}, routes moved ${m}`);
  }
}
console.log(`boards ${boards}, graph changed ${changed}, routes moved on ${moved}`);
console.log(rowsG.join("\n"));
