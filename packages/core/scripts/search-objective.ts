// The objective of `search` (SEARCH-OBJECTIVE): `node scripts/search-objective.ts [--set screen-v3] [--seeds 5] [--dense 60,125,250] [--variants <list>] [--fixture <file>] [--out <file>]
// [--time-repeats <n>] [--paired <file>]`.
// It runs `searchRun` with the default options and each seed on each input of the set, and on windows of the dense board.
// For each measured plan it keeps the score, the four terms of the score and the bench measures ink, R1 and R4 of its routes.
// Part 1: for each input, the Spearman correlation of the score delta of each move with the change of each measure, over the moves of all the seeds.
// The sign of a measure is turned, so a positive correlation means that a higher score gives a better measure.
// It also gives the correlation of each term of the score, so that a term that does not follow the measures is visible.
// Part 2: the start plan (0 evaluations) and each variant of `--variants` against the default, with the noise floor of 2 sd over the seeds, the effect and Holm.
// Part 3, the time (MEASURE-ISOLATE): `measureIsolated` times the variants on each input, with the A/A arm of the default and 1 warm-up run.
// Each timed run is `searchRun` with the seed 1 and no measure of the plans. `--time-repeats` gives the timed rounds (default 1, and 0 gives no time).
// `--paired` writes the report `paired-time/1`. Each record gets `env`, the computer and the mode of its time.
// The mode of Part 3 is `fresh` (BENCH-FRESH-CASES): a fresh process for each variant, each input and each round, one at a time.
// Each child makes only the graph of its input, runs `searchRun` 1 time untimed, and times 1 run.
// A child: `node scripts/search-objective.ts <the options> --time-child <variant> --input <id> --warmup 1`.
// The cost of mode `fresh`: 153 inputs x 7 arms (6 variants and the A/A arm) x 1 round gives 1071 children.
// Each child runs `searchRun` 2 times, as mode process does for each arm and input. So the run time does not change.
// The starts add 0.3 to 1 s for each child on a CI runner, thus 5 to 18 min. Parts 1 and 2 take 35 min, and the job time limit is 120 min.
// The workflow `Search objective` (.github/workflows/search-objective.yml) starts it. The runs go in CI, not on a local machine.
// SEARCH-CROSS: `--variants search-cross` gives the candidate scores of `SEARCH_CROSS_VARIANTS`. Each record of a run has the work of each opt-in term.
// The report splits B1 into the drawn ink and the length of the routes, and it gives the median ρ of each term for each variant.
import { readFileSync, writeFileSync, writeSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { ambiguity, bundleStretch, inkSaved, mergeAngle } from "../src/bench/measures/bundles.ts";
import { totalTurn } from "../src/bench/measures/routes.ts";
import { measureQuality } from "../src/bench/quality.ts";
import { graphInput, inputGraph, inputId, SCREEN_SETS, screenInputs } from "../src/bench/screen/index.ts";
import { polylineLength } from "../src/geom.ts";
import { follow } from "../src/highways/follow.ts";
import { SEARCH_DEFAULTS, searchRun, type SearchOptions, type SearchStep, type SearchTerm, type SearchTermWorks } from "../src/highways/search/index.ts";
import type { Graph, Route } from "../src/model.ts";
import { envOf, measureIsolated, runChild } from "./gates/paired.ts";
import { pairedTable } from "./gates/time-gate.ts";

const opt = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const setId = opt("--set") ?? "screen-v3";
const seeds = Math.max(1, Number(opt("--seeds") ?? 5));
const dense = (opt("--dense") ?? "60,125,250").split(",").filter((x) => x.trim() !== "").map(Number);
const fixture = opt("--fixture") ?? fileURLToPath(new URL("./data/scale/route-scale-fixture.json.gz", import.meta.url));
const out = opt("--out");
const timeRepeats = Math.max(0, Math.floor(Number(opt("--time-repeats") ?? 1)));
const pairedOut = opt("--paired");
// The time of a record comes from this process, with the measures of the plans in the timed run. Part 3 gives the paired times.
const env = envOf("process");
/** The variants of the score that the screen compares with the default. The term `X` is the crossing term of `crossingWeight`. */
const DEFAULT_VARIANTS = "ink-only:stretchWeight=0,ambiguityWeight=0,angleWeight=0;half-penalties:stretchWeight=0.25,ambiguityWeight=0.25,angleWeight=0.125;cross-0.1:crossingWeight=0.1;cross-0.3:crossingWeight=0.3;cross-0.3-half:crossingWeight=0.3,stretchWeight=0.25,ambiguityWeight=0.25,angleWeight=0.125";
/** The half penalties of SEARCH-OBJECTIVE. */
const HALF = "stretchWeight=0.25,ambiguityWeight=0.25,angleWeight=0.125";
/**
 * The candidate scores of SEARCH-CROSS. The term `T` is the turn term of `turnWeight`. The value `inkBase=first` divides the drawn ink by the length of the first routes.
 * The reference is `cross-0.3-half`, the best variant of SEARCH-OBJECTIVE. The weights come from a fit on the moves of its run 41446536480.
 */
const SEARCH_CROSS_VARIANTS = [
  `cross-0.3-half:crossingWeight=0.3,${HALF}`,
  `turn-1:crossingWeight=0.3,${HALF},turnWeight=1`,
  `ink-first:crossingWeight=0.3,${HALF},inkBase=first`,
  `ink-first-turn-1:crossingWeight=0.3,${HALF},inkBase=first,turnWeight=1`,
  "turn-1.5-cross-0.6:crossingWeight=0.6,turnWeight=1.5",
].join(";");
/** The named lists of variants of `--variants`. */
const NAMED_VARIANTS: Readonly<Record<string, string>> = { "search-cross": SEARCH_CROSS_VARIANTS };
const MEASURES = ["ink", "R1", "R4"] as const;
const TERMS = ["B1", "B3", "B4", "B6", "X", "T"] as const;
/** The opt-in terms of the score that count their work. */
const WORK_TERMS: readonly SearchTerm[] = ["crossing", "turn", "inkFirst"];
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
  /** The two parts of B1 = 1 - drawn / length (SEARCH-CROSS): the drawn ink and the total length of the routes. A record of SEARCH-OBJECTIVE has no parts. */
  readonly parts?: { readonly drawn: number; readonly length: number };
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

/**
 * This function reads the variants: `name:key=value,key=value;name:...`, or the name of a list of `NAMED_VARIANTS`. The variant `default` is always the first.
 * A value that is not a number stays text, for an option such as `inkBase=first`.
 */
function variants(text: string): Variant[] {
  const list: Variant[] = [{ name: "default", options: SEARCH_DEFAULTS }];
  for (const part of (NAMED_VARIANTS[text.trim()] ?? text).split(";").map((x) => x.trim()).filter(Boolean)) {
    const [name, body = ""] = part.split(":");
    const options: Record<string, number | string> = {};
    for (const kv of body.split(",").filter(Boolean)) {
      const [k, v = ""] = kv.split("=");
      const x = Number(v);
      options[k!.trim()] = v.trim() !== "" && Number.isFinite(x) ? x : v.trim();
    }
    list.push({ name: name!.trim(), options: { ...SEARCH_DEFAULTS, ...options } });
  }
  return list;
}

/** This function gives the total length of the routes. */
const lengthOf = (routes: readonly Route[]): number => routes.reduce((s, r) => s + polylineLength(r.points), 0);

/** This function measures one plan: the weighted terms of its score, the parts of B1 and the bench measures ink, R1 and R4. */
function measure(graph: Graph, step: SearchStep, first: readonly Route[], firstLength: number, o: Readonly<SearchOptions>): Point {
  const routes = step.result.routes;
  const q = measureQuality(graph, step.result);
  const turn = totalTurn(routes).mean;
  const length = lengthOf(routes);
  const b1 = o.inkBase === "first" ? inkSaved(routes, firstLength) : inkSaved(routes);
  const terms: Record<TermKey, number> = {
    B1: o.inkWeight * b1,
    B3: -o.stretchWeight * bundleStretch(routes, first).q95,
    B4: -o.ambiguityWeight * ambiguity(graph, routes).value,
    B6: (-o.angleWeight * mergeAngle(routes)) / 180,
    X: (-(o.crossingWeight ?? 0) * q.crossings) / Math.max(1, routes.length),
    T: -(o.turnWeight ?? 0) * turn,
  };
  // The drawn ink of B1 is `(1 - B1) × length`, with the length that B1 divides by. This is the ink of `drawnSegments`, near the ink of `measureQuality`.
  const base = o.inkBase === "first" ? firstLength : length;
  const parts = { drawn: base > 0 ? (1 - b1) * base : 0, length };
  return { n: step.n, from: step.from, accepted: step.accepted, score: step.score, terms, measures: { ink: q.ink, R1: q.crossings, R4: turn }, parts };
}

/** The record of one input and one variant: the points of each seed and the time of each seed. */
interface InputRecord {
  readonly id: string;
  readonly family: string;
  readonly variant: string;
  readonly nodes: number;
  readonly edges: number;
  /** The runs of each seed. The value `terms` is the work of each opt-in term of the score, from `searchRun` (SEARCH-CROSS). */
  readonly runs: { readonly seed: number; readonly ms: number; readonly best: number; readonly points: Point[]; readonly terms?: SearchTermWorks }[];
  /** The computer and the mode of the times (MEASURE-ISOLATE). */
  readonly env?: ReturnType<typeof envOf>;
}

const set = SCREEN_SETS[setId];
if (!set) throw new Error(`There is no screen set "${setId}".`);
/** This function reads the dense board of `--fixture`. */
function denseBoard(): Graph {
  const bytes = readFileSync(fixture);
  return (JSON.parse((fixture.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8")) as { graph: Graph }).graph;
}
const VARIANTS = variants(opt("--variants") ?? DEFAULT_VARIANTS);

/** This function gives the graph of one input by its id. It makes only that graph, with the same steps as `screenInputs` and the windows of the dense board. */
function inputOf(id: string): Graph {
  if (id.startsWith("dense/")) return window(denseBoard(), Number(id.slice("dense/".length)));
  for (const f of set!.families)
    for (let k = 0; k < f.seeds; k++)
      if (inputId(set!.id, f.name, k) === id) return inputGraph(graphInput(f.make(k), { id, set: set!.id, family: f.name, seed: k, generator: f.generator(k), cell: f.cell }));
  throw new Error(`The set ${setId} has no input "${id}".`);
}

// A child of Part 3 in mode fresh (BENCH-FRESH-CASES). It times one variant on one input, and then it stops. The write to the file descriptor 1 ends before the exit.
const timeChild = opt("--time-child");
if (timeChild !== undefined) {
  const variant = VARIANTS.find((v) => v.name === timeChild);
  if (variant === undefined) throw new Error(`There is no variant "${timeChild}".`);
  runChild(inputOf, (graph) => searchRun({ graph }, { ...variant.options, seed: 1 }), { write: (line) => writeSync(1, line + "\n") });
  process.exit(0);
}

const inputs: { id: string; family: string; graph: Graph }[] = [];
for (const input of screenInputs(set)) inputs.push({ id: input.id, family: input.family, graph: inputGraph(input) });
if (dense.length > 0) {
  const board = denseBoard();
  for (const size of dense) inputs.push({ id: `dense/${size}`, family: "dense", graph: window(board, size) });
}

const byVariant = new Map<string, InputRecord[]>(VARIANTS.map((v) => [v.name, []]));
const lines: string[] = [];
for (const { id, family, graph } of inputs) {
  if (graph.edges.length === 0) continue;
  const first = follow(graph, { highways: [] }).routes;
  const firstLength = lengthOf(first);
  for (const v of VARIANTS) {
    const runs: InputRecord["runs"] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const points: Point[] = [];
      const o = { ...v.options, seed };
      const t0 = performance.now();
      const run = searchRun({ graph }, o, (step) => points.push(measure(graph, step, first, firstLength, o)));
      const ms = performance.now() - t0;
      // The best plan is the first plan with the best score, as `searchRun` keeps it.
      let best = 0;
      let bestScore = -Infinity;
      for (const p of points) if (p.score > bestScore + 1e-12) [best, bestScore] = [p.n, p.score];
      runs.push(run.terms ? { seed, ms, best, points, terms: run.terms } : { seed, ms, best, points });
    }
    const record: InputRecord = { id, family, variant: v.name, nodes: graph.nodes.length, edges: graph.edges.length, runs, env };
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
// The split of the score (SEARCH-CROSS): the median ρ of each term of each variant. A term with the weight 0 has no spread and gives "-".
report.push("", "### The median ρ of each term of the score, for each variant", "", `| Variant | Term | ${MEASURES.join(" | ")} |`, `|---|---|${MEASURES.map(() => "---:").join("|")}|`);
for (const v of VARIANTS)
  for (const t of TERMS) {
    const rs = byVariant.get(v.name)!;
    const row = MEASURES.map((m) => quantile(rs.map((r) => correlation(r, m, (p) => p.terms[t])), 0.5));
    if (row.some(Number.isFinite)) report.push(`| ${v.name} | ${t} | ${row.map((x) => f(x)).join(" | ")} |`);
  }
// The parts of B1: a lower drawn ink and a greater length both raise B1 = 1 - drawn / length. The sign of each part is turned, so a positive ρ follows the measure.
report.push("", "### The parts of B1 for each variant: the drawn ink and the length of the routes", "");
report.push("The column \"drawn\" is the ρ of minus the drawn ink. The column \"length\" is the ρ of the length, the direction in which B1 goes up.", "");
report.push(`| Variant | Part | ${MEASURES.join(" | ")} | B1 up with more drawn ink |`, `|---|---|${MEASURES.map(() => "---:").join("|")}|---:|`);
for (const v of VARIANTS) {
  const rs = byVariant.get(v.name)!;
  // The share of the moves that raise B1 and also raise the drawn ink: B1 rewards them only for a greater length.
  let up = 0;
  let worse = 0;
  for (const r of rs)
    for (const run of r.runs) {
      const at = new Map(run.points.map((p) => [p.n, p] as const));
      for (const p of run.points) {
        const from = at.get(p.from);
        if (!from || !p.parts || !from.parts || p.terms.B1 <= from.terms.B1 + 1e-12) continue;
        up++;
        if (p.parts.drawn > from.parts.drawn + 1e-9) worse++;
      }
    }
  const share = up > 0 ? `${worse} of ${up} (${pct(worse / up)})` : "-";
  report.push(`| ${v.name} | drawn | ${MEASURES.map((m) => f(quantile(rs.map((r) => correlation(r, m, (p) => -(p.parts?.drawn ?? NaN))), 0.5))).join(" | ")} | ${share} |`);
  report.push(`| ${v.name} | length | ${MEASURES.map((m) => f(quantile(rs.map((r) => correlation(r, m, (p) => p.parts?.length ?? NaN)), 0.5))).join(" | ")} | |`);
}
// The work of each opt-in term (SEARCH-CROSS step 2), next to the median ρ of the score of the variant.
report.push("", "### The work of each opt-in term of the score, next to the median ρ of the score", "");
report.push("The calls and the steps are the medians over the runs. A step is one route point that the term reads.", "");
report.push(`| Variant | ${MEASURES.map((m) => `ρ ${m}`).join(" | ")} | ${WORK_TERMS.map((t) => `${t} calls | ${t} steps`).join(" | ")} |`, `|---|${MEASURES.map(() => "---:").join("|")}|${WORK_TERMS.map(() => "---:|---:").join("|")}|`);
for (const v of VARIANTS) {
  const rs = byVariant.get(v.name)!;
  const rho = MEASURES.map((m) => f(quantile(rs.map((r) => correlation(r, m, (p) => p.score)), 0.5)));
  const runs = rs.flatMap((r) => r.runs);
  const cells = WORK_TERMS.map((t) => `${f(quantile(runs.map((x) => x.terms?.[t]?.calls ?? 0), 0.5), 0)} | ${f(quantile(runs.map((x) => x.terms?.[t]?.steps ?? 0), 0.5), 0)}`);
  report.push(`| ${v.name} | ${rho.join(" | ")} | ${cells.join(" | ")} |`);
}
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
report.push("", "### The time of one run, with the bench measures of each plan", "", "These times hold the measures of the plans, so they are not a comparison. Part 3 compares the times.", "", "| Variant | Median ms |", "|---|---:|");
for (const v of VARIANTS) {
  const ms = quantile(byVariant.get(v.name)!.flatMap((r) => r.runs.map((x) => x.ms)), 0.5);
  report.push(`| ${v.name} | ${f(ms, 1)} |`);
}
// Part 3: the variants on each input, with the A/A arm of the default (MEASURE-ISOLATE). Each variant, each input and each round gets its own fresh process.
if (timeRepeats > 0 && VARIANTS.length > 1) {
  // Each child gets the options of this run, so it makes the same graph and the same variant. The A/A arm copies the command of the default.
  const timed = inputs.filter((i) => i.graph.edges.length > 0).map((i) => ({ id: i.id, group: i.family }));
  const script = fileURLToPath(import.meta.url);
  const arms = VARIANTS.map((v) => ({ id: v.name, command: [process.execPath, ...process.execArgv, script, ...process.argv.slice(2), "--time-child", v.name] }));
  const paired = await measureIsolated({ arms, inputs: timed, repeats: timeRepeats, warmup: 1, mode: "fresh" });
  if (pairedOut) writeFileSync(pairedOut, JSON.stringify(paired) + "\n");
  const how = "Each variant, each input and each round has its own fresh process.";
  report.push("", "### Part 3: the time of each variant against the default", "", `Each timed run is \`searchRun\` with the seed 1 and no measure of the plans. ${how}`, "", ...pairedTable(paired));
}
console.log(report.join("\n"));
