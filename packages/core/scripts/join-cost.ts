// The time of the join of the corner graph (CORNER-REACH). This run only reports: it is not a gate.
// The gates of a pull request run on boards where the join does nothing, so they cannot show its time.
// The arms are one job in one process, in turn on each input, with an A/A arm (MEASURE-ISOLATE).
// `node packages/core/scripts/join-cost.ts --rounds 15` writes `out/join-cost.json` and `out/join-cost.md`.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { highwaysRegistry } from "../src/families/index.ts";
import type { Node } from "../src/model.ts";
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

/** This function gives two copies of the boxes side by side, so that the board has twice the points of the family. */
function tiled(nodes: readonly Node[]): Node[] {
  const width = Math.max(...nodes.map((n) => n.box.x + n.box.w)) - Math.min(...nodes.map((n) => n.box.x));
  return [...nodes, ...nodes.map((n) => ({ ...n, id: `${n.id}~copy`, box: { ...n.box, x: n.box.x + width + 200 } }))];
}

/** This function gives the boards of the run. */
function boards(): Input<readonly Node[]>[] {
  const reg = highwaysRegistry();
  const out: Input<readonly Node[]>[] = [];
  for (const [size, dims] of SIZES) {
    for (const seed of SEEDS) {
      const { nodes } = reg.generate("maze", seed, dims as never).graph;
      out.push({ id: `${size}-${seed}`, group: size, value: nodes });
      if (size === "largest") out.push({ id: `tiled-${seed}`, group: "tiled", value: tiled(nodes) });
    }
  }
  return out;
}

const { values } = parseArgs({ options: { rounds: { type: "string", default: "15" } } });
const inputs = boards();
const report = measureIsolated({
  arms: [
    { id: "off", run: (nodes: readonly Node[]) => new WayFinder(nodes, { joinWork: 0 }) },
    { id: "on", run: (nodes: readonly Node[]) => new WayFinder(nodes) },
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
  const ways = new WayFinder(input.value!);
  const row = report.inputs.find((r) => r.id === input.id)!;
  return { id: input.id, points: ways.corners.points.length, stopped: ways.corners.joinStopped, off: row.median["off"]!, on: row.median["on"]! };
});
mkdirSync("out", { recursive: true });
writeFileSync("out/join-cost.json", JSON.stringify({ report, rows }));
const table = rows.map((r) => `| ${r.id} | ${r.points} | ${r.stopped} | ${r.off.toFixed(1)} | ${r.on.toFixed(1)} | ${(r.on - r.off).toFixed(1)} |`);
const noise = report.noiseFloor ? `${report.noiseFloor.p10.toFixed(3)} to ${report.noiseFloor.p90.toFixed(3)}` : "none";
const md = [
  `CPU: ${report.env.cpu}. Median ratio on/off: ${report.ratios["on"]!.median.toFixed(3)}. A/A band: ${noise}.`,
  "",
  "| Board | Points | Stopped | off ms | on ms | Added ms |",
  "| --- | --- | --- | --- | --- | --- |",
  ...table,
].join("\n");
writeFileSync("out/join-cost.md", `${md}\n`);
console.log(md);
