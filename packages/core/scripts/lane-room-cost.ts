// The time of the room of each way (LANE-ROOM). This run only reports: it is not a gate.
// A router has no option that turns the room off, so the arm `again` reads the room of each way a second time, on new obstacles.
// So `again` over `route` is an upper limit of the cost of the room, because it also builds the obstacles.
// The arms are one job in one process, in turn on each input, with an A/A arm (MEASURE-ISOLATE).
// `node packages/core/scripts/lane-room-cost.ts --rounds 9` writes `out/join-cost.json` and `out/join-cost.md`, the names that the workflow keeps.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { SCREEN_V3, screenInputs } from "../src/bench/screen/set.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import { laneRoom } from "../src/lane-room.ts";
import { outerGraph, type Graph } from "../src/model.ts";
import { sectionsRouter } from "../src/routers/index.ts";
import { Obstacles } from "../src/visibility.ts";
import { measureIsolated, pairedContext, pairedEnv, type Input } from "./gates/paired.ts";

const LARGEST = { cols: 24, rows: 16, nodes: 60, edges: 120 };
const SEEDS: readonly number[] = [59, 1068, 2077, 3086, 7122, 9140];

/** This function gives the six largest boards of `screen-v3`, the largest size of `maze` and the board of the gate of the sections. */
function boards(): Input<Graph>[] {
  const reg = highwaysRegistry();
  const screen = screenInputs(SCREEN_V3).map((input, i) => ({ id: `screen-${i}-${input.family}`, graph: outerGraph(inputGraph(input)) }));
  const out: Input<Graph>[] = screen
    .sort((a, b) => b.graph.nodes.length - a.graph.nodes.length || a.id.localeCompare(b.id))
    .slice(0, 6)
    .map((b) => ({ id: b.id, group: "screen", value: b.graph }));
  for (const seed of SEEDS) out.push({ id: `largest-${seed}`, group: "largest", value: reg.generate("maze", seed, LARGEST as never).graph });
  out.push({ id: "large-clustered", group: "large-clustered", value: makeFixture(FIXTURES.find((f) => f.name === "large-clustered")!) });
  return out;
}

const measure = (router: ReturnType<typeof sectionsRouter>, inputs: readonly Input<Graph>[], rounds: number) => {
  return measureIsolated({
    arms: [
      { id: "route", run: (graph: Graph) => router.route(graph) },
      {
        id: "again",
        run: (graph: Graph) => {
          const result = router.route(graph);
          const obstacles = new Obstacles(graph.nodes, 180);
          for (const way of result.runs ?? []) laneRoom(way.points, obstacles);
          return result;
        },
      },
    ],
    inputs: [...inputs],
    repeats: rounds,
    warmup: 2,
    mode: "process",
    aa: true,
    env: pairedEnv(),
    context: pairedContext(),
  });
};

const { values } = parseArgs({ options: { rounds: { type: "string", default: "9" } } });
const rounds = Number(values.rounds);
const inputs = boards();
const report = measure(sectionsRouter({ name: "sections" }), inputs, rounds);
const siteReport = measure(sectionsRouter({ name: "sections", margin: 20, stretch: 3, cap: 6 }), inputs, rounds);

mkdirSync("out", { recursive: true });
writeFileSync("out/join-cost.json", `${JSON.stringify({ report, siteReport }, null, 2)}\n`);
const line = (name: string, r: typeof report): string => {
  const band = r.noiseFloor ? `${r.noiseFloor.p10.toFixed(3)} to ${r.noiseFloor.p90.toFixed(3)}` : "none";
  const groups = Object.entries(r.ratios["again"]!.groups).map(([g, v]) => `${g} ${v.toFixed(3)}`).join(", ");
  return `${name}: median ${r.ratios["again"]!.median.toFixed(3)}, groups ${groups}, A/A band ${band}.`;
};
const md = [`CPU: ${report.env.cpu}. Rounds: ${rounds}. Ratio again/route.`, line("default", report), line("site settings", siteReport)].join("\n");
writeFileSync("out/join-cost.md", `${md}\n`);
console.log(md);
