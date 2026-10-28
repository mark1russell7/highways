// The command line of the exact solves of MEAS2: fixed-charge network design (HWY-040), solved with HiGHS. Start it only in CI, with the workflow `Exact`.
// `pnpm exact --ladder --sizes 10,14,18 [--classes uniform,hubs] [--seeds 0,1,2] [--caps 1.5] [--rules collection,all] [--seconds 300] [--shard 0/8] --out ladder.jsonl`
// solves boards of each size, to find the largest size with a proven optimum within the time limit.
// `pnpm exact --set exact-v1 [--caps 1.1,1.25,1.5] [--rules collection,all] [--seconds 300] [--shard 0/8] --out optima.jsonl` solves each input of the set.
// `pnpm exact --merge <dir> --set exact-v1 --out optima-exact-v1.json` joins the lines of each shard into the file of the optima.
// Each line has the input, its hash, the rule, the cap, the status, the proof, the objective, the bound, the MIP gap, the time, and B1 and the largest B3 of the plan.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import highsModule from "highs";
import { solveExact, planMeasures, type HighsLike } from "../src/bench/exact/solve.ts";
import type { ExactRule } from "../src/bench/exact/index.ts";
import { EXACT_CLASSES, exactBoard, exactGenerator, type ExactClass } from "../src/bench/screen/exact-set.ts";
import { graphInput, inputGraph, type LayoutInput } from "../src/bench/screen/forms.ts";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/set.ts";
import { optimaFile, type ExactOptimum } from "../src/bench/screen/gap.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const list = (name: string): string[] | undefined =>
  opt(name)
    ?.split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
const out = opt("--out") ?? "exact.jsonl";
const setId = opt("--set") ?? "exact-v1";
const run =
  process.env["GITHUB_RUN_ID"] !== undefined
    ? `${process.env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${process.env["GITHUB_REPOSITORY"] ?? ""}/actions/runs/${process.env["GITHUB_RUN_ID"]}`
    : undefined;
const commit = process.env["GITHUB_SHA"]?.slice(0, 7);

// The merge: the lines of each shard, at any depth of the folder, become one file.
const mergeDir = opt("--merge");
if (mergeDir !== undefined) {
  const files = (dir: string): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith(".jsonl") ? [join(dir, n)] : []));
  const rows = files(mergeDir).flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as ExactOptimum),
  );
  const seconds = Number(opt("--seconds") ?? 300);
  const file = optimaFile(setId, rows, { seconds, ...(commit ? { commit } : {}), ...(run ? { run } : {}) });
  writeFileSync(out, JSON.stringify(file, null, 1) + "\n");
  // The summary: one row for each size, class, rule and cap, with the proven count, the times and the largest MIP gap.
  const groups = new Map<string, ExactOptimum[]>();
  for (const r of file.optima) {
    const key = `${String(r.nodes).padStart(4, "0")}|${r.class}|${r.rule}|${r.cap}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const med = (v: readonly number[]): number => {
    const s = [...v].sort((a, b) => a - b);
    return s.length === 0 ? Number.NaN : s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  };
  const f = (v: number | null | undefined, d = 3): string => (v === null || v === undefined || Number.isNaN(v) ? "-" : v.toFixed(d));
  const text = [
    `## The exact solves of \`${setId}\``,
    "",
    `${file.optima.length} solves, ${file.optima.filter((o) => o.proven).length} proven, ${seconds} s each at most.`,
    "",
    "| nodes | class | rule | cap | solves | proven | median s | max s | largest MIP gap | median binaries | median B1 |",
    "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...[...groups.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, g]) => {
        const r = g[0]!;
        const gaps = g.map((x) => (x.proven ? 0 : (x.mipGap ?? Number.POSITIVE_INFINITY)));
        const b1 = g.flatMap((x) => (x.b1 === null ? [] : [x.b1]));
        return `| ${r.nodes} | ${r.class} | ${r.rule} | ${r.cap} | ${g.length} | ${g.filter((x) => x.proven).length} | ${f(med(g.map((x) => x.seconds)), 1)} | ${f(Math.max(...g.map((x) => x.seconds)), 1)} | ${f(Math.max(...gaps), 4)} | ${f(med(g.map((x) => x.binaries)), 0)} | ${f(med(b1))} |`;
      }),
    "",
  ].join("\n");
  const summary = opt("--summary");
  if (summary) writeFileSync(summary, text);
  console.log(text);
  console.log(`${file.optima.length} optima of ${setId} in ${out}: ${file.optima.filter((o) => o.proven).length} proven.`);
  process.exit(0);
}

// The types of `highs` describe a CommonJS module, but Node loads its ES module. Its loader is the default export of either form.
const loadHighs = (highsModule.default ?? highsModule) as unknown as () => Promise<HighsLike>;
const highs = await loadHighs();

const seconds = Number(opt("--seconds") ?? 300);
const caps = (list("--caps") ?? ["1.1", "1.25", "1.5"]).map(Number);
const rules = (list("--rules") ?? ["collection", "all"]) as ExactRule[];
const [shard, shards] = (opt("--shard") ?? "0/1").split("/").map(Number) as [number, number];

/** The inputs: the boards of the ladder, or the inputs of a set. */
const inputs: { input: LayoutInput; cls: string }[] = [];
if (args.includes("--ladder")) {
  const sizes = (list("--sizes") ?? ["10", "14", "18", "24", "30", "40"]).map(Number);
  const classes = (list("--classes") ?? [...EXACT_CLASSES]) as ExactClass[];
  const seeds = (list("--seeds") ?? ["0", "1", "2"]).map(Number);
  for (const n of sizes)
    for (const cls of classes)
      for (const k of seeds) {
        const family = `${cls}-n${n}`;
        const head = { id: `exact-ladder/${family}/s${k}`, set: "exact-ladder", family, seed: k, generator: exactGenerator(cls, n, k) };
        inputs.push({ input: graphInput(exactBoard(cls, n, k), head), cls });
      }
} else {
  const set = SCREEN_SETS[setId];
  if (!set) throw new Error(`There is no screen set "${setId}". The sets are ${Object.keys(SCREEN_SETS).join(", ")}.`);
  for (const input of screenInputs(set)) inputs.push({ input, cls: input.family });
}

const tasks = inputs.flatMap(({ input, cls }) => rules.flatMap((rule) => caps.map((cap) => ({ input, cls, rule, cap }))));
const mine = tasks.filter((_, i) => i % shards === shard);
process.stderr.write(`${mine.length} of ${tasks.length} solves in the shard ${shard}/${shards}, ${seconds} s each at most.\n`);
const lines: string[] = [];
for (const { input, cls, rule, cap } of mine) {
  const graph = inputGraph(input);
  let row: ExactOptimum;
  try {
    const s = solveExact(highs, graph, { stretch: cap, rule, seconds });
    const m = s.objective === null ? undefined : planMeasures(graph, s.plan);
    row = {
      input: input.id,
      hash: input.hash,
      class: cls,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      rule,
      cap,
      status: s.status,
      proven: s.proven,
      objective: s.objective,
      bound: s.bound,
      mipGap: s.mipGap,
      seconds: Math.round(s.seconds * 10) / 10,
      binaries: s.binaries,
      b1: m === undefined ? null : Math.round(m.b1 * 1e6) / 1e6,
      modelB1: s.modelB1 === null ? null : Math.round(s.modelB1 * 1e6) / 1e6,
      b3max: m === undefined ? null : Math.round(m.b3max * 1e6) / 1e6,
      highways: s.plan.highways.length,
    };
  } catch (e) {
    // A model that does not fit in the memory of the WebAssembly runtime throws. The line keeps the error.
    row = { input: input.id, hash: input.hash, class: cls, nodes: graph.nodes.length, edges: graph.edges.length, rule, cap, status: `error: ${String(e).slice(0, 120)}`, proven: false, objective: null, bound: null, mipGap: null, seconds: 0, binaries: 0, b1: null, modelB1: null, b3max: null, highways: 0 };
  }
  process.stderr.write(
    `exact ${row.input} rule=${rule} cap=${cap} nodes=${row.nodes} edges=${row.edges} binaries=${row.binaries} status=${row.status} gap=${row.mipGap} seconds=${row.seconds} b1=${row.b1} modelB1=${row.modelB1} b3max=${row.b3max}\n`,
  );
  lines.push(JSON.stringify(row));
  writeFileSync(out, lines.join("\n") + "\n");
}
writeFileSync(out, lines.join("\n") + (lines.length > 0 ? "\n" : ""));
