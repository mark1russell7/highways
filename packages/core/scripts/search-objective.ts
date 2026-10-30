// The objective of `search` (SEARCH-OBJECTIVE): `node scripts/search-objective.ts [--set screen-v3] [--seeds 5] [--dense 60,125,250] [--variants <list>] [--fixture <file>] [--out <file>]`.
// It runs `searchRun` with the default options and each seed on each input of the set, and on windows of the dense board.
// For each measured plan it keeps the score, the four terms of the score and the bench measures ink, R1 and R4 of its routes.
// Part 1: for each input, the Spearman correlation of the score delta of each move with the change of each measure, over the moves of all the seeds.
// The sign of a measure is turned, so a positive correlation means that a higher score gives a better measure.
// It also gives the correlation of each term of the score, so that a term that does not follow the measures is visible.
// Part 2: the start plan (0 evaluations) and each variant of `--variants` against the default, with the noise floor of 2 sd over the seeds, the effect and Holm.
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
import { SEARCH_DEFAULTS, searchRun, type SearchOptions, type SearchStep } from "../src/highways/search/index.ts";
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
/** The variants of the score that the screen compares with the default. The term `X` is the crossing term of `crossingWeight`. */
const DEFAULT_VARIANTS = "ink-only:stretchWeight=0,ambiguityWeight=0,angleWeight=0;half-penalties:stretchWeight=0.25,ambiguityWeight=0.25,angleWeight=0.125;cross-0.1:crossingWeight=0.1;cross-0.3:crossingWeight=0.3;cross-0.3-half:crossingWeight=0.3,stretchWeight=0.25,ambiguityWeight=0.25,angleWeight=0.125";
const MEASURES = ["ink", "R1", "R4"] as const;
const TERMS = ["B1", "B3", "B4", "B6", "X"] as const;
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

/** The options of one variant of the score: the default options with other weights. */
type Variant = { readonly name: string; readonly options: Readonly<SearchOptions> };

/** This function reads the variants: `name:key=value,key=value;name:...`. The variant `default` is always the first. */
function variants(text: string): Variant[] {
  const list: Variant[] = [{ name: "default", options: SEARCH_DEFAULTS }];
  for (const part of text.split(";").map((x) => x.trim()).filter(Boolean)) {
    const [name, body = ""] = part.split(":");
    const options: Record<string, number> = {};
    for (const kv of body.split(",").filter(Boolean)) {
      const [k, v] = kv.split("=");
      options[k!.trim()] = Number(v);
    }
    list.push({ name: name!.trim(), options: { ...SEARCH_DEFAULTS, ...options } });
  }
  return list;
}

/** This function measures one plan: the weighted terms of its score and the bench measures ink, R1 and R4. */
function measure(graph: Graph, step: SearchStep, first: readonly Route[], o: Readonly<SearchOptions>): Point {
  const routes = step.result.routes;
  const q = measureQuality(graph, step.result);
  const terms: Record<TermKey, number> = {
    B1: o.inkWeight * inkSaved(routes),
    B3: -o.stretchWeight * bundleStretch(routes, first).q95,
    B4: -o.ambiguityWeight * ambiguity(graph, routes).value,
    B6: (-o.angleWeight * mergeAngle(routes)) / 180,
    X: (-(o.crossingWeight ?? 0) * q.crossings) / Math.max(1, routes.length),
  };
  return { n: step.n, from: step.from, accepted: step.accepted, score: step.score, terms, measures: { ink: q.ink, R1: q.crossings, R4: totalTurn(routes).mean } };
}

/** The record of one input and one variant: the points of each seed and the time of each seed. */
interface InputRecord {
  readonly id: string;
  readonly family: string;
  readonly variant: string;
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

const VARIANTS = variants(opt("--variants") ?? DEFAULT_VARIANTS);
const byVariant = new Map<string, InputRecord[]>(VARIANTS.map((v) => [v.name, []]));
const lines: string[] = [];
for (const { id, family, graph } of inputs) {
  if (graph.edges.length === 0) continue;
  const first = follow(graph, { highways: [] }).routes;
  for (const v of VARIANTS) {
    const runs: InputRecord["runs"] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const points: Point[] = [];
      const o = { ...v.options, seed };
      const t0 = performance.now();
      searchRun({ graph }, o, (step) => points.push(measure(graph, step, first, o)));
      const ms = performance.now() - t0;
      // The best plan is the first plan with the best score, as `searchRun` keeps it.
      let best = 0;
      let bestScore = -Infinity;
      for (const p of points) if (p.score > bestScore + 1e-12) [best, bestScore] = [p.n, p.score];
      runs.push({ seed, ms, best, points });
    }
    const record: InputRecord = { id, family, variant: v.name, nodes: graph.nodes.length, edges: graph.edges.length, runs };
    byVariant.get(v.name)!.push(record);
    lines.push(JSON.stringify(record));
  }
}
if (out) writeFileSync(out, lines.join("\n") + "\n");

const f = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : "-");
const pct = (x: number): string => `${Math.round(100 * x)}%`;
const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: readonly number[]): number => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / Math.max(1, xs.length - 1));

/** This function gives the correlation of one input for one measure, against the score delta or the delta of one term. */
function correlation(r: InputRecord, m: MeasureKey, by: (p: Point) => number): number {
  const ds: number[] = [];
  const dm: number[] = [];
  for (const run of r.runs) {
    const at = new Map(run.points.map((p) => [p.n, p] as const));
    for (const p of run.points) {
      const from = at.get(p.from);
      if (!from) continue;
      ds.push(by(p) - by(from));
      dm.push(from.measures[m] - p.measures[m]);
    }
  }
  return spearman(ds, dm);
}

/** This function gives the values of a measure at the best plan of each seed. */
const bestValues = (r: InputRecord, m: MeasureKey): number[] => r.runs.map((run) => run.points.find((p) => p.n === run.best)!.measures[m]);

/** The comparison of one measure between two sets of values for each input, with the noise floor of 2 sd over the seeds. */
interface Test {
  readonly label: string;
  readonly m: MeasureKey;
  readonly gains: number;
  readonly drops: number;
  readonly within: number;
  readonly effects: number[];
  readonly p: number;
}

/** This function compares the values `a` with the values `b` of each input. A gain is a lower mean of `a` by more than 2 sd. The effect is `mean(a) / mean(b)`. */
function compare(label: string, m: MeasureKey, pairs: readonly (readonly [readonly number[], readonly number[]])[]): Test {
  let gains = 0;
  let drops = 0;
  const effects: number[] = [];
  for (const [a, b] of pairs) {
    const floor = 2 * Math.max(sd(a), sd(b));
    if (mean(a) < mean(b) - floor - 1e-9) gains++;
    else if (mean(a) > mean(b) + floor + 1e-9) drops++;
    if (mean(b) > 0) effects.push(mean(a) / mean(b));
  }
  return { label, m, gains, drops, within: pairs.length - gains - drops, effects, p: signP(gains, drops) };
}

const base = byVariant.get("default")!;
const report: string[] = [];
report.push(`## SEARCH-OBJECTIVE on \`${setId}\` and the dense windows ${dense.join(", ") || "(none)"}`, "");
report.push(`${base.length} inputs, ${seeds} seeds, ${VARIANTS.length} variants of the score. A positive correlation means that a higher score gives a better measure.`, "");
report.push("### The variants", "", "| Variant | Options |", "|---|---|");
for (const v of VARIANTS) {
  const own = Object.entries(v.options).filter(([k, x]) => (SEARCH_DEFAULTS as unknown as Record<string, unknown>)[k] !== x);
  report.push(`| ${v.name} | ${own.map(([k, x]) => `${k} ${String(x)}`).join(", ") || "the default options"} |`);
}
report.push("", "### Part 1: the score delta of each move against the change of each measure", "");
report.push("| Variant | Measure | Median ρ | p10 | p90 | ρ > 0.3 | ρ < 0 | No spread |", "|---|---|---:|---:|---:|---:|---:|---:|");
for (const v of VARIANTS)
  for (const m of MEASURES) {
    const rs = byVariant.get(v.name)!.map((r) => correlation(r, m, (p) => p.score));
    const ok = rs.filter(Number.isFinite);
    report.push(`| ${v.name} | ${m} | ${f(quantile(ok, 0.5))} | ${f(quantile(ok, 0.1))} | ${f(quantile(ok, 0.9))} | ${pct(ok.filter((x) => x > 0.3).length / Math.max(1, ok.length))} | ${pct(ok.filter((x) => x < 0).length / Math.max(1, ok.length))} | ${rs.length - ok.length} |`);
  }
report.push("", "### The median ρ of each term of the score of the default", "", `| Term | ${MEASURES.join(" | ")} |`, `|---|${MEASURES.map(() => "---:").join("|")}|`);
for (const t of TERMS) report.push(`| ${t} | ${MEASURES.map((m) => f(quantile(base.map((r) => correlation(r, m, (p) => p.terms[t])), 0.5))).join(" | ")} |`);
report.push("", "### The median ρ of the score of the default for each family", "", `| Family | Inputs | ${MEASURES.join(" | ")} |`, `|---|---:|${MEASURES.map(() => "---:").join("|")}|`);
for (const fam of [...new Set(base.map((r) => r.family))]) {
  const rs = base.filter((r) => r.family === fam);
  report.push(`| ${fam} | ${rs.length} | ${MEASURES.map((m) => f(quantile(rs.map((r) => correlation(r, m, (p) => p.score)), 0.5))).join(" | ")} |`);
}

// Part 2: each variant and the start plan against the default. The start plan does not depend on the seed. Holm runs over all the tests of the table.
const tests: Test[] = [];
for (const m of MEASURES) tests.push(compare("0 evaluations", m, base.map((r) => [[r.runs[0]!.points[0]!.measures[m]], bestValues(r, m)] as const)));
for (const v of VARIANTS.slice(1)) {
  const own = new Map(byVariant.get(v.name)!.map((r) => [r.id, r] as const));
  for (const m of MEASURES) tests.push(compare(v.name, m, base.map((r) => [bestValues(own.get(r.id)!, m), bestValues(r, m)] as const)));
}
const adjusted = holm(tests.map((t) => t.p));
report.push("", "### Part 2: each variant against the default", "");
report.push("A gain is a mean over the seeds lower than the mean of the default by more than 2 sd (the larger sd). The effect is the ratio of the means, lower is better.", "");
report.push("| Against the default | Measure | Gains | Drops | Within the floor | Effect median | p10 | p90 | Sign p | Holm p |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
tests.forEach((t, i) => report.push(`| ${t.label} | ${t.m} | ${t.gains} | ${t.drops} | ${t.within} | ${f(quantile(t.effects, 0.5))} | ${f(quantile(t.effects, 0.1))} | ${f(quantile(t.effects, 0.9))} | ${f(t.p, 4)} | ${f(adjusted[i]!, 4)} |`));
report.push("", "### The time of one run, with the bench measures of each plan", "", "| Variant | Median ms | Ratio to the default |", "|---|---:|---:|");
const baseMs = quantile(base.flatMap((r) => r.runs.map((x) => x.ms)), 0.5);
for (const v of VARIANTS) {
  const ms = quantile(byVariant.get(v.name)!.flatMap((r) => r.runs.map((x) => x.ms)), 0.5);
  report.push(`| ${v.name} | ${f(ms, 1)} | ${f(ms / baseMs, 2)} |`);
}
console.log(report.join("\n"));
