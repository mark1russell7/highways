// The probe of FAMILIES-WEEKLY batch 6: the counts of `straight` and `corners` on the three new families.
// It prints one JSON row for each board and router, and a summary for each claim of the prediction. Start: `node scripts/probe-families-6.ts [seeds]`.
import { highwaysRegistry } from "../src/families/index.ts";
import { graphInput } from "../src/bench/screen/forms.ts";
import { screen } from "../src/bench/screen/screen.ts";

const seeds = Number(process.argv[2] ?? 20);
const reg = highwaysRegistry();
type Row = { arm: string; family: string; seed: number; strategy: string; crossings: number; through: number; hard: number; hardBy: Record<string, number>; nodes: number; edges: number };
const rows: Row[] = [];

const run = (arm: string, family: string, count: number, dims: Record<string, number> = {}): void => {
  for (let seed = 0; seed < count; seed++) {
    const { graph } = reg.generate(family, seed, dims);
    const input = graphInput(graph, { id: `probe/${arm}/s${seed}`, set: "probe", family, seed });
    const { records } = screen("router", ["straight", "corners"], { inputs: [input], baseline: false });
    for (const r of records) {
      const hardBy = Object.fromEntries(Object.entries(r.hard ?? {}).filter(([, n]) => n > 0));
      const hard = Object.values(hardBy).reduce((s, n) => s + n, 0);
      rows.push({ arm, family, seed, strategy: r.strategy, crossings: r.measures["route.crossings"] ?? NaN, through: r.measures["route.through"] ?? NaN, hard, hardBy, nodes: graph.nodes.length, edges: graph.edges.length });
    }
  }
};
run("nested", "nested", seeds);
run("tree", "tree", seeds);
run("geometric", "geometric", seeds);
run("tree-cross-0", "tree", Math.min(seeds, 10), { cross: 0 });

for (const row of rows) console.log(JSON.stringify(row));
const of = (arm: string, strategy: string): Row[] => rows.filter((r) => r.arm === arm && r.strategy === strategy);
const sum = (list: readonly Row[], key: "crossings" | "through" | "hard"): number => list.reduce((s, r) => s + r[key], 0);
const clean = of("tree-cross-0", "straight");
console.log(
  JSON.stringify({
    "nested-corners-no-breaks": sum(of("nested", "corners"), "hard") === 0,
    nested: [sum(of("nested", "corners"), "hard"), sum(of("nested", "straight"), "hard")],
    "tree-straight-clean": clean.every((r) => r.crossings === 0 && r.through === 0),
    treeClean: clean.map((r) => [r.crossings, r.through]),
    "geometric-corners-not-over-straight": sum(of("geometric", "corners"), "crossings") <= sum(of("geometric", "straight"), "crossings"),
    geometric: [sum(of("geometric", "corners"), "crossings"), sum(of("geometric", "straight"), "crossings")],
    "tree-corners-no-breaks": sum(of("tree", "corners"), "hard") === 0,
    tree: [sum(of("tree", "corners"), "hard"), sum(of("tree", "straight"), "hard")],
  }),
);
