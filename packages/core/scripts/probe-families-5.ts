// The probe of FAMILIES-WEEKLY batch 5: the counts of `straight` and `corners` on the three new families at their defaults.
// It prints one JSON row for each board and router, and a summary for each claim of the prediction. Start: `node scripts/probe-families-5.ts [seeds]`.
import { highwaysRegistry } from "../src/families/index.ts";
import { graphInput } from "../src/bench/screen/forms.ts";
import { screen } from "../src/bench/screen/screen.ts";

const seeds = Number(process.argv[2] ?? 20);
const reg = highwaysRegistry();
const rows: { family: string; seed: number; strategy: string; crossings: number; through: number; hard: number; edges: number; xCells?: number; farEdges?: number }[] = [];

for (const family of ["layered", "lattice-x", "arc-row"]) {
  for (let seed = 0; seed < seeds; seed++) {
    const { graph } = reg.generate(family, seed);
    const input = graphInput(graph, { id: `probe/${family}/s${seed}`, set: "probe", family, seed });
    const extra: { xCells?: number; farEdges?: number } = {};
    if (family === "lattice-x") {
      const keys = new Set(graph.edges.map((e) => `${e.source.node}|${e.target.node}`));
      let x = 0;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) if (keys.has(`n${r}_${c}|n${r + 1}_${c + 1}`) && keys.has(`n${r}_${c + 1}|n${r + 1}_${c}`)) x++;
      extra.xCells = x;
    }
    if (family === "arc-row") extra.farEdges = graph.edges.filter((e) => Math.abs(Number(e.source.node.slice(1)) - Number(e.target.node.slice(1))) > 1).length;
    const { records } = screen("router", ["straight", "corners"], { inputs: [input], baseline: false });
    for (const r of records) {
      const hard = Object.values(r.hard ?? {}).reduce((s, n) => s + n, 0);
      rows.push({ family, seed, strategy: r.strategy, crossings: r.measures["route.crossings"] ?? NaN, through: r.measures["route.through"] ?? NaN, hard, edges: graph.edges.length, ...extra });
    }
  }
}
for (const row of rows) console.log(JSON.stringify(row));
const of = (family: string, strategy: string) => rows.filter((r) => r.family === family && r.strategy === strategy);
const lattice = of("lattice-x", "straight").slice(0, 10);
const arc = of("arc-row", "straight").slice(0, 10);
const sum = (list: typeof rows, key: "crossings" | "through" | "hard") => list.reduce((s, r) => s + r[key], 0);
console.log(
  JSON.stringify({
    "lattice-straight-crossings-exact": lattice.every((r) => r.crossings === r.xCells),
    lattice: lattice.map((r) => [r.crossings, r.xCells]),
    "arc-row-straight-through-exact": arc.every((r) => r.through === r.farEdges),
    arc: arc.map((r) => [r.through, r.farEdges]),
    "corners-no-breaks-defaults": ["layered", "lattice-x", "arc-row"].map((f) => [f, sum(of(f, "corners"), "hard")]),
    "layered-corners-under-straight": [sum(of("layered", "corners"), "crossings"), sum(of("layered", "straight"), "crossings")],
  }),
);
