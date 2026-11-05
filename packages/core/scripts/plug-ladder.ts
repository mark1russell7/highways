/**
 * This script counts the routes through boxes on the family `escape`, with the steps of the margin off and on (PLUG-OUT-BLOCKED).
 * It counts the routes of `corners` by the part of the ladder that gave them. `steps` counts the lowest first step of the two plugs on the graph at the margin.
 * `lowerGraphs` counts the ways of the graph of each lower step, and `straight` the routes with no way in a graph. The method `between` makes one way for each route, as `corners` does.
 * The list `screen` counts the routes of each default router on `screen-v3` that change, with the steps off and on. The boxes of `packed-grid` touch, so its routes stay.
 * The list `families` gives the same counts for `corners` on each family at its default size. The list `site` counts `sections` at a margin of 20 on the four example boards.
 * Each list reads each route that the ladder changes. `underStroke` counts those routes that stand nearer to a box than the width `STROKE` of a route on the site.
 * The site draws that width in screen pixels at each zoom, so these counts are for a scale of one pixel to one unit.
 * The counts are deterministic, and the script reads no time. The first argument is the out file.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { center, segmentBoxDistance, type Point } from "../src/geom.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { nodeIndex, resolvePorts, type Graph, type Node, type Route, type Router } from "../src/model.ts";
import { placePlug } from "../src/plugs.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/index.ts";
import { CASES } from "../src/cases.ts";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import { cornersRouter, sectionsRouter } from "../src/routers/index.ts";
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
/** The width in pixels of a route on the site: the stroke of a path in `.cmp-map`. */
const STROKE = 1.1;
const off = cornersRouter({ name: "off", outSteps: false });
const on = cornersRouter({ name: "on" });
const reg = highwaysRegistry();

/** The counts of the routes that the ladder changes. */
interface NearCounts {
  changed: number;
  underStroke: number;
  underTwoStrokes: number;
  least: number | null;
}

/** This function gives empty counts. */
const nearCounts = (): NearCounts => ({ changed: 0, underStroke: 0, underTwoStrokes: 0, least: null });

/** This function gives the least distance from a route to a box that is not an end of its edge. */
function clearanceOf(points: readonly Point[], boxes: readonly Node[], ends: ReadonlySet<string>): number {
  let least = Infinity;
  for (let i = 1; i < points.length; i++) {
    for (const n of boxes) if (!ends.has(n.id)) least = Math.min(least, segmentBoxDistance(points[i - 1]!, points[i]!, n.box));
  }
  return least;
}

/** This function counts the clearance of each route that the ladder changes and that goes through no box. */
function countNear(graph: Graph, before: readonly Route[], after: readonly Route[], ends: ReadonlyMap<string, ReadonlySet<string>>, row: NearCounts): void {
  before.forEach((r, i) => {
    const n = after[i]!;
    if (JSON.stringify(r.points) === JSON.stringify(n.points)) return;
    row.changed++;
    const edge = ends.get(r.edge);
    if (n.through !== undefined || edge === undefined) return;
    const c = clearanceOf(n.points, graph.nodes, edge);
    if (c < STROKE) row.underStroke++;
    if (c < 2 * STROKE) row.underTwoStrokes++;
    row.least = row.least === null ? c : Math.min(row.least, c);
  });
}

const rows = SETS.map(({ name, dims }) => {
  const row = { name, routes: 0, throughOff: 0, throughOn: 0, steps: OUT_STEPS.map(() => 0), lowerGraphs: OUT_STEPS.map(() => 0), straight: 0, ...nearCounts() };
  for (let seed = 0; seed < SEEDS; seed++) {
    const { graph } = reg.generate("escape", seed, dims as never);
    const a = off.route(graph).routes;
    const b = on.route(graph).routes;
    countNear(graph, a, b, countLadder(graph, row), row);
    row.routes += a.length;
    row.throughOff += a.filter((r) => r.through !== undefined).length;
    row.throughOn += b.filter((r) => r.through !== undefined).length;
  }
  console.log(JSON.stringify(row));
  return row;
});

/** This function counts the ladder of `corners` on one family at its default size. */
function familyRow(family: string): object {
  const row = { family, boards: 0, routes: 0, throughOff: 0, throughOn: 0, steps: OUT_STEPS.map(() => 0), lowerGraphs: OUT_STEPS.map(() => 0), straight: 0, ...nearCounts() };
  for (let seed = 0; seed < SEEDS; seed++) {
    const { graph } = reg.generate(family, seed, {} as never);
    row.boards++;
    const ends = countLadder(graph, row);
    const a = off.route(graph).routes;
    const b = on.route(graph).routes;
    countNear(graph, a, b, ends, row);
    row.routes += a.length;
    row.throughOff += a.filter((r) => r.through !== undefined).length;
    row.throughOn += b.filter((r) => r.through !== undefined).length;
  }
  console.log(JSON.stringify(row));
  return row;
}

/** This function counts the routes of `corners` by the part of the ladder that gave them. It gives the ends of each edge. */
function countLadder(graph: Graph, row: { readonly steps: number[]; readonly lowerGraphs: number[]; straight: number }): Map<string, ReadonlySet<string>> {
  const ways = new WayFinder(graph.nodes);
  const resolved = resolvePorts(graph);
  const byId = nodeIndex(resolved);
  const ends = new Map<string, ReadonlySet<string>>();
  for (const e of resolved.edges) {
    const s = byId.get(e.source.node)!;
    const t = byId.get(e.target.node)!;
    ends.set(e.id, new Set([s.id, t.id]));
    const ps = placePlug(s, e.source, center(t.box));
    const pt = placePlug(t, e.target, center(s.box));
    const before = ways.lowerWays.reduce((x, y) => x + y, 0);
    const way = ways.between(ps, pt, new Set([s, t]));
    const lower = ways.lowerWays.reduce((x, y) => x + y, 0) > before;
    row.steps[Math.max(ways.outStep(ps), ways.outStep(pt))]!++;
    if (!lower && way.length === 2 && !ways.obstacles.clear(ps.point, pt.point, 0, new Set([s, t]))) row.straight++;
  }
  ways.lowerWays.forEach((n, i) => (row.lowerGraphs[i]! += n));
  return ends;
}

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
const families = reg.families().map((f: { name: string }) => familyRow(f.name));

/** This function counts `sections` at a margin of 20 on one board. */
function siteRow(name: string, graph: Graph): object {
  const site = { name: "site", margin: 20, stretch: 3, cap: 6 };
  const a = sectionsRouter({ ...site, outSteps: false }).route(graph).routes;
  const b = sectionsRouter(site).route(graph).routes;
  const row = { name, routes: a.length, throughOff: a.filter((r) => r.through !== undefined).length, throughOn: b.filter((r) => r.through !== undefined).length, ...nearCounts() };
  countNear(graph, a, b, new Map(graph.edges.map((e) => [e.id, new Set([e.source.node, e.target.node])])), row);
  console.log(JSON.stringify(row));
  return row;
}

const fixture = FIXTURES.find((f) => f.name === "small-clustered")!;
const site = [...CASES.map((c) => siteRow(c.name, c.make())), siteRow(fixture.name, makeFixture(fixture))];
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ schema: "plug-ladder/1", family: "escape", router: "corners", seeds: SEEDS, steps: OUT_STEPS, stroke: STROKE, rows, screen, families, site }, null, 2)}\n`);
