// A throwaway measure of the join of parts on the level graphs. It runs in CI on the branch `measure/level-join` and is not merged.
// Each board of `screen-v3` runs twice for each way to the level links: join off and join on. The outer graphs are the same in both arms,
// so the difference of the join links is the gain of the level graphs. A control board proves that the switch and the counter work.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resultForm } from "../src/bench/screen/exercise.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { SCREEN_V3, screenInputs } from "../src/bench/screen/set.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { highwayRouterStrategy } from "../src/highways/router.ts";
import { levelLinks } from "../src/levels.ts";
import { outerGraph, type Graph, type Result } from "../src/model.ts";
import { makeRoom, roomLinks } from "../src/room/index.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";
import { highwayStrategies, levelStrategies } from "../src/strategies/builtins.ts";
import { WORK } from "../src/work.ts";

const counters = WORK as unknown as Record<string, number>;
const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

type Way = { readonly name: string; readonly run: (graph: Graph) => { readonly levels: unknown; readonly whole: unknown } };

const fromRouter = (name: string, route: (graph: Graph) => Result): Way => ({
  name,
  run: (graph) => {
    const result = route(graph);
    return { levels: result.levels ?? [], whole: resultForm(result) };
  },
});

const named = (name: string) => ROUTERS.find((r) => r.name === name)!;
const levelLinksRouter = highwayRouterStrategy(highwayStrategies["level-links"]);

const WAYS: readonly Way[] = [
  fromRouter("sections", (g) => named("sections").route(g)),
  fromRouter("sections-tree", (g) => named("sections-tree").route(g)),
  fromRouter("sections+venation", (g) => sectionsRouter({ name: "v", level: levelStrategies.venation, maxNodes: 100_000 }).route(g)),
  fromRouter("sections+detail", (g) => sectionsRouter({ name: "d", level: levelStrategies.detail, maxNodes: 100_000 }).route(g)),
  fromRouter("hw:level-links", (g) => levelLinksRouter.run(g, levelLinksRouter.defaults) as Result),
  {
    name: "room",
    run: (g) => {
      const outer = outerGraph(g);
      const room = makeRoom(outer.nodes, roomLinks(outer));
      return { levels: room.gaps, whole: room };
    },
  },
];

type Arm = { links: number; stops: number; looks: number; levels: string; whole: string; error?: string };

function arm(way: Way, graph: Graph, on: boolean): Arm {
  process.env["LEVEL_JOIN"] = on ? "on" : "off";
  const before = { links: counters["joinLinks"]!, stops: counters["joinStops"]!, looks: counters["joinLooks"]! };
  try {
    const out = way.run(graph);
    return {
      links: counters["joinLinks"]! - before.links,
      stops: counters["joinStops"]! - before.stops,
      looks: counters["joinLooks"]! - before.looks,
      levels: sha(out.levels),
      whole: sha(out.whole),
    };
  } catch (e) {
    return { links: 0, stops: 0, looks: 0, levels: "", whole: "", error: String(e).slice(0, 160) };
  }
}

/** The control: a board where the nearest links cut one region, so the join gains links if the switch and the counter work. */
function control(): { on: number; off: number; bytesDiffer: boolean } {
  const { graph } = highwaysRegistry().generate("maze", 60599);
  const items = graph.nodes.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] }));
  const pairs = graph.edges.map((e) => ({ source: e.source.node, target: e.target.node, count: 1 })).filter((p) => p.source !== p.target);
  const run = (on: boolean) => {
    process.env["LEVEL_JOIN"] = on ? "on" : "off";
    const before = counters["joinLinks"]!;
    const links = levelLinks(items, pairs);
    return { links: counters["joinLinks"]! - before, hash: sha(links) };
  };
  const off = run(false);
  const on = run(true);
  return { on: on.links, off: off.links, bytesDiffer: on.hash !== off.hash };
}

const boards = screenInputs(SCREEN_V3).map((input, i) => ({ id: `${i}-${input.family}`, graph: inputGraph(input) })).slice(0, Number(process.env["LEVEL_BOARDS"] ?? 1000));
const summary = [];
const gained: { way: string; board: string; links: number; levelBytes: boolean; wholeBytes: boolean }[] = [];
const errors: { way: string; board: string; error: string }[] = [];
const ctl = control();
for (const way of WAYS) {
  const row = { way: way.name, boards: 0, boardsGaining: 0, linksGained: 0, levelBytesChanged: 0, wholeBytesChanged: 0, stopsOn: 0, looksOn: 0, ms: 0 };
  const start = performance.now();
  for (const board of boards) {
    const off = arm(way, board.graph, false);
    const on = arm(way, board.graph, true);
    if (off.error !== undefined || on.error !== undefined) {
      errors.push({ way: way.name, board: board.id, error: (off.error ?? on.error)! });
      continue;
    }
    const gain = on.links - off.links;
    row.boards++;
    row.linksGained += gain;
    row.stopsOn += on.stops - off.stops;
    row.looksOn += on.looks - off.looks;
    const levelBytes = on.levels !== off.levels;
    const wholeBytes = on.whole !== off.whole;
    if (levelBytes) row.levelBytesChanged++;
    if (wholeBytes) row.wholeBytesChanged++;
    if (gain !== 0 || levelBytes || wholeBytes) gained.push({ way: way.name, board: board.id, links: gain, levelBytes, wholeBytes });
    if (gain !== 0) row.boardsGaining++;
  }
  row.ms = Math.round(performance.now() - start);
  summary.push(row);
  console.log(JSON.stringify(row));
  mkdirSync("out", { recursive: true });
  writeFileSync("out/level-join.json", `${JSON.stringify({ control: ctl, boards: boards.length, summary, gained, errors }, null, 2)}\n`);
}

const lines = [
  "# Level join: on against off, over `screen-v3`",
  "",
  `Control board, maze seed 60599: ${ctl.off} join links off, ${ctl.on} on, bytes differ: ${ctl.bytesDiffer}.`,
  "",
  "| Way | Boards | Boards gaining | Links gained | Level bytes changed | Whole bytes changed | Stops | Looks | ms |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...summary.map((r) => `| ${r.way} | ${r.boards} | ${r.boardsGaining} | ${r.linksGained} | ${r.levelBytesChanged} | ${r.wholeBytesChanged} | ${r.stopsOn} | ${r.looksOn} | ${r.ms} |`),
  "",
  `Rows with any change: ${gained.length}. Errors: ${errors.length}.`,
  "",
  ...gained.slice(0, 200).map((g) => `- ${g.way} ${g.board}: ${g.links} links, level bytes ${g.levelBytes}, whole bytes ${g.wholeBytes}`),
  ...errors.slice(0, 40).map((e) => `- ERROR ${e.way} ${e.board}: ${e.error}`),
];
writeFileSync("out/level-join.md", `${lines.join("\n")}\n`);
if (ctl.on <= ctl.off) {
  console.error("VOID: the control board gained no link, so a zero on the set proves nothing.");
  process.exit(1);
}
