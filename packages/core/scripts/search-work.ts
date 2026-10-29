// The unit of the work budget of `search` (SEARCH-BUDGET): `node scripts/search-work.ts [--fixture <file>] [--sizes <n,n>] [--evaluations <n,n>] [--repeat <n>] [--out <file>]`.
// It takes windows of the dense board: the boxes with the lowest y, up to each size, and the edges between them.
// On each window it times `searchPlan` with 1 evaluation and with each count of `--evaluations`. One evaluation also makes the pool and the first routes.
// The extra time is the time minus the time with 1 evaluation. The work is the edges times the evaluations after the first.
// It fits the extra time against the work, and it writes the slope, the R² and each point. A budget in edge routes bounds the time only when the fit is near a line.
// It also times each part of one evaluation on each window: `follow` of the start plan, and each term of `searchScore`.
// The workflow `Search work` (.github/workflows/search-work.yml) starts it. Times run in CI only, not on a local machine.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { ambiguity, bundleStretch, inkSaved, mergeAngle } from "../src/bench/measures/bundles.ts";
import { tidyPlan } from "../src/highways/base.ts";
import { follow } from "../src/highways/follow.ts";
import { candidatePlan } from "../src/highways/select/index.ts";
import { SEARCH_DEFAULTS, searchPlan, type Graph } from "../src/index.ts";

const opt = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const numbers = (text: string): number[] => text.split(",").map((x) => Number(x.trim()));
const fixture = opt("--fixture") ?? fileURLToPath(new URL("./data/scale/route-scale-fixture.json.gz", import.meta.url));
const sizes = numbers(opt("--sizes") ?? "60,125,250,500,1000");
const counts = numbers(opt("--evaluations") ?? "2,4,8");
const repeat = Math.max(1, Number(opt("--repeat") ?? 1));
const out = opt("--out");

/** This function gives the window of the board: the `size` boxes with the lowest y, and the edges between them. */
function window(graph: Graph, size: number): Graph {
  const keep = new Set([...graph.nodes].sort((a, b) => a.box.y - b.box.y || (a.id < b.id ? -1 : 1)).slice(0, size).map((n) => n.id));
  return { ...graph, nodes: graph.nodes.filter((n) => keep.has(n.id)), edges: graph.edges.filter((e) => keep.has(e.source.node) && keep.has(e.target.node)) };
}

/** This function gives the median time in ms of `searchPlan` on a graph with a count of evaluations. */
function time(graph: Graph, evaluations: number): number {
  const times: number[] = [];
  for (let i = 0; i < repeat; i++) {
    const t0 = performance.now();
    searchPlan({ graph }, { ...SEARCH_DEFAULTS, evaluations });
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1]!;
}

/** This function gives the median time in ms of a function. */
function timeOf(f: () => unknown): number {
  const times: number[] = [];
  for (let i = 0; i < repeat; i++) {
    const t0 = performance.now();
    f();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1]!;
}

const bytes = readFileSync(fixture);
const doc = JSON.parse((fixture.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8")) as { graph: Graph };
if (out) writeFileSync(out, "");
const parts: { nodes: number; edges: number; follow: number; ink: number; stretch: number; ambiguity: number; angle: number }[] = [];
const points: { nodes: number; edges: number; evaluations: number; work: number; ms: number; extra: number }[] = [];
for (const size of sizes) {
  const graph = window(doc.graph, size);
  const plan = tidyPlan(candidatePlan({ graph }, SEARCH_DEFAULTS.from));
  const routes = follow(graph, plan).routes;
  const first = follow(graph, { highways: [] }).routes;
  const part = {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    follow: Math.round(timeOf(() => follow(graph, plan))),
    ink: Math.round(timeOf(() => inkSaved(routes))),
    stretch: Math.round(timeOf(() => bundleStretch(routes, first))),
    ambiguity: Math.round(timeOf(() => ambiguity(graph, routes))),
    angle: Math.round(timeOf(() => mergeAngle(routes))),
  };
  parts.push(part);
  console.error(JSON.stringify(part));
  const base = time(graph, 1);
  for (const evaluations of counts) {
    const ms = time(graph, evaluations);
    const point = { nodes: graph.nodes.length, edges: graph.edges.length, evaluations, work: graph.edges.length * (evaluations - 1), ms: Math.round(ms), extra: Math.round(ms - base) };
    points.push(point);
    if (out) appendFileSync(out, JSON.stringify(point) + "\n");
    console.error(JSON.stringify(point));
  }
}

// The least-squares line through the origin, extra = slope × work, and its R² against the mean.
const sxy = points.reduce((s, p) => s + p.work * p.extra, 0);
const sxx = points.reduce((s, p) => s + p.work * p.work, 0);
const slope = sxx > 0 ? sxy / sxx : 0;
const mean = points.reduce((s, p) => s + p.extra, 0) / Math.max(1, points.length);
const ssRes = points.reduce((s, p) => s + (p.extra - slope * p.work) ** 2, 0);
const ssTot = points.reduce((s, p) => s + (p.extra - mean) ** 2, 0);
const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
// The slope of each window, so a slope that grows with the edges shows a cost that is more than linear in the work.
const perWindow = sizes.map((size) => {
  const own = points.filter((p) => p.nodes === Math.min(size, doc.graph.nodes.length));
  const xy = own.reduce((s, p) => s + p.work * p.extra, 0);
  const xx = own.reduce((s, p) => s + p.work * p.work, 0);
  return { nodes: own[0]?.nodes ?? size, edges: own[0]?.edges ?? 0, msPerKiloWork: xx > 0 ? (1000 * xy) / xx : 0 };
});
const lines = [
  "## The unit of the work budget of search",
  "",
  `The fit: extra ms = ${(1000 * slope).toFixed(3)} × work / 1000, with R² ${r2.toFixed(3)} over ${points.length} points.`,
  "",
  "| Boxes | Edges | ms for each 1000 edge routes |",
  "|---:|---:|---:|",
  ...perWindow.map((w) => `| ${w.nodes} | ${w.edges} | ${w.msPerKiloWork.toFixed(1)} |`),
  "",
  "The ms of each part of one evaluation:",
  "",
  "| Boxes | Edges | follow | ink | stretch | ambiguity | angle |",
  "|---:|---:|---:|---:|---:|---:|---:|",
  ...parts.map((p) => `| ${p.nodes} | ${p.edges} | ${p.follow} | ${p.ink} | ${p.stretch} | ${p.ambiguity} | ${p.angle} |`),
  "",
  "| Boxes | Edges | Evaluations | Work | ms | Extra ms |",
  "|---:|---:|---:|---:|---:|---:|",
  ...points.map((p) => `| ${p.nodes} | ${p.edges} | ${p.evaluations} | ${p.work} | ${p.ms} | ${p.extra} |`),
];
console.log(lines.join("\n"));
