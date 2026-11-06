// The probe of THIN-GAP: the routes with the field `near`, by set. A route gets the field when it goes through no box, but passes nearer than `NEAR_WIDTH` to one.
// The lists: `corners` on the four sets of the family `escape` (10 seeds), each default router on each family at its default size (3 seeds),
// `sections` at a margin of 20 on the example boards of the site, and each default router on `screen-v3`.
// A row of `screen-v3` with 0 routes with the field keeps the bytes of each route, because the field is the only change.
// Start: `node scripts/probe-thin-gap.ts [out.json] [lists]`. The lists are a comma list of `escape`, `families`, `site` and `screen`. Each line of the output is one JSON row.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/index.ts";
import { CASES } from "../src/cases.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import { NEAR_WIDTH, type Graph, type Route } from "../src/model.ts";
import { cornersRouter, sectionsRouter } from "../src/routers/index.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";
import { listStrategies, type AnyStrategy } from "../src/strategies/model.ts";

const OUT = process.argv[2] ?? "out/thin-gap.json";
const LISTS = new Set((process.argv[3] ?? "escape,families,site,screen").split(","));
const reg = highwaysRegistry();
const routers = listStrategies(STRATEGIES, "router") as readonly AnyStrategy[];
const runOf = (s: AnyStrategy) => (graph: Graph): readonly Route[] => (s.run as (g: Graph, o: object) => { readonly routes: readonly Route[] })(graph, s.defaults).routes;

/** The counts of one row. */
interface Counts {
  boards: number;
  routes: number;
  through: number;
  near: number;
  nearBoxes: number;
  boardsWithNear: number;
}

const counts = (): Counts => ({ boards: 0, routes: 0, through: 0, near: 0, nearBoxes: 0, boardsWithNear: 0 });

/** This function adds the routes of one board to the counts. */
function add(row: Counts, routes: readonly Route[]): void {
  row.boards++;
  row.routes += routes.length;
  let near = 0;
  for (const r of routes) {
    if (r.through !== undefined) row.through++;
    if (r.near !== undefined) {
      near++;
      row.nearBoxes += r.near.length;
    }
  }
  row.near += near;
  if (near > 0) row.boardsWithNear++;
}

const out: Record<string, unknown[]> = {};
const emit = (list: string, row: object): void => {
  console.log(JSON.stringify({ list, ...row }));
  (out[list] ??= []).push(row);
};

if (LISTS.has("escape")) {
  const corners = cornersRouter({ name: "corners" });
  const sets = [
    { name: "default", dims: {} },
    { name: "nets 60", dims: { nets: 60 } },
    { name: "gap 40, nets 100", dims: { gap: 40, nets: 100 } },
    { name: "gap 4, nets 60", dims: { gap: 4, nets: 60 } },
  ];
  for (const { name, dims } of sets) {
    const row = counts();
    for (let seed = 0; seed < 10; seed++) add(row, corners.route(reg.generate("escape", seed, dims as never).graph).routes);
    emit("escape", { set: name, router: "corners", seeds: 10, ...row });
  }
}

if (LISTS.has("families")) {
  for (const f of reg.families() as readonly { readonly name: string }[]) {
    for (const s of routers) {
      const row = counts();
      const run = runOf(s);
      for (let seed = 0; seed < 3; seed++) add(row, run(reg.generate(f.name, seed, {} as never).graph));
      emit("families", { family: f.name, router: s.name, seeds: 3, ...row });
    }
  }
}

if (LISTS.has("site")) {
  const site = sectionsRouter({ name: "site", margin: 20, stretch: 3, cap: 6 });
  const fixture = FIXTURES.find((f) => f.name === "small-clustered")!;
  for (const [name, graph] of [...CASES.map((c) => [c.name, c.make()] as const), [fixture.name, makeFixture(fixture)] as const]) {
    const row = counts();
    add(row, site.route(graph).routes);
    emit("site", { board: name, router: "sections", margin: 20, ...row });
  }
}

if (LISTS.has("screen")) {
  const inputs = screenInputs(SCREEN_SETS["screen-v3"]!);
  for (const s of routers) {
    const row = counts();
    const run = runOf(s);
    for (const input of inputs) add(row, run(inputGraph(input)));
    emit("screen", { set: "screen-v3", router: s.name, ...row });
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ schema: "thin-gap/1", width: NEAR_WIDTH, ...out }, null, 2)}\n`);
