// The unit of the work budget of `search` (SEARCH-BUDGET): `node scripts/search-work.ts [--fixture <file>] [--sizes <n,n>] [--evaluations <n,n>] [--min-ms <n>] [--out <file>]`.
// With `--stops <file>`, it writes the stop records of gate (b) and no times: `node scripts/search-work.ts --stops <file> [--sizes <n,n>] [--budgets <n,n>]`.
// It takes windows of the dense board: the boxes with the lowest y, up to each size, and the edges between them.
// On each window it runs `searchRun` with 1 evaluation and with each count of `--evaluations`. It keeps the time and the work counters of `src/work.ts`.
// The extra time and the extra counts are the values minus the values with 1 evaluation. One evaluation also makes the pool and the first routes.
// A window with fewer edges than `--scale-edges` multiplies the counts of evaluations, so that its extra time is well above the noise.
// It fits the extra time against the units of `workUnits`, and it writes the R² and the slope of each window. Gate (a) needs R² ≥ 0.95 and each slope within ±20%.
// It also fits the weights of the counters with no negative weight, and it writes the gate with those weights.
// The lane steps of one evaluation are the size of the pair loop of the lane order. INCREMENTAL-SEARCH takes them as its baseline.
// Each point gets `env`, the computer and the mode of its time (MEASURE-ISOLATE). The fit uses the times of one arm only, so it is not a paired comparison.
// The workflow `Search work` (.github/workflows/search-work.yml) starts it. Times run in CI only, not on a local machine.
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { gateLine, jobModels, writeGateLine, type CaseRead } from "@mark1russell7/rigor-bench";
import { SEARCH_DEFAULTS, searchRun, type Graph } from "../src/index.ts";
import { WORK_WEIGHTS, workCounts, workUnits, type WorkCounts } from "../src/work.ts";
import { envOf, type RecordEnv } from "./gates/paired.ts";

const opt = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const numbers = (text: string): number[] => text.split(",").map((x) => Number(x.trim()));
const fixture = opt("--fixture") ?? fileURLToPath(new URL("./data/scale/route-scale-fixture.json.gz", import.meta.url));
const stops = opt("--stops");
const sizes = numbers(opt("--sizes") ?? (stops ? "60,125,250,500" : "60,125,250,500,1000"));
const counts = numbers(opt("--evaluations") ?? "2,4,8");
const budgets = numbers(opt("--budgets") ?? "1,10,100,1000");
const minMs = Math.max(0, Number(opt("--min-ms") ?? 2000));
const scaleEdges = Math.max(0, Number(opt("--scale-edges") ?? 4000));
const out = opt("--out");
const KEYS = ["lane", "corner", "sight", "score", "route"] as const;

/** This function gives the window of the board: the `size` boxes with the lowest y, and the edges between them. */
function window(graph: Graph, size: number): Graph {
  const keep = new Set([...graph.nodes].sort((a, b) => a.box.y - b.box.y || (a.id < b.id ? -1 : 1)).slice(0, size).map((n) => n.id));
  return { ...graph, nodes: graph.nodes.filter((n) => keep.has(n.id)), edges: graph.edges.filter((e) => keep.has(e.source.node) && keep.has(e.target.node)) };
}

const minus = (a: WorkCounts, b: WorkCounts): WorkCounts => ({ lane: a.lane - b.lane, corner: a.corner - b.corner, sight: a.sight - b.sight, score: a.score - b.score, route: a.route - b.route });

/** This function gives the median time in ms of `searchRun` with a count of evaluations, and the counts of one run. It repeats the run up to `minMs` in all, at most 9 times. */
function run(graph: Graph, evaluations: number): { ms: number; counts: WorkCounts } {
  const times: number[] = [];
  let counts: WorkCounts | undefined;
  let spent = 0;
  while (times.length === 0 || (spent < minMs && times.length < 9)) {
    const from = workCounts();
    const t0 = performance.now();
    searchRun({ graph }, { ...SEARCH_DEFAULTS, evaluations });
    const ms = performance.now() - t0;
    counts = minus(workCounts(), from);
    times.push(ms);
    spent += ms;
  }
  times.sort((a, b) => a - b);
  return { ms: times[times.length >> 1]!, counts: counts! };
}

const bytes = readFileSync(fixture);
const doc = JSON.parse((fixture.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8")) as { graph: Graph };

if (stops) {
  // Gate (b): each budget stops at the same plan on each platform. The records hold the evaluations, the work and the hash of the plan, with no time.
  const lines: string[] = [];
  for (const size of sizes) {
    const graph = window(doc.graph, size);
    for (const work of budgets) {
      const r = searchRun({ graph }, { ...SEARCH_DEFAULTS, work });
      const hash = createHash("sha256").update(JSON.stringify(r.plan)).digest("hex").slice(0, 16);
      lines.push(JSON.stringify({ nodes: graph.nodes.length, edges: graph.edges.length, budget: work, evaluations: r.evaluations, work: r.work, plan: hash }));
      console.error(lines[lines.length - 1]);
    }
  }
  writeFileSync(stops, lines.join("\n") + "\n");
  process.exit(0);
}

if (out) writeFileSync(out, "");
interface Point {
  nodes: number;
  edges: number;
  evaluations: number;
  counts: WorkCounts;
  ms: number;
  extra: number;
  /** The computer and the mode of the time (MEASURE-ISOLATE). */
  env?: RecordEnv;
}
const env = envOf("process");
const points: Point[] = [];
const loop: { nodes: number; edges: number; lane: number; corner: number; sight: number; score: number; route: number }[] = [];
for (const size of sizes) {
  const graph = window(doc.graph, size);
  // The first run warms the code of the window, and its time does not count.
  searchRun({ graph }, { ...SEARCH_DEFAULTS, evaluations: 1 });
  const base = run(graph, 1);
  // A small window takes more evaluations, so that its extra time is well above the noise of the machine.
  const scale = Math.max(1, Math.floor(scaleEdges / Math.max(1, graph.edges.length)));
  for (const evaluations of counts.map((c) => c * scale)) {
    const r = run(graph, evaluations);
    const point: Point = { nodes: graph.nodes.length, edges: graph.edges.length, evaluations, counts: minus(r.counts, base.counts), ms: Math.round(r.ms), extra: r.ms - base.ms, env };
    points.push(point);
    if (out) appendFileSync(out, JSON.stringify(point) + "\n");
    console.error(JSON.stringify(point));
  }
  const last = points[points.length - 1]!;
  const per = Math.max(1, last.evaluations - 1);
  loop.push({ nodes: last.nodes, edges: last.edges, lane: last.counts.lane / per, corner: last.counts.corner / per, sight: last.counts.sight / per, score: last.counts.score / per, route: last.counts.route / per });
}

/** This function gives the fit through the origin of the extra time against the units of the weights. The fit has the slope, the R² and the slope of each window. */
function gate(weights: Readonly<WorkCounts>): { slope: number; r2: number; windows: { nodes: number; edges: number; slope: number; off: number }[]; pass: boolean } {
  const xs = points.map((p) => workUnits(p.counts, weights));
  const sxy = points.reduce((s, p, i) => s + xs[i]! * p.extra, 0);
  const sxx = xs.reduce((s, x) => s + x * x, 0);
  const slope = sxx > 0 ? sxy / sxx : 0;
  const mean = points.reduce((s, p) => s + p.extra, 0) / Math.max(1, points.length);
  const ssRes = points.reduce((s, p, i) => s + (p.extra - slope * xs[i]!) ** 2, 0);
  const ssTot = points.reduce((s, p) => s + (p.extra - mean) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  const nodes = [...new Set(points.map((p) => p.nodes))];
  const windows = nodes.map((n) => {
    const own = points.map((p, i) => ({ p, x: xs[i]! })).filter((q) => q.p.nodes === n);
    const xy = own.reduce((s, q) => s + q.x * q.p.extra, 0);
    const xx = own.reduce((s, q) => s + q.x * q.x, 0);
    const w = xx > 0 ? xy / xx : 0;
    return { nodes: n, edges: own[0]!.p.edges, slope: w, off: slope > 0 ? w / slope - 1 : 0 };
  });
  // FAIL-CLOSED: with no point, R² is 1 and there is no window, so the fit must have points to pass.
  return { slope, r2, windows, pass: points.length > 0 && r2 >= 0.95 && windows.every((w) => Math.abs(w.off) <= 0.2) };
}

/**
 * This function solves the least squares of the relative error of the extra time on the counts, with no negative weight. It tries each subset of the counters.
 * The gate compares the slopes of the windows, so each point has the weight 1 / extra². Thus a small window counts as much as a large window.
 */
function fitWeights(): WorkCounts {
  let best: { w: number[]; res: number } | undefined;
  for (let mask = 1; mask < 1 << KEYS.length; mask++) {
    const use = KEYS.map((_, i) => i).filter((i) => (mask >> i) & 1);
    // The normal equations of the counters in `use`, solved by Gauss elimination.
    const at = (p: Point): number => 1 / Math.max(1e-9, p.extra) ** 2;
    const a = use.map((i) => use.map((j) => points.reduce((s, p) => s + at(p) * p.counts[KEYS[i]!] * p.counts[KEYS[j]!], 0)));
    const b = use.map((i) => points.reduce((s, p) => s + at(p) * p.counts[KEYS[i]!] * p.extra, 0));
    const x = solve(a, b);
    if (!x || x.some((v) => v < 0)) continue;
    const w = KEYS.map(() => 0);
    use.forEach((i, k) => (w[i] = x[k]!));
    const res = points.reduce((s, p) => s + ((p.extra - KEYS.reduce((t, key, i) => t + w[i]! * p.counts[key], 0)) / Math.max(1e-9, p.extra)) ** 2, 0);
    if (!best || res < best.res) best = { w, res };
  }
  const w = best?.w ?? KEYS.map(() => 1);
  // The weights in units of one lane step, so the lane weight is 1 when the lane counter has a weight.
  const unit = w[0]! > 0 ? w[0]! : Math.max(...w);
  return { lane: w[0]! / unit, corner: w[1]! / unit, sight: w[2]! / unit, score: w[3]! / unit, route: w[4]! / unit };
}

function solve(a: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (Math.abs(m[p]![c]!) < 1e-300) return undefined;
    [m[c], m[p]] = [m[p]!, m[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

const fitted = fitWeights();
const now = gate(WORK_WEIGHTS);
const then = gate(fitted);
const table = (g: ReturnType<typeof gate>): string[] => [
  `The fit: extra ms = ${(1e6 * g.slope).toFixed(4)} × units / 1e6, with R² ${g.r2.toFixed(4)} over ${points.length} points. Gate (a): ${g.pass ? "pass" : "fail"}.`,
  "",
  "| Boxes | Edges | ms for each 1e6 units | Off the global slope |",
  "|---:|---:|---:|---:|",
  ...g.windows.map((w) => `| ${w.nodes} | ${w.edges} | ${(1e6 * w.slope).toFixed(4)} | ${(100 * w.off).toFixed(1)}% |`),
];
const weights = (w: Readonly<WorkCounts>): string => KEYS.map((k) => `${k} ${w[k].toPrecision(4)}`).join(", ");
const lines = [
  "## The unit of the work budget of search",
  "",
  `### The weights of \`WORK_WEIGHTS\`: ${weights(WORK_WEIGHTS)}`,
  "",
  ...table(now),
  "",
  `### The fitted weights: ${weights(fitted)}`,
  "",
  ...table(then),
  "",
  "### The counts of one evaluation (the lane steps are the size of the pair loop)",
  "",
  "| Boxes | Edges | lane | corner | sight | score | route |",
  "|---:|---:|---:|---:|---:|---:|---:|",
  ...loop.map((l) => `| ${l.nodes} | ${l.edges} | ${Math.round(l.lane)} | ${Math.round(l.corner)} | ${Math.round(l.sight)} | ${Math.round(l.score)} | ${Math.round(l.route)} |`),
  "",
  "### The points",
  "",
  "| Boxes | Edges | Evaluations | lane | corner | sight | score | route | ms | Extra ms |",
  "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...points.map((p) => `| ${p.nodes} | ${p.edges} | ${p.evaluations} | ${p.counts.lane} | ${p.counts.corner} | ${p.counts.sight} | ${p.counts.score} | ${p.counts.route} | ${p.ms} | ${Math.round(p.extra)} |`),
];
console.log(lines.join("\n"));
// Gate (a) reports only, so its job stays green. Thus a fail or a fit with no point writes a warning to the check line (NO-READ-LINE).
// The cases are the R² of the fit and the slope of each window. A fit with no point has no cases, and `gateLine` reads that as a no read.
const reads: CaseRead[] =
  points.length === 0
    ? []
    : [
        { case: `the R² over ${points.length} points`, outcome: now.r2 >= 0.95 ? "pass" : "beyond" },
        ...now.windows.map((w) => ({ case: `the window of ${w.nodes} boxes`, outcome: Math.abs(w.off) <= 0.2 ? "pass" : "beyond" })),
      ];
const off = now.windows.filter((w) => Math.abs(w.off) > 0.2).map((w) => `${w.nodes} boxes ${(100 * w.off).toFixed(1)}%`);
const why = points.length === 0 ? "The fit has no point" : `R² ${now.r2.toFixed(4)} with the limit 0.95${off.length === 0 ? "" : `, and the windows off the slope by more than 20%: ${off.join(", ")}`}`;
writeGateLine(gateLine(reads, { title: "Search work, gate (a)", enforced: false, reason: why, models: jobModels([env]) }), { log: (l) => console.error(l) });
