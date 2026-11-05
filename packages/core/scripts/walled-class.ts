// Classes of the box crossings of level links on the real sections router, join off and on.
import { highwaysRegistry } from "../src/families/index.ts";
import { sectionsRouter } from "../src/routers/index.ts";
import { JOIN_WORK } from "../src/visibility.ts";
type P = { x: number; y: number };
type B = { x: number; y: number; w: number; h: number };
type Item = { id: string; box: B; nodes: readonly string[] };
type Link = { source: string; target: string; points: readonly P[] };
type Lvl = { depth: number; items: readonly Item[]; links: readonly Link[] };
const hit = (a: P, b: P, r: B): boolean => {
  for (let t = 0; t <= 64; t++) {
    const x = a.x + ((b.x - a.x) * t) / 64;
    const y = a.y + ((b.y - a.y) * t) / 64;
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
  }
  return false;
};
const meets = (a: B, b: B): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inBox = (p: P, r: B): boolean => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
interface Tally { single: number; merged: number; endOverlap: number; endInside: number; free: number; freeSingle: number; deepestLevelFree: number }
const tally = (l: Lvl, t: Tally, deepest: boolean): void => {
  const byId = new Map(l.items.map((i) => [i.id, i]));
  for (const k of l.links) {
    const s = byId.get(k.source), e = byId.get(k.target);
    for (const it of l.items) {
      if (it === s || it === e) continue;
      if (!k.points.some((q, i) => i > 0 && hit(k.points[i - 1]!, q, it.box))) continue;
      const single = it.nodes.length === 1;
      if (single) t.single++; else t.merged++;
      const forced = (s && meets(s.box, it.box)) || (e && meets(e.box, it.box));
      const inside = inBox(k.points[0]!, it.box) || inBox(k.points[k.points.length - 1]!, it.box);
      if (forced) t.endOverlap++;
      else if (inside) t.endInside++;
      else { t.free++; if (single) t.freeSingle++; if (deepest) t.deepestLevelFree++; }
    }
  }
};
const fresh = (): Tally => ({ single: 0, merged: 0, endOverlap: 0, endInside: 0, free: 0, freeSingle: 0, deepestLevelFree: 0 });
const reg = highwaysRegistry();
const off = sectionsRouter({ name: "p", maxNodes: 100_000 });
const on = sectionsRouter({ name: "p", maxNodes: 100_000, levelJoinWork: JOIN_WORK });
const levelsOf = (r: unknown): Lvl[] => (r as { levels: Lvl[] }).levels;

// The one changed link.
{
  const { graph } = reg.generate("maze", 19, { cols: 24, rows: 16, nodes: 60, edges: 120 } as never);
  const a = levelsOf(off.route(graph)).find((l) => l.depth === 4)!;
  const b = levelsOf(on.route(graph)).find((l) => l.depth === 4)!;
  a.links.forEach((k, i) => {
    const m = b.links[i]!;
    if (JSON.stringify(k) === JSON.stringify(m)) return;
    const of = (x: Link): string[] => a.items.filter((it) => it.id !== x.source && it.id !== x.target && x.points.some((q, j) => j > 0 && hit(x.points[j - 1]!, q, it.box))).map((it) => `${it.id}(${it.nodes.length})`);
    const len = (p: readonly P[]): number => Math.round(p.reduce((s, q, j) => (j ? s + Math.hypot(q.x - p[j - 1]!.x, q.y - p[j - 1]!.y) : 0), 0));
    console.log("changed link", k.source, k.target, "off crossings", of(k).length, of(k).slice(0, 8).join(" "), "length", len(k.points), "| on crossings", of(m).length, of(m).slice(0, 8).join(" "), "length", len(m.points));
  });
}
const SEEDS = Number(process.env["SEEDS"] ?? 10);
for (const [family, dims] of [["walled-level", {}], ["maze", {}], ["maze", { cols: 24, rows: 16, nodes: 60, edges: 120 }], ["clusters", {}]] as const) {
  if (!reg.families().some((f: { name: string }) => f.name === family)) continue;
  const a = fresh(), b = fresh();
  let links = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    const { graph } = reg.generate(family, seed, dims as never);
    const x = levelsOf(off.route(graph)), y = levelsOf(on.route(graph));
    const deepest = Math.max(...x.map((l) => l.depth));
    x.forEach((l) => { links += l.links.length; tally(l, a, l.depth === deepest); });
    y.forEach((l) => tally(l, b, l.depth === deepest));
  }
  console.log(family, JSON.stringify(dims).replace(/"/g, ""), "links", links, "OFF", JSON.stringify(a).replace(/"/g, ""), "ON", JSON.stringify(b).replace(/"/g, ""));
}
