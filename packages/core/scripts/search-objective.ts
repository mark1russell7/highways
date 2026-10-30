// The objective of `search` (SEARCH-OBJECTIVE): `node scripts/search-objective.ts [--set screen-v3] [--seeds 5] [--dense 60,125,250] [--fixture <file>] [--out <file>]`.
// It runs `searchRun` with the default options and each seed on each input of the set, and on windows of the dense board.
// For each measured plan it keeps the score, the four terms of the score and the bench measures ink, R1 and R4 of its routes.
// Part 1: for each input, the Spearman correlation of the score delta of each move with the change of each measure, over the moves of all the seeds.
// The sign of a measure is turned, so a positive correlation means that a higher score gives a better measure.
// It also gives the correlation of each term of the score, so that a term that does not follow the measures is visible.
// Part 2: the start plan (0 evaluations) against the default (16), with the noise floor of 2 sd over the seeds, the effect and Holm over the measures.
// The workflow `Search objective` (.github/workflows/search-objective.yml) starts it. The runs go in CI, not on a local machine.
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { ambiguity, bundleStretch, inkSaved, mergeAngle } from "../src/bench/measures/bundles.ts";
import { totalTurn } from "../src/bench/measures/routes.ts";
import { measureQuality } from "../src/bench/quality.ts";
import { inputGraph, SCREEN_SETS, screenInputs } from "../src/bench/screen/index.ts";
import { follow } from "../src/highways/follow.ts";
import { SEARCH_DEFAULTS, searchRun, type SearchStep } from "../src/highways/search/index.ts";
import type { Graph, Route } from "../src/model.ts";

const opt = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const setId = opt("--set") ?? "screen-v3";
const seeds = Math.max(1, Number(opt("--seeds") ?? 5));
const dense = (opt("--dense") ?? "60,125,250").split(",").filter((x) => x.trim() !== "").map(Number);
const fixture = opt("--fixture") ?? fileURLToPath(new URL("./data/scale/route-scale-fixture.json.gz", import.meta.url));
const out = opt("--out");
const MEASURES = ["ink", "R1", "R4"] as const;
const TERMS = ["B1", "B3", "B4", "B6"] as const;
type MeasureKey = (typeof MEASURES)[number];
type TermKey = (typeof TERMS)[number];

/** One measured plan: its score, the weighted terms of its score and its bench measures. */
interface Point {
  readonly n: number;
  readonly from: number;
  readonly accepted: boolean;
  readonly score: number;
  readonly terms: Record<TermKey, number>;
  readonly measures: Record<MeasureKey, number>;
}

/** This function gives the window of the board: the `size` boxes with the lowest y, and the edges between them. */
function window(graph: Graph, size: number): Graph {
  const keep = new Set([...graph.nodes].sort((a, b) => a.box.y - b.box.y || (a.id < b.id ? -1 : 1)).slice(0, size).map((n) => n.id));
  return { ...graph, nodes: graph.nodes.filter((n) => keep.has(n.id)), edges: graph.edges.filter((e) => keep.has(e.source.node) && keep.has(e.target.node)) };
}

/** This function gives the Spearman rank correlation of two lists, with the mean rank for ties. A list with no spread gives `NaN`. */
function spearman(a: readonly number[], b: readonly number[]): number {
  const ranks = (xs: readonly number[]): number[] => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

/** This function gives the quantile `q` of the finite values, or `NaN` for no value. */
function quantile(xs: readonly number[], q: number): number {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * (at - lo);
}

/** This function gives the two-sided p of the exact sign test for `k` wins and `m` losses. */
function signP(k: number, m: number): number {
  const n = k + m;
  if (n === 0) return 1;
  let tail = 0;
  let c = 1;
  for (let i = 0; i <= Math.min(k, m); i++) {
    tail += c;
    c = (c * (n - i)) / (i + 1);
  }
  return Math.min(1, (2 * tail) / 2 ** n);
}

/** This function gives the Holm-adjusted p values, in the order of the input. */
function holm(ps: readonly number[]): number[] {
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const adj = new Array<number>(ps.length);
  let run = 0;
  order.forEach(([p, i], r) => {
    run = Math.max(run, Math.min(1, (ps.length - r) * p));
    adj[i] = run;
  });
  return adj;
}

/** This function measures one plan: the weighted terms of the score of `search` and the bench measures ink, R1 and R4. */
function measure(graph: Graph, step: SearchStep, first: readonly Route[]): Point {
  const routes = step.result.routes;
  const o = SEARCH_DEFAULTS;
  const terms: Record<TermKey, number> = {
    B1: o.inkWeight * inkSaved(routes),
    B3: -o.stretchWeight * bundleStretch(routes, first).q95,
    B4: -o.ambiguityWeight * ambiguity(graph, routes).value,
    B6: (-o.angleWeight * mergeAngle(routes)) / 180,
  };
  const q = measureQuality(graph, step.result);
  return { n: step.n, from: step.from, accepted: step.accepted, score: step.score, terms, measures: { ink: q.ink, R1: q.crossings, R4: totalTurn(routes).mean } };
}

/** The record of one input: the points of each seed, the time of each seed and the start plan. */
interface InputRecord {
  readonly id: string;
  readonly family: string;
  readonly nodes: number;
  readonly edges: number;
  readonly runs: { readonly seed: number; readonly ms: number; readonly best: number; readonly points: Point[] }[];
}

const inputs: { id: string; family: string; graph: Graph }[] = [];
const set = SCREEN_SETS[setId];
if (!set) throw new Error(`There is no screen set "${setId}".`);
for (const input of screenInputs(set)) inputs.push({ id: input.id, family: input.family, graph: inputGraph(input) });
if (dense.length > 0) {
  const bytes = readFileSync(fixture);
  const doc = JSON.parse((fixture.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8")) as { graph: Graph };
  for (const size of dense) inputs.push({ id: `dense/${size}`, family: "dense", graph: window(doc.graph, size) });
}

const records: InputRecord[] = [];
const lines: string[] = [];
for (const { id, family, graph } of inputs) {
  if (graph.edges.length === 0) continue;
  const first = follow(graph, { highways: [] }).routes;
  const runs: InputRecord["runs"] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const points: Point[] = [];
    let best = 0;
    const t0 = performance.now();
    searchRun({ graph }, { ...SEARCH_DEFAULTS, seed }, (step) => points.push(measure(graph, step, first)));
    const ms = performance.now() - t0;
    // The best plan is the first plan with the best score, as `searchRun` keeps it.
    let bestScore = -Infinity;
    for (const p of points) if (p.score > bestScore + 1e-12) [best, bestScore] = [p.n, p.score];
    runs.push({ seed, ms, best, points });
  }
  const record: InputRecord = { id, family, nodes: graph.nodes.length, edges: graph.edges.length, runs };
  records.push(record);
  lines.push(JSON.stringify(record));
}
if (out) writeFileSync(out, lines.join("\n") + "\n");

const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : "-");
const pct = (x: number): string => `${Math.round(100 * x)}%`;

/** This function gives the correlation of one input for one measure, against the score delta or the delta of one term. */
function correlation(r: InputRecord, m: MeasureKey, by: (p: Point) => number): number {
  const ds: number[] = [];
  const dm: number[] = [];
  for (const run of r.runs) {
    const at = new Map(run.points.map((p) => [p.n, p] as const));
    for (const p of run.points) {
      const base = at.get(p.from);
      if (!base) continue;
      ds.push(by(p) - by(base));
      dm.push(base.measures[m] - p.measures[m]);
    }
  }
  return spearman(ds, dm);
}

const out1: string[] = [];
out1.push(`## SEARCH-OBJECTIVE on \`${setId}\` and the dense windows ${dense.join(", ")}`, "");
out1.push(`${records.length} inputs, ${seeds} seeds, the default options (evaluations ${SEARCH_DEFAULTS.evaluations}). A positive correlation means that a higher score gives a better measure.`, "");
out1.push("### Part 1: the score delta of each move against the change of each measure", "");
out1.push("| Measure | Median ρ | p10 | p90 | ρ > 0.3 | ρ < 0 | No spread |", "|---|---:|---:|---:|---:|---:|---:|");
for (const m of MEASURES) {
  const rs = records.map((r) => correlation(r, m, (p) => p.score));
  const ok = rs.filter(Number.isFinite);
  out1.push(`| ${m} | ${f(quantile(ok, 0.5))} | ${f(quantile(ok, 0.1))} | ${f(quantile(ok, 0.9))} | ${pct(ok.filter((x) => x > 0.3).length / Math.max(1, ok.length))} | ${pct(ok.filter((x) => x < 0).length / Math.max(1, ok.length))} | ${rs.length - ok.length} |`);
}
out1.push("", "### The median ρ of each term of the score", "", `| Term | ${MEASURES.join(" | ")} |`, `|---|${MEASURES.map(() => "---:").join("|")}|`);
for (const t of TERMS) out1.push(`| ${t} | ${MEASURES.map((m) => f(quantile(records.map((r) => correlation(r, m, (p) => p.terms[t])), 0.5))).join(" | ")} |`);
out1.push("", "### The median ρ of the score for each family", "", `| Family | Inputs | ${MEASURES.join(" | ")} |`, `|---|---:|${MEASURES.map(() => "---:").join("|")}|`);
for (const fam of [...new Set(records.map((r) => r.family))]) {
  const rs = records.filter((r) => r.family === fam);
  out1.push(`| ${fam} | ${rs.length} | ${MEASURES.map((m) => f(quantile(rs.map((r) => correlation(r, m, (p) => p.score)), 0.5))).join(" | ")} |`);
}

// Part 2: the start plan against the best plan of the default. The start plan does not depend on the seed. The floor is 2 sd of the best plans over the seeds.
out1.push("", "### Part 2: 0 evaluations (the start plan) against the default", "");
out1.push("A gain is a start plan better than the mean of the default by more than 2 sd over the seeds. The effect is the ratio start / default, lower is better.", "");
out1.push("| Measure | Gains | Drops | Within the floor | Effect median | p10 | p90 | Sign p | Holm p |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|");
const part2 = MEASURES.map((m) => {
  let gains = 0;
  let drops = 0;
  const effects: number[] = [];
  for (const r of records) {
    const start = r.runs[0]!.points[0]!.measures[m];
    const vals = r.runs.map((run) => run.points.find((p) => p.n === run.best)!.measures[m]);
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, vals.length - 1));
    if (start < mean - 2 * sd - 1e-9) gains++;
    else if (start > mean + 2 * sd + 1e-9) drops++;
    if (mean > 0) effects.push(start / mean);
  }
  return { m, gains, drops, effects, p: signP(gains, drops) };
});
const adjusted = holm(part2.map((x) => x.p));
part2.forEach((x, i) =>
  out1.push(`| ${x.m} | ${x.gains} | ${x.drops} | ${records.length - x.gains - x.drops} | ${f(quantile(x.effects, 0.5))} | ${f(quantile(x.effects, 0.1))} | ${f(quantile(x.effects, 0.9))} | ${f(x.p, 4)} | ${f(adjusted[i]!, 4)} |`),
);
const msAll = records.flatMap((r) => r.runs.map((run) => run.ms));
out1.push("", `The median time of one run of the default: ${f(quantile(msAll, 0.5), 1)} ms. The time includes the bench measures of each plan.`);
console.log(out1.join("\n"));
