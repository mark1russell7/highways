import { highwaysRegistry } from "../src/families/index.ts";
import { sectionsRouter } from "../src/routers/index.ts";
import { JOIN_WORK } from "../src/visibility.ts";
const reg = highwaysRegistry();
const off = sectionsRouter({ name: "p", maxNodes: 100_000 });
const on = sectionsRouter({ name: "p", maxNodes: 100_000, levelJoinWork: JOIN_WORK });
const dims = { cols: 24, rows: 16, nodes: 60, edges: 120 };
for (let seed = 6; seed < 20; seed++) {
  const { graph } = reg.generate("maze", seed, dims as never);
  const a = off.route(graph) as never as { levels: { depth: number; items: unknown[]; links: { from: string; to: string; points: unknown[]; through?: unknown; blocked?: unknown }[] }[] };
  const b = on.route(graph) as never as typeof a;
  if (JSON.stringify(a.levels) === JSON.stringify(b.levels)) continue;
  console.log("seed", seed, "levels", a.levels.length);
  a.levels.forEach((l, i) => {
    const m = b.levels[i]!;
    if (JSON.stringify(l) === JSON.stringify(m)) return;
    const diff = l.links.filter((x, j) => JSON.stringify(x) !== JSON.stringify(m.links[j]));
    console.log(" depth", l.depth, "items", l.items.length, "links", l.links.length, m.links.length, "changed", diff.length, JSON.stringify(diff[0] ?? {}).slice(0, 220), "ON", JSON.stringify(m.links[l.links.indexOf(diff[0]!)] ?? {}).slice(0, 220));
  });
}
