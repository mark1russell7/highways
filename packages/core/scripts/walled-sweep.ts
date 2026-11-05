// Counts on the real sections router, join off against on: level links, changed level links, and level links through a box of an item of their level.
import { highwaysRegistry } from "../src/families/index.ts";
import { sectionsRouter } from "../src/routers/index.ts";
import { JOIN_WORK } from "../src/visibility.ts";
type P = { x: number; y: number };
type B = { x: number; y: number; w: number; h: number };
type Item = { id: string; box: B; nodes: readonly string[] };
type Link = { source: string; target: string; points: readonly P[] };
type Lvl = { depth: number; items: readonly Item[]; links: readonly Link[] };
// This test clips the segment to the open box, so a thin wall cannot fall between two samples.
const hit = (a: P, b: P, r: B): boolean => {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [d, lo, hi, s] of [[dx, r.x, r.x + r.w, a.x], [dy, r.y, r.y + r.h, a.y]] as const) {
    if (d === 0) { if (s <= lo || s >= hi) return false; continue; }
    const u = (lo - s) / d, v = (hi - s) / d;
    t0 = Math.max(t0, Math.min(u, v));
    t1 = Math.min(t1, Math.max(u, v));
  }
  return t0 < t1;
};
const crossings = (l: Lvl): number => {
  let c = 0;
  for (const k of l.links)
    for (const it of l.items) {
      if (it.id === k.source || it.id === k.target) continue;
      if (k.points.some((q, i) => i > 0 && hit(k.points[i - 1]!, q, it.box))) c++;
    }
  return c;
};
const reg = highwaysRegistry();
const SEEDS = Number(process.env["SEEDS"] ?? 10);
const LIMIT = Number(process.env["LIMIT_MS"] ?? 160_000);
const started = Date.now();
const off = sectionsRouter({ name: "p", maxNodes: 100_000 });
const on = sectionsRouter({ name: "p", maxNodes: 100_000, levelJoinWork: JOIN_WORK });
const CASES: [string, Record<string, number>][] = JSON.parse(process.env["CASES"] ?? '[["walled-level",{}],["walled-level",{"edges":60}]]');
for (const [family, dims] of CASES) {
  let boards = 0, byteBoards = 0, routeBoards = 0, changed = 0, crossOff = 0, crossOn = 0, links = 0, dropped = 0, crossBoards = 0;
  let depths = "";
  for (let seed = 0; seed < SEEDS; seed++) {
    if (Date.now() - started > LIMIT) break;
    const { graph } = reg.generate(family, seed, dims as never);
    const a = off.route(graph) as never as { levels: Lvl[]; routes: unknown };
    const b = on.route(graph) as never as typeof a;
    boards++;
    if (seed === 0) depths = `nodes ${graph.nodes.length} levels ${a.levels.map((l) => `${l.depth}:${l.items.length}/${l.links.length}`).join(" ")}`;
    if (JSON.stringify(a.levels) !== JSON.stringify(b.levels)) byteBoards++;
    if (JSON.stringify(a.routes) !== JSON.stringify(b.routes)) routeBoards++;
    let cross = 0;
    a.levels.forEach((l, i) => {
      const m = b.levels[i]!;
      links += l.links.length;
      dropped += m.links.length - l.links.length;
      changed += l.links.filter((k, j) => JSON.stringify(k) !== JSON.stringify(m.links[j])).length;
      cross += crossings(l);
      crossOn += crossings(m);
    });
    crossOff += cross;
    if (cross > 0) crossBoards++;
  }
  console.log(family, JSON.stringify(dims).replace(/"/g, ""), "boards", boards, "| level bytes", byteBoards, "routes", routeBoards, "| links", links, "count diff", dropped, "changed", changed, "| crossings off", crossOff, "on", crossOn, "boards with any", crossBoards);
  console.log("  ", depths);
}
