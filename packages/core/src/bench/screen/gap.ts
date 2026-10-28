import { polylineLength } from "../../geom.ts";
import { follow } from "../../highways/follow.ts";
import type { HighwayInput, HighwayPlan } from "../../highways/model.ts";
import { sharedWaysPlan } from "../../highways/shared-ways/index.ts";
import type { Graph, Result, Route } from "../../model.ts";
import { byCollection } from "../../routers/trunks.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { asRouter, defineStrategy, getStrategy, type Strategy } from "../../strategies/model.ts";
import { inkSaved } from "../measures/bundles.ts";
import { quantile } from "../measures/stats.ts";
import { exactStretch } from "../exact/index.ts";
import { mulberry32 } from "./hash.ts";

/** The rule of the exact model: `collection` lets only the edges of one collection share a link, and `all` lets each edge share a link. */
export type GapRule = "collection" | "all";

/** The rules of the gap closed, in the order of the records. */
export const GAP_RULES: readonly GapRule[] = ["collection", "all"];

/**
 * A view of the gap closed: one rule, or `chosen`. The view `chosen` takes a rule for each run.
 * It takes `all` when a shared segment of the run holds edges of two collections. Else it takes `collection`.
 */
export type GapView = GapRule | "chosen";

/** The views of the gap closed, in the order of the tables. */
export const GAP_VIEWS: readonly GapView[] = ["chosen", "collection", "all"];

/** The stretch caps of the exact optima, from small to large. */
export const GAP_CAPS: readonly number[] = [1.1, 1.25, 1.5];

/** The baseline of each rule: the router `shared` for `collection`, and the plan `shared-ways-all` after `follow` for `all`. */
export const GAP_BASELINES: Readonly<Record<GapRule, string>> = { collection: "shared", all: "shared-ways-all" };

/** The parameters of the paired bootstrap of the gap closed, from `docs/PROMOTION.md`. */
export const GAP_BOOTSTRAP: { readonly runs: number; readonly level: number; readonly seed: number } = { runs: 10_000, level: 0.95, seed: 1 };

/** The optimum of the exact model on one input, for one rule and one stretch cap. The file of the optima of a set holds one for each. */
export interface ExactOptimum {
  /** The id of the input. */
  readonly input: string;
  /** The hash of the input file. The screen uses the optimum only when the hash matches. */
  readonly hash: string;
  /** The class of the input: its family in the set. */
  readonly class: string;
  readonly nodes: number;
  readonly edges: number;
  readonly rule: GapRule;
  readonly cap: number;
  /** The status of HiGHS: `optimal`, `time-limit` or another status. */
  readonly status: string;
  /** This value is `true` when HiGHS proved the optimum within the time limit. */
  readonly proven: boolean;
  /** The objective of the best solution, the dual bound and the relative MIP gap. Each one is `null` when HiGHS gives none. */
  readonly objective: number | null;
  readonly bound: number | null;
  readonly mipGap: number | null;
  /** The time of the solve, in seconds. */
  readonly seconds: number;
  /** The number of binary variables of the model. */
  readonly binaries: number;
  /** The ink saved (B1) of the routes of the best plan after `follow`. The gap closed uses this value. */
  readonly b1: number | null;
  /** The ink saved of the model itself, without `follow`. */
  readonly modelB1: number | null;
  /** The largest bundle stretch (B3) of the routes of the best plan, against the routes of `corners`. */
  readonly b3max: number | null;
  /** The number of highways of the best plan. */
  readonly highways: number;
}

/** The file of the optima of a set (`exact-optima/1`). Later screens read it and do not solve again. */
export interface ExactOptimaFile {
  readonly schema: "exact-optima/1";
  readonly set: string;
  /** The time limit of each solve, in seconds. */
  readonly seconds: number;
  /** The commit of the code and the CI run of the solves. */
  readonly commit?: string;
  readonly run?: string;
  readonly optima: readonly ExactOptimum[];
}

/** This function gives the file of the optima of a set, with the rows in the order of the input, the rule and the cap. */
export function optimaFile(set: string, rows: readonly ExactOptimum[], at: { readonly seconds: number; readonly commit?: string; readonly run?: string }): ExactOptimaFile {
  const order = (r: ExactOptimum): string => `${r.input}\u0000${GAP_RULES.indexOf(r.rule)}\u0000${r.cap.toFixed(3)}`;
  const optima = [...rows].sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  return { schema: "exact-optima/1", set, seconds: at.seconds, ...(at.commit ? { commit: at.commit } : {}), ...(at.run ? { run: at.run } : {}), optima };
}

/** This function gives the key of an optimum in a map: the input, the rule and the cap. */
export function optimumKey(input: string, rule: GapRule, cap: number): string {
  return `${input}|${rule}|${cap.toFixed(3)}`;
}

/** This function gives the smallest cap that is at least the stretch, or `undefined` when the stretch is above the largest cap. */
export function gapCap(stretch: number, caps: readonly number[] = GAP_CAPS): number | undefined {
  return caps.find((c) => stretch <= c + 1e-9);
}

/**
 * This function gives the gap closed: `(b1 - base) / (optimum - base)`.
 * It gives `undefined` when the denominator is 0 or less, because then the baseline is at the optimum or above it.
 */
export function gapClosed(b1: number, base: number, optimum: number): number | undefined {
  const d = optimum - base;
  return d > 1e-9 ? (b1 - base) / d : undefined;
}

/**
 * This function gives the largest bundle stretch of routes against base routes: the max of `L(r_e) / L(r*_e)` over the edges, as B3 counts them.
 * An edge without a base route, or with a base route of 1 unit or less, does not count. Without such an edge, the value is 1.
 */
export function maxStretch(routes: readonly Route[], base: readonly Route[]): number {
  const baseLength = new Map<string, number>();
  for (const r of base) baseLength.set(r.edge, polylineLength(r.points));
  let max = 1;
  for (const r of routes) {
    const b = baseLength.get(r.edge);
    if (b === undefined || b <= 1 || r.points.length < 2) continue;
    max = Math.max(max, polylineLength(r.points) / b);
  }
  return max;
}

/** The highway strategy `shared-ways-all`: the plan of the router `shared` without a rule. It is the baseline of the rule `all`. */
export const sharedWaysAll: Strategy<"highway", object> = defineStrategy({
  step: "highway",
  name: "shared-ways-all",
  describe: "The plan of the router `shared` without a rule.",
  defaults: {},
  schema: {},
  maxNodes: 10_000,
  run: (input: HighwayInput): HighwayPlan => sharedWaysPlan(input, {}),
});

/** This function gives the B1 of the baseline of each rule on a graph. */
export function gapBaselines(graph: Graph): Record<GapRule, number> {
  const shared = asRouter(getStrategy(STRATEGIES, "router", "shared")).route(graph).routes;
  const all = follow(graph, sharedWaysAll.run({ graph }, {})).routes;
  return { collection: inkSaved(shared), all: inkSaved(all) };
}

/** A median with its paired bootstrap interval. */
export interface BootstrapMedian {
  readonly median: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * This function gives the median of the values and its bootstrap interval: `runs` samples of the values with replacement, from the seed `seed`.
 * The interval is the central `level` share of the medians of the samples. Each value is the paired value of one input, so the bootstrap is paired.
 */
export function bootstrapMedian(values: readonly number[], o: { readonly runs?: number; readonly level?: number; readonly seed?: number } = {}): BootstrapMedian {
  if (values.length === 0) return { median: Number.NaN, lo: Number.NaN, hi: Number.NaN };
  const runs = o.runs ?? GAP_BOOTSTRAP.runs;
  const level = o.level ?? GAP_BOOTSTRAP.level;
  const r = mulberry32(o.seed ?? GAP_BOOTSTRAP.seed);
  const medians: number[] = [];
  const sample = new Array<number>(values.length);
  for (let i = 0; i < runs; i++) {
    for (let j = 0; j < values.length; j++) sample[j] = values[Math.floor(r() * values.length)]!;
    medians.push(quantile(sample, 0.5));
  }
  const tail = (1 - level) / 2;
  return { median: quantile(values, 0.5), lo: quantile(medians, tail), hi: quantile(medians, 1 - tail) };
}

/** The gap closed of one strategy and one view over the inputs of a screen. */
export interface GapSummary {
  readonly strategy: string;
  readonly rule: GapView;
  /** The number of runs, and the number of runs with a value. A run has no value above the largest cap, or without a proven optimum. */
  readonly runs: number;
  readonly values: number;
  /** The median over the inputs with a value, and its paired bootstrap interval. */
  readonly median: number;
  readonly lo: number;
  readonly hi: number;
  /** The median of each class, by the family of the input. */
  readonly byClass: Readonly<Record<string, number>>;
  /** The number of values at each cap, by the cap. */
  readonly caps: Readonly<Record<string, number>>;
  /** The number of runs with some ink saved (B1 above 0): the runs where the strategy builds a shared segment. */
  readonly builds: number;
  /** The number of runs where a shared segment holds edges of two collections. */
  readonly mixed: number;
}

/** The names of the measures of the gap closed in a record, for a view. */
export function gapNames(view: GapView): { readonly gap: string; readonly cap: string } {
  return view === "chosen" ? { gap: "route.bundle.gap-closed", cap: "route.bundle.gap-closed.cap" } : { gap: `route.bundle.gap-closed.${view}`, cap: `route.bundle.gap-closed.cap.${view}` };
}

/** This function gives the family of an input id `<set>/<family>/s<seed>`. */
const familyOf = (input: string): string => input.split("/")[1] ?? input;

/**
 * This function gives the gap closed of each strategy and view over records.
 * It sorts them by the view and then by the median, from high to low.
 * A strategy with a value on fewer than half of its runs comes after the others, because its median shows only a few inputs.
 */
export function summarizeGap(
  records: readonly { readonly strategy: string; readonly input: string; readonly skipped?: string; readonly measures: Readonly<Record<string, number>> }[],
): GapSummary[] {
  const out: GapSummary[] = [];
  const names = [...new Set(records.map((r) => r.strategy))];
  for (const rule of GAP_VIEWS) {
    const key = gapNames(rule);
    const rows: GapSummary[] = [];
    for (const strategy of names) {
      const ran = records.filter((r) => r.strategy === strategy && r.skipped === undefined);
      const withValue = ran.filter((r) => r.measures[key.gap] !== undefined);
      const values = withValue.map((r) => r.measures[key.gap]!);
      const boot = bootstrapMedian(values);
      const classes = [...new Set(withValue.map((r) => familyOf(r.input)))].sort();
      const byClass = Object.fromEntries(classes.map((c) => [c, quantile(withValue.filter((r) => familyOf(r.input) === c).map((r) => r.measures[key.gap]!), 0.5)]));
      const caps: Record<string, number> = {};
      for (const r of withValue) {
        const c = String(r.measures[key.cap]);
        caps[c] = (caps[c] ?? 0) + 1;
      }
      const builds = ran.filter((r) => (r.measures["route.bundle.ink-saved"] ?? 0) > 1e-9).length;
      const mixed = ran.filter((r) => r.measures["route.bundle.gap-closed.mixed"] === 1).length;
      rows.push({ strategy, rule, runs: ran.length, values: values.length, median: boot.median, lo: boot.lo, hi: boot.hi, byClass, caps, builds, mixed });
    }
    const few = (r: GapSummary): number => (2 * r.values < r.runs ? 1 : 0);
    rows.sort((a, b) => few(a) - few(b) || (Number.isNaN(b.median) ? -Infinity : b.median) - (Number.isNaN(a.median) ? -Infinity : a.median) || (a.strategy < b.strategy ? -1 : 1));
    out.push(...rows);
  }
  return out;
}

/** This function writes the gap closed as Markdown: one table for each view, sorted by the median. */
export function formatGap(rows: readonly GapSummary[]): string {
  const f = (v: number): string => (Number.isNaN(v) ? "-" : v.toFixed(3));
  const lines: string[] = [];
  for (const rule of GAP_VIEWS) {
    const mine = rows.filter((r) => r.rule === rule);
    if (mine.length === 0) continue;
    const classes = [...new Set(mine.flatMap((r) => Object.keys(r.byClass)))].sort();
    lines.push(
      "",
      rule === "chosen"
        ? "### The gap closed with the rule of each run (`all` when a shared segment mixes collections, else `collection`)"
        : `### The gap closed with the rule \`${rule}\` (baseline \`${GAP_BASELINES[rule]}\`)`,
      "",
      "The value of an input is `(B1 - B1 of the baseline) / (the optimum B1 - B1 of the baseline)`, at the smallest cap at or above the largest stretch of the routes.",
      "The stretch is the stretch of the exact model: the length of a route without its plug ends, divided by the shortest way in the network of the model.",
      "The interval is the 95% paired bootstrap interval of the median, with 10000 samples.",
      "A strategy with a value on fewer than half of its runs comes after the others. Above the largest cap, a run has no value.",
      "",
      `| strategy | runs | builds | mixed | values | median | interval | ${classes.join(" | ")} | caps 1.1 / 1.25 / 1.5 |`,
      `|---|---:|---:|---:|---:|---:|---|${classes.map(() => "---:").join("|")}|---|`,
      ...mine.map(
        (r) =>
          `| ${r.strategy} | ${r.runs} | ${r.builds} | ${r.mixed} | ${r.values} | ${f(r.median)} | ${f(r.lo)} to ${f(r.hi)} | ${classes.map((c) => f(r.byClass[c] ?? Number.NaN)).join(" | ")} | ${GAP_CAPS.map((c) => r.caps[String(c)] ?? 0).join(" / ")} |`,
      ),
    );
  }
  return lines.join("\n") + "\n";
}

/** This function gives the count of the shared segments of a result (the runs and the bundles) that hold edges of two collections or more. */
export function mixedSegments(graph: Graph, result: Result): number {
  const key = new Map(graph.edges.map((e) => [e.id, byCollection(e) ?? `\u0000${e.id}`]));
  const shared = [...(result.runs ?? []).map((r) => r.edges), ...(result.bundles ?? []).map((b) => b.edges)];
  return shared.filter((edges) => new Set(edges.map((e) => key.get(e))).size > 1).length;
}

/** This function tells if a shared segment of a result (a run or a bundle) holds edges of two collections. */
export function mixesCollections(graph: Graph, result: Result): boolean {
  return mixedSegments(graph, result) > 0;
}

/**
 * This function gives the gap measures of the result of one run on an input with optima, by the keys of `MEASURES`.
 * `B3.max` is the largest stretch against the routes of `corners`. `gap.stretch` is the largest stretch as the exact model counts it (`exactStretch`).
 * The cap is the smallest cap at or above `gap.stretch`, so both sides of the gap have the same stretch limit.
 *
 * `gap.<rule>` is the gap closed at the cap `gap.cap.<rule>`. `gap` is the gap closed of the rule of the run.
 * That rule is `all` when `gap.mixed` is 1, else `collection`.
 * A rule has no value above the largest cap or without a proven optimum at the cap.
 * It also has no value when the hash of the optimum is not the hash of the input.
 */
export function gapValues(
  input: { readonly id: string; readonly hash: string },
  graph: Graph,
  result: Result,
  corners: readonly Route[],
  baselines: Readonly<Record<GapRule, number>>,
  optima: ReadonlyMap<string, ExactOptimum>,
): Record<string, number> {
  const routes = result.routes;
  const stretch = exactStretch(graph, routes);
  const mixed = mixesCollections(graph, result);
  const out: Record<string, number> = { "B3.max": maxStretch(routes, corners), "gap.stretch": stretch, "gap.mixed": mixed ? 1 : 0 };
  const cap = gapCap(stretch);
  if (cap === undefined) return out;
  const b1 = inkSaved(routes);
  for (const rule of GAP_RULES) {
    const o = optima.get(optimumKey(input.id, rule, cap));
    if (!o || !o.proven || o.b1 === null || o.hash !== input.hash) continue;
    const g = gapClosed(b1, baselines[rule], o.b1);
    if (g === undefined) continue;
    out[`gap.${rule}`] = g;
    out[`gap.cap.${rule}`] = cap;
  }
  const chosen: GapRule = mixed ? "all" : "collection";
  if (out[`gap.${chosen}`] !== undefined) {
    out["gap"] = out[`gap.${chosen}`]!;
    out["gap.cap"] = cap;
  }
  return out;
}
