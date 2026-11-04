/**
 * This script counts the routes through boxes on the family `escape`, with the steps of the margin off and on (PLUG-OUT-BLOCKED).
 * It counts the routes of `corners` by the part of the ladder that gave them. `steps` counts the lowest first step of the two plugs on the graph at the margin.
 * `lowerGraphs` counts the ways of the graph of each lower step, and `straight` the routes with no way in a graph. The method `between` makes one way for each route, as `corners` does.
 * The list `screen` counts the routes of each default router on `screen-v3` that change, with the steps off and on.
 * The counts are deterministic, and the script reads no time. The first argument is the out file.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { center } from "../src/geom.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { nodeIndex, resolvePorts, type Route, type Router } from "../src/model.ts";
import { placePlug } from "../src/plugs.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/index.ts";
import { cornersRouter } from "../src/routers/index.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";
import { listStrategies, type AnyStrategy } from "../src/strategies/model.ts";
import { OUT_STEPS, WayFinder } from "../src/ways.ts";

const OUT = process.argv[2] ?? "out/plug-ladder.json";
const SEEDS = Number(process.env["SEEDS"] ?? 10);
const SETS: readonly { readonly name: string; readonly dims: object }[] = [
  { name: "default", dims: {} },
  { name: "nets 60", dims: { nets: 60 } },
  { name: "gap 40, nets 100", dims: { gap: 40, nets: 100 } },
  { name: "gap 4, nets 60", dims: { gap: 4, nets: 60 } },
];
const off = cornersRouter({ name: "off", outSteps: false });
const on = cornersRouter({ name: "on" });
const reg = highwaysRegistry();

const rows = SETS.map(({ name, dims }) => {
  const row = { name, routes: 0, throughOff: 0, throughOn: 0, steps: OUT_STEPS.map(() => 0), lowerGraphs: OUT_STEPS.map(() => 0), straight: 0 };
  for (let seed = 0; seed < SEEDS; seed++) {
    const { graph } = reg.generate("escape", seed, dims as never);
    const a = off.route(graph).routes;
    const b = on.route(graph).routes;
    const ways = new WayFinder(graph.nodes);
    const resolved = resolvePorts(graph);
    const byId = nodeIndex(resolved);
    for (const e of resolved.edges) {
      const s = byId.get(e.source.node)!;
      const t = byId.get(e.target.node)!;
      const ps = placePlug(s, e.source, center(t.box));
      const pt = placePlug(t, e.target, center(s.box));
      const before = ways.lowerWays.reduce((x, y) => x + y, 0);
      const way = ways.between(ps, pt, new Set([s, t]));
      const lower = ways.lowerWays.reduce((x, y) => x + y, 0) > before;
      row.steps[Math.max(ways.outStep(ps), ways.outStep(pt))]!++;
      if (!lower && way.length === 2 && !ways.obstacles.clear(ps.point, pt.point, 0, new Set([s, t]))) row.straight++;
    }
    ways.lowerWays.forEach((n, i) => (row.lowerGraphs[i]! += n));
    row.routes += a.length;
    row.throughOff += a.filter((r) => r.through !== undefined).length;
    row.throughOn += b.filter((r) => r.through !== undefined).length;
  }
  console.log(JSON.stringify(row));
  return row;
});

/** This function counts the change of one router on `screen-v3`, with the steps of the margin off and on. */
function screenRow(name: string, make: (outSteps: boolean) => Router): object {
  const row = { name, boards: 0, boardsChanged: 0, routes: 0, routesChanged: 0, changedThroughOff: 0, changedThroughOn: 0, throughOff: 0, throughOn: 0 };
  const a = make(false);
  const b = make(true);
  for (const input of screenInputs(SCREEN_SETS["screen-v3"]!)) {
    const graph = inputGraph(input);
    const before = a.route(graph).routes;
    const after = b.route(graph).routes;
    let changed = false;
    row.boards++;
    row.routes += before.length;
    before.forEach((r, i) => {
      const n = after[i]!;
      if (r.through !== undefined) row.throughOff++;
      if (n.through !== undefined) row.throughOn++;
      if (JSON.stringify(r.points) === JSON.stringify(n.points)) return;
      changed = true;
      row.routesChanged++;
      if (r.through !== undefined) row.changedThroughOff++;
      if (n.through !== undefined) row.changedThroughOn++;
    });
    if (changed) row.boardsChanged++;
  }
  console.log(JSON.stringify(row));
  return row;
}

const routers = listStrategies(STRATEGIES, "router") as readonly AnyStrategy[];
const screen = routers.map((s) => {
  const run = s.run as (graph: unknown, options: object) => { readonly routes: readonly Route[] };
  return screenRow(s.name, (outSteps) => ({ name: s.name, route: (graph) => run(graph, { ...s.defaults, outSteps }) as never }));
});
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ schema: "plug-ladder/1", family: "escape", router: "corners", seeds: SEEDS, steps: OUT_STEPS, rows, screen }, null, 2)}\n`);
