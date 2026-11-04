// The time of the join of the corner graph (CORNER-REACH). This run only reports: it is not a gate.
// The gates of a pull request run on boards where the join does nothing, so they cannot show its time.
// The arms are one job in one process, in turn on each input, with an A/A arm (MEASURE-ISOLATE).
// Each arm is one whole route of the router `corners`, because the option `joinWork` is an option of that router.
//
// The trigger of a cheap test of free space before the sight tests (fixed before the first result):
// - That item opens when the median ratio of a default-size group passes 1.10 and the p90 of the A/A arm.
// - That item opens when the median ratio of a large group passes 2.00 and the p90 of the A/A arm.
// - Under both lines, that item stays a note on the roadmap.
// `node packages/core/scripts/join-cost.ts --rounds 15` writes `out/join-cost.json` and `out/join-cost.md`.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { SCREEN_V3, screenInputs } from "../src/bench/screen/set.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { outerGraph, type Graph } from "../src/model.ts";
import { cornersRouter } from "../src/routers/index.ts";
import { WayFinder } from "../src/ways.ts";
import { measureIsolated, pairedContext, pairedEnv, type Input } from "./gates/paired.ts";

const SIZES: readonly (readonly [string, Readonly<Record<string, number>>])[] = [
  ["default", {}],
  ["2x", { cols: 11, rows: 9, nodes: 24, edges: 32 }],
  ["4x", { cols: 16, rows: 12, nodes: 48, edges: 64 }],
  ["largest", { cols: 24, rows: 16, nodes: 60, edges: 120 }],
];

/** The seeds of each size. The last three need more than 256 looks for each point at the largest size. */
const SEEDS: readonly number[] = [59, 1068, 2077, 3086, 7122, 9140];

/** The groups of the default size, and the groups of the large boards. The trigger reads these groups. */
const DEFAULT_GROUPS: readonly string[] = ["default", "screen"];
const LARGE_GROUPS: readonly string[] = ["largest", "tiled"];

/** This function gives two copies of a board side by side, so that the board has twice the points of the family. */
function tiled(graph: Graph): Graph {
  const { nodes, edges } = graph;
  const width = Math.max(...nodes.map((n) => n.box.x + n.box.w)) - Math.min(...nodes.map((n) => n.box.x));
  const copy = (id: string): string => `${id}~copy`;
  return {
    nodes: [...nodes, ...nodes.map((n) => ({ ...n, id: copy(n.id), box: { ...n.box, x: n.box.x + width + 200 } }))],
    edges: [...edges, ...edges.map((e) => ({ ...e, id: copy(e.id), source: { ...e.source, node: copy(e.source.node) }, target: { ...e.target, node: copy(e.target.node) } }))],
  };
}

/** This function gives the boards of `screen-v3`. */
function screenBoards(): { readonly id: string; readonly graph: Graph }[] {
  return screenInputs(SCREEN_V3).map((input, i) => ({ id: `screen-${i}-${input.family}`, graph: outerGraph(inputGraph(input)) }));
}

/** This function gives the boards of the run, with the six largest boards of `screen-v3`. */
function boards(screen: readonly { readonly id: string; readonly graph: Graph }[]): Input<Graph>[] {
  const reg = highwaysRegistry();
  const out: Input<Graph>[] = [...screen]
    .sort((a, b) => b.graph.nodes.length - a.graph.nodes.length || a.id.localeCompare(b.id))
    .slice(0, 6)
    .map((b) => ({ id: b.id, group: "screen", value: b.graph }));
  for (const [size, dims] of SIZES) {
    for (const seed of SEEDS) {
      const { graph } = reg.generate("maze", seed, dims as never);
      out.push({ id: `${size}-${seed}`, group: size, value: graph });
      if (size === "largest") out.push({ id: `tiled-${seed}`, group: "tiled", value: tiled(graph) });
    }
  }
  return out;
}

const { values } = parseArgs({ options: { rounds: { type: "string", default: "15" } } });
const screen = screenBoards();
const screenLooks = screen.map((b) => new WayFinder(b.graph.nodes).corners.joinLooks);
const inputs = boards(screen);
const off = cornersRouter({ name: "corners", joinWork: 0 });
const on = cornersRouter({ name: "corners" });
const report = measureIsolated({
  arms: [
    { id: "off", run: (graph: Graph) => off.route(graph) },
    { id: "on", run: (graph: Graph) => on.route(graph) },
  ],
  inputs,
  repeats: Number(values.rounds),
  warmup: 2,
  mode: "process",
  aa: true,
  env: pairedEnv(),
  context: pairedContext(),
});

const rows = inputs.map((input) => {
  const { nodes } = input.value!;
  const ways = new WayFinder(nodes);
  const links = ways.corners.linkCount - new WayFinder(nodes, { joinWork: 0 }).corners.linkCount;
  const row = report.inputs.find((r) => r.id === input.id)!;
  return { id: input.id, points: ways.corners.points.length, looks: ways.corners.joinLooks, links, stopped: ways.corners.joinStopped, off: row.median["off"]!, on: row.median["on"]! };
});
mkdirSync("out", { recursive: true });
const withWork = screenLooks.filter((n) => n > 0).length;
const closed = rows.filter((r) => r.looks > 0 && r.links === 0).length;
const groups = report.ratios["on"]!.groups;
const aaTop = report.noiseFloor?.p90 ?? 1;
const past = (names: readonly string[], line: number): string[] => names.filter((g) => groups[g]! > line && groups[g]! > aaTop);
const opens = [...past(DEFAULT_GROUPS, 1.1), ...past(LARGE_GROUPS, 2)];
const verdict = opens.length > 0 ? `the item opens (${opens.join(", ")})` : "the item stays a note";
writeFileSync("out/join-cost.json", JSON.stringify({ report, rows, screen: { boards: screen.length, withWork }, verdict }));
const table = rows.map((r) => `| ${r.id} | ${r.points} | ${r.looks} | ${r.links} | ${r.stopped} | ${r.off.toFixed(1)} | ${r.on.toFixed(1)} | ${(r.on - r.off).toFixed(1)} |`);
const noise = report.noiseFloor ? `${report.noiseFloor.p10.toFixed(3)} to ${report.noiseFloor.p90.toFixed(3)}` : "none";
const md = [
  `CPU: ${report.env.cpu}. Median ratio on/off: ${report.ratios["on"]!.median.toFixed(3)}. A/A band: ${noise}.`,
  `Group ratios on/off: ${Object.entries(groups).map(([g, r]) => `${g} ${r.toFixed(3)}`).join(", ")}.`,
  `Trigger of the free-space test: ${verdict}.`,
  `Boards of screen-v3 with join work: ${withWork} of ${screen.length}. Boards here with work and no new link: ${closed} of ${rows.length}.`,
  "",
  "| Board | Points | Looks | New links | Stopped | off ms | on ms | Added ms |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...table,
].join("\n");
writeFileSync("out/join-cost.md", `${md}\n`);
console.log(md);
