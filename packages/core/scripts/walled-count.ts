import { highwaysRegistry } from "../src/families/index.ts";
import { sectionsRouter } from "../src/routers/index.ts";
import { JOIN_WORK } from "../src/visibility.ts";
const reg = highwaysRegistry();
const SEEDS = Number(process.env["SEEDS"] ?? 20);
const dims = process.env["DIMS"] ? JSON.parse(process.env["DIMS"]) : undefined;
const links = (r: { levels?: readonly { links?: readonly unknown[] }[] }): number[] => (r.levels ?? []).map((l) => (l.links ?? []).length);
for (const stretch of [undefined, Infinity]) {
  const base = { name: "p", maxNodes: 100_000, ...(stretch ? { stretch } : {}) };
  const off = sectionsRouter(base);
  const on = sectionsRouter({ ...base, levelJoinWork: JOIN_WORK });
  let gain = 0, bytes = 0, routes = 0, total = 0;
  const notes: string[] = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    const { graph } = dims ? reg.generate("walled-level", seed, dims) : reg.generate("walled-level", seed);
    const a = off.route(graph), b = on.route(graph);
    const la = links(a as never), lb = links(b as never);
    const d = lb.map((n, i) => n - (la[i] ?? 0));
    const sum = d.reduce((x, y) => x + y, 0);
    if (seed === 0) console.log("nodes", graph.nodes.length, "edges", graph.edges.length, "levels", la.join(","));
    if (sum > 0) { gain++; total += sum; notes.push(`${seed}:${d.join("/")}`); }
    if (JSON.stringify(a.levels) !== JSON.stringify(b.levels)) bytes++;
    if (JSON.stringify(a.routes) !== JSON.stringify(b.routes)) routes++;
  }
  console.log(stretch ? "tree" : "sections", "gain", gain, "links", total, "level bytes", bytes, "routes", routes, notes.slice(0, 6).join(" "));
}
