import { highwayRouterStrategy } from "../../highways/router.ts";
import type { Graph, Result } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { createRegistry, getStrategy, listStrategies, STEPS, type AnyStrategy, type Registry, type Strategy } from "../../strategies/model.ts";
import { compareStep, type CompareRow, type CompareStep, type StepComparison } from "../compare.ts";
import { paretoFront, type Objective } from "../measures/pareto.ts";
import { routeStability } from "../measures/stability.ts";
import { quantile } from "../measures/stats.ts";
import { checkLevels, checkProperties, TOLERANCE } from "../properties.ts";
import { measureQuality } from "../quality.ts";
import { sameData } from "../run.ts";
import { FRONT_OBJECTIVES } from "../suite.ts";
import { inputGraph, jsonSafe, type LayoutInput, type LayoutPrediction, type LayoutRecord, type PredictionOp } from "./forms.ts";
import { measureByName, measureName, namedObjectives } from "./measures.ts";
import { SCREEN_V1, screenInputs, type ScreenSet } from "./set.ts";

/**
 * The steps of the screen: the steps of `compareStep` and the step `highway`.
 * The screen of the step `highway` routes the plan of each strategy with `follow`, and measures the routes as the routes of a router.
 */
export type ScreenStep = CompareStep | "highway";

/** The steps of the screen, in the order of the pipeline. */
export const SCREEN_STEPS: readonly ScreenStep[] = ["group", "router", "highway", "curve"];

/** The routers that the screen of the step `highway` also runs by default. They are the baselines of the note on highways. */
export const HIGHWAY_BASE_ROUTERS: readonly string[] = ["corners", "shared", "trunks"];

/** The hard rules of the routes of a router, or of a plan after `follow`. */
const ROUTE_RULES: readonly string[] = ["complete", "ends-at-plugs", "fixed-plugs", "no-pass-through", "counts-sum", "link-ends", "bundle-trunk", "run-shared", "same-twice"];

/** The hard rules of each step of the screen, in the order of the records. A good run has 0 for each rule. */
export const SCREEN_RULES: Readonly<Record<ScreenStep, readonly string[]>> = {
  router: ROUTE_RULES,
  highway: ROUTE_RULES,
  group: ["sections", "counts-sum", "link-ends", "same-twice"],
  curve: ["same-twice"],
};

/** The options of `screen`. */
export interface ScreenOptions {
  /** The screen set. The default is `SCREEN_V1`. */
  readonly set?: ScreenSet;
  /** The input files. The default is the files of `set`. */
  readonly inputs?: readonly LayoutInput[];
  /** The families of the inputs that the screen runs. The default is each family. */
  readonly families?: readonly string[];
  /**
   * With `true`, the screen also runs each built-in strategy of the step, and the front compares the new strategies with them.
   * With `false`, it runs only the strategies of the call. The default is `true`.
   */
  readonly baseline?: boolean;
  /** The options of each strategy, by its name. A strategy without an entry gets its defaults. */
  readonly options?: Readonly<Record<string, object>>;
  /** The router whose routes the step `curve` draws. The default is `corners`. */
  readonly curveRouter?: string;
  /**
   * The routers that the screen of the step `highway` also runs. Their records have the step `router`.
   * The default is `HIGHWAY_BASE_ROUTERS`. The other steps do not read it.
   */
  readonly baseRouters?: readonly string[];
  /** The seed of the small change of the stability measures. The default is 1. */
  readonly seed?: number;
  /** The commit of the code, for the records. */
  readonly commit?: string;
  /** The predictions of the run. Each record names the first prediction with its strategy, its set and its input. */
  readonly predictions?: readonly LayoutPrediction[];
  /** This function gets one line of progress for each input. */
  readonly log?: (line: string) => void;
}

/** The summary of one strategy over the inputs of a screen. */
export interface ScreenStrategySummary {
  readonly strategy: string;
  /** This value is `true` for a strategy of the call, and `false` for a built-in strategy of the baseline. */
  readonly candidate: boolean;
  /** The number of inputs where the strategy ran. */
  readonly runs: number;
  /** The number of inputs that the strategy skipped. */
  readonly skipped: number;
  /** This value is `true` when each run gave the same output two times. */
  readonly deterministic: boolean;
  /** The sum of the breaks of each hard rule over the runs. */
  readonly hard: Readonly<Record<string, number>>;
  /** The sum of `hard`. */
  readonly hardTotal: number;
  /**
   * The breaks over the floor of each input. The floor is the counts of the built-in strategy with the fewest breaks on that input.
   * Each built-in breaks a rule on some boards, for example on a board where the boxes touch. Without built-ins, the floor is 0.
   */
  readonly hardOverFloor: number;
  /** The median of each measure over the runs, by the names of a record. */
  readonly medians: Readonly<Record<string, number>>;
  /** The median time of a run, in milliseconds. */
  readonly ms: number;
  /** The number of inputs where the strategy is on the Pareto front of its input. */
  readonly onFront: number;
}

/** A prediction with the measured value. */
export interface PredictionCheck extends LayoutPrediction {
  readonly op: PredictionOp;
  /** The measured value: the value of the record of the input, or the median over the set. It is absent when no record has the measure. */
  readonly measured?: number;
  /** This value is `true` when the measured value meets the prediction. It is absent when there is no measured value. */
  readonly met?: boolean;
}

/** The summary of a screen. */
export interface ScreenSummary {
  readonly set: string;
  readonly step: ScreenStep;
  /** The number of inputs. */
  readonly inputs: number;
  /** The axes of the Pareto front, by the names of a record. */
  readonly objectives: readonly Objective[];
  /** One summary for each strategy, in the order of the registry. */
  readonly strategies: readonly ScreenStrategySummary[];
  /** The strategies on the Pareto front of the medians over the set. */
  readonly front: readonly string[];
  /** The strategies with a break over the floor, without a run or with two different outputs of one input. They do not enter the front. */
  readonly excluded: readonly string[];
  readonly predictions: readonly PredictionCheck[];
}

/** The result of `screen`: one record for each strategy and input, and the summary. */
export interface ScreenReport {
  readonly records: readonly LayoutRecord[];
  readonly summary: ScreenSummary;
}

/** This function counts the violations of each rule, with 0 for each rule of `rules`. */
function countRules(rules: readonly string[], violations: readonly { readonly rule: string }[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(rules.map((r) => [r, 0]));
  for (const v of violations) out[v.rule] = (out[v.rule] ?? 0) + 1;
  return out;
}

/** This function gives the median of a list of numbers, or `NaN` for an empty list. */
function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** This function tells if a value meets a comparison with an expected value. */
function meets(value: number, op: PredictionOp, expected: number): boolean {
  if (op === "<") return value < expected;
  if (op === "<=") return value <= expected;
  if (op === ">") return value > expected;
  if (op === ">=") return value >= expected;
  return value === expected;
}

/** This function makes the registry of a screen. It refuses a strategy of another step, and a new strategy with the name of a built-in strategy. */
function screenRegistry(step: ScreenStep, strategies: readonly (Strategy<ScreenStep> | string)[], baseline: boolean): { registry: Registry; candidates: Set<string> } {
  const builtins = listStrategies(STRATEGIES, step) as readonly Strategy<ScreenStep>[];
  const chosen: Strategy<ScreenStep>[] = [];
  for (const s of strategies) {
    if (typeof s === "string") {
      const known = builtins.find((b) => b.name === s);
      if (!known) throw new Error(`There is no ${step} "${s}". The registry has ${builtins.map((b) => b.name).join(", ")}.`);
      chosen.push(known);
      continue;
    }
    if (s.step !== step) throw new Error(`The strategy "${s.name}" is of the step "${s.step}", not "${step}".`);
    const known = builtins.find((b) => b.name === s.name);
    if (known && known !== s) throw new Error(`The new ${step} "${s.name}" has the name of a built-in strategy. Give it another name.`);
    chosen.push(s);
  }
  const candidates = new Set(chosen.map((s) => s.name));
  const others = STEPS.filter((x) => x !== step).flatMap((x) => listStrategies(STRATEGIES, x) as readonly AnyStrategy[]);
  const own = baseline ? [...builtins, ...chosen.filter((s) => !builtins.includes(s))] : chosen.filter((s, i) => chosen.indexOf(s) === i);
  return { registry: createRegistry([...others, ...(own as readonly AnyStrategy[])]), candidates };
}

/** This function tells if a step of the screen gives routes. The step `router` gives routes, and the step `highway` gives routes after `follow`. */
const givesRoutes = (step: ScreenStep): step is "router" | "highway" => step === "router" || step === "highway";

/** This function gives the values of a row of `compareStep`, with the measures of `measureQuality` for a router. */
function rowValues(step: ScreenStep, graph: Graph, row: CompareRow): Record<string, number> {
  const values: Record<string, number> = { ...row.values };
  delete values["ms"];
  if (givesRoutes(step) && row.result) {
    const q = measureQuality(graph, row.result);
    values["R3.bends"] = q.bends;
    values["R8.clearance"] = q.clearance;
    values["R8.tight"] = q.tight;
    values["R10.plugAngle"] = q.plugAngle;
    values["R15.inflections"] = q.inflections;
  }
  return values;
}

/** This function gives the hard rules of a row of `compareStep`, and tells if the row gave the same output two times. */
function rowRules(step: ScreenStep, graph: Graph, row: CompareRow, again: CompareRow | undefined): { hard: Record<string, number>; deterministic: boolean } {
  const rules = SCREEN_RULES[step];
  if (givesRoutes(step)) {
    const all = row.result ? checkProperties(graph, row.result, 1_000_000) : [];
    // `compareStep` adds one violation when two routes of the input differ.
    const deterministic = row.violations === all.length;
    return { hard: { ...countRules(rules, all), "same-twice": deterministic ? 0 : 1 }, deterministic };
  }
  if (step === "group") {
    const all = row.result ? checkLevels(graph, row.result.levels ?? [], 1_000_000) : [{ rule: "sections" }];
    const deterministic = again !== undefined && sameData(row.tree, again.tree) && sameData(row.result, again.result);
    return { hard: { ...countRules(rules, all), "same-twice": deterministic ? 0 : 1 }, deterministic };
  }
  const deterministic = again !== undefined && sameData(row.curves, again.curves);
  return { hard: { ...countRules(rules, []), "same-twice": deterministic ? 0 : 1 }, deterministic };
}

/** This function keeps the finite values and gives them the names of a record. */
function named(values: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) if (Number.isFinite(v)) out[measureName(k)] = v;
  return out;
}

/**
 * This function screens strategies of one step on the inputs of a screen set. It is the cheap test of a new idea before a full build.
 * Each strategy runs on each input with `compareStep`, and each run gives one record of the form `layout-record/1`.
 * A strategy can be a name of the registry or a strategy object, for example from a prototype file. The registry does not change.
 *
 * The step `router` routes each input two times for the rule "same twice". The steps `group` and `curve` run each input two times for the same rule.
 *
 * The step `highway` makes the plan of each strategy and routes it with `follow`, two times. It also runs the routers of `baseRouters`.
 * An input with a `base` in the inputs also gets the measures `route.stability.base.*`: the routes on the variant against the routes on its base.
 * The same inputs and the same options give the same records. Only the times change.
 */
export function screen(step: ScreenStep, strategies: readonly (Strategy<ScreenStep> | string)[] = [], options: ScreenOptions = {}): ScreenReport {
  const set = options.set ?? SCREEN_V1;
  const screened = screenRegistry(step, strategies, options.baseline ?? true);
  const candidates = screened.candidates;
  // The step `highway` runs as the step `router`. Each highway strategy with `follow` is a router, after the base routers.
  const base = step === "highway" ? (options.baseRouters ?? HIGHWAY_BASE_ROUTERS).map((name) => getStrategy(STRATEGIES, "router", name)) : [];
  const registry =
    step === "highway"
      ? createRegistry([...base, ...listStrategies(screened.registry, "highway").map((s) => highwayRouterStrategy(s))] as readonly AnyStrategy[])
      : screened.registry;
  const compareAs: CompareStep = step === "highway" ? "router" : step;
  const baseNames = new Set(base.map((s) => s.name));
  const stepOf = (name: string): ScreenStep => (baseNames.has(name) ? "router" : step);
  const own = options.options ?? {};
  const seed = options.seed ?? 1;
  const log = options.log ?? ((): void => {});
  const families = options.families;
  const inputs = (options.inputs ?? screenInputs(set)).filter((i) => families?.includes(i.family) ?? true);
  const bases = new Set(inputs.flatMap((i) => (i.base !== undefined ? [i.base] : [])));
  const byName = new Map(listStrategies(registry, compareAs).map((s) => [s.name, s as Strategy<CompareStep>]));
  const records: (LayoutRecord & { measures: Record<string, number> })[] = [];
  const comparisons: StepComparison[] = [];
  const kept = new Map<string, { graph: Graph; results: Map<string, Result> }>();
  const variants: { record: (typeof records)[number]; base: string; result: Result }[] = [];

  for (const input of inputs) {
    const graph = inputGraph(input);
    const compare = { registry, options: own, seed, name: input.id, ...(options.curveRouter ? { curveRouter: options.curveRouter } : {}) };
    const cmp = compareStep(compareAs, graph, compare);
    const again = givesRoutes(step) ? undefined : compareStep(compareAs, graph, compare);
    comparisons.push(cmp);
    log(`${input.id}: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${cmp.rows.map((r) => `${r.strategy} ${r.ms.toFixed(0)}`).join(", ")}`);
    if (bases.has(input.id)) kept.set(input.id, { graph, results: new Map(cmp.rows.flatMap((r) => (r.result ? [[r.strategy, r.result] as const] : []))) });
    cmp.rows.forEach((row, i) => {
      const strategy = byName.get(row.strategy)!;
      const head = {
        schema: "layout-record/1" as const,
        stage: "route" as const,
        step: stepOf(row.strategy),
        strategy: row.strategy,
        options: jsonSafe({ ...strategy.defaults, ...own[row.strategy] }) as Record<string, unknown>,
        corpus: input.set,
        input: input.id,
        inputHash: input.hash,
        set: input.set,
        seed: input.seed,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
      };
      const prediction = options.predictions?.find((p) => p.strategy === row.strategy && p.set === input.set && p.input === input.id)?.id;
      const tail = { ...(prediction !== undefined ? { prediction } : {}), ...(options.commit !== undefined ? { commit: options.commit } : {}) };
      if (row.skipped !== undefined) {
        records.push({ ...head, measures: {}, hard: {}, tolerance: { through: TOLERANCE }, deterministic: true, ms: 0, ...tail, skipped: row.skipped });
        return;
      }
      const { hard, deterministic } = rowRules(step, graph, row, again?.rows[i]);
      const record = { ...head, measures: named(rowValues(step, graph, row)), hard, tolerance: { through: TOLERANCE }, deterministic, ms: row.ms, ...tail };
      records.push(record);
      if (givesRoutes(step) && input.base !== undefined && row.result) variants.push({ record, base: input.base, result: row.result });
    });
  }

  // The stability against the base: the same strategy on the base input and on its variant.
  for (const v of variants) {
    const base = kept.get(v.base);
    const before = base?.results.get(v.record.strategy);
    if (!base || !before) continue;
    const s = routeStability(base.graph, before, v.result, { seed });
    Object.assign(v.record.measures, named({ "Z10.base.mean": s.mean, "Z10.base.max": s.max, "Z10.base.moved": s.moved }));
  }

  return { records, summary: summarizeScreen(records, comparisons, { set: set.id, step, candidates, ...(options.predictions ? { predictions: options.predictions } : {}) }) };
}

/** This function gives the summary of the records of a screen. */
function summarizeScreen(
  records: readonly LayoutRecord[],
  comparisons: readonly StepComparison[],
  at: { set: string; step: ScreenStep; candidates: ReadonlySet<string>; predictions?: readonly LayoutPrediction[] },
): ScreenSummary {
  const objectives = namedObjectives(FRONT_OBJECTIVES[at.step]);
  const names = [...new Set(records.map((r) => r.strategy))];
  const total = (r: LayoutRecord): number => Object.values(r.hard).reduce((n, v) => n + v, 0);
  const floor = new Map<string, Readonly<Record<string, number>>>();
  const best = new Map<string, number>();
  for (const r of records) {
    if (r.skipped !== undefined || at.candidates.has(r.strategy)) continue;
    if (total(r) >= (best.get(r.input) ?? Number.POSITIVE_INFINITY)) continue;
    best.set(r.input, total(r));
    floor.set(r.input, r.hard);
  }
  const overFloor = (r: LayoutRecord): number => Object.entries(r.hard).reduce((n, [k, v]) => n + Math.max(0, v - (floor.get(r.input)?.[k] ?? 0)), 0);
  const strategies = names.map((strategy): ScreenStrategySummary => {
    const all = records.filter((r) => r.strategy === strategy);
    const ran = all.filter((r) => r.skipped === undefined);
    const hard: Record<string, number> = {};
    for (const r of ran) for (const [k, v] of Object.entries(r.hard)) hard[k] = (hard[k] ?? 0) + v;
    const keys = [...new Set(ran.flatMap((r) => Object.keys(r.measures)))];
    const medians = Object.fromEntries(keys.map((k) => [k, median(ran.flatMap((r) => (r.measures[k] === undefined ? [] : [r.measures[k]])))]));
    return {
      strategy,
      candidate: at.candidates.has(strategy),
      runs: ran.length,
      skipped: all.length - ran.length,
      deterministic: ran.every((r) => r.deterministic),
      hard,
      hardTotal: Object.values(hard).reduce((s, v) => s + v, 0),
      hardOverFloor: ran.reduce((n, r) => n + overFloor(r), 0),
      medians,
      ms: median(ran.map((r) => r.ms)),
      onFront: comparisons.filter((c) => c.front.includes(strategy)).length,
    };
  });
  const fair = strategies.filter((s) => s.runs > 0 && s.hardOverFloor === 0 && s.deterministic);
  const front = paretoFront(fair, (s) => Object.fromEntries(objectives.map((o) => [o.key, s.medians[o.key] ?? Number.NaN])), objectives).map((s) => s.strategy);
  const predictions = (at.predictions ?? []).map((p): PredictionCheck => {
    const op = p.op ?? (measureByName(p.measure)?.better === "higher" ? ">=" : "<=");
    const mine = records.filter((r) => r.strategy === p.strategy && r.set === p.set && r.skipped === undefined && (p.input === undefined || r.input === p.input));
    const values = mine.flatMap((r) => (r.measures[p.measure] === undefined ? [] : [r.measures[p.measure]!]));
    const measured = values.length === 0 ? undefined : p.input !== undefined ? values[0]! : median(values);
    return { ...p, op, ...(measured === undefined ? {} : { measured, met: meets(measured, op, p.expected) }) };
  });
  return {
    set: at.set,
    step: at.step,
    inputs: comparisons.length,
    objectives,
    strategies,
    front,
    excluded: strategies.filter((s) => !fair.includes(s)).map((s) => s.strategy),
    predictions,
  };
}

const fmt = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? "-" : Number.isInteger(v) ? String(v) : v.toFixed(3));

/** This function writes the summary of a screen as Markdown: one row for each strategy, the front and the predictions. */
export function formatScreen(summary: ScreenSummary): string {
  const axes = summary.objectives.map((o) => `${o.key} ${o.better === "min" ? "↓" : "↑"}`);
  const lines = [
    `## Screen of the step \`${summary.step}\` on \`${summary.set}\``,
    "",
    `${summary.inputs} inputs, ${summary.strategies.length} strategies. Each cell of a measure is the median over the inputs.`,
    "The floor of an input is the counts of the hard rules of the built-in strategy with the fewest breaks on that input.",
    "",
    `| strategy | new | runs | skipped | hard | over the floor | same twice | on the front of an input | ms | ${axes.join(" | ")} |`,
    `|---|---|---:|---:|---:|---:|---|---:|---:|${axes.map(() => "---:").join("|")}|`,
    ...summary.strategies.map(
      (s) =>
        `| ${s.strategy} | ${s.candidate ? "yes" : ""} | ${s.runs} | ${s.skipped} | ${s.hardTotal} | ${s.hardOverFloor} | ${s.deterministic ? "yes" : "no"} | ${s.onFront} | ${fmt(s.ms)} | ${summary.objectives.map((o) => fmt(s.medians[o.key])).join(" | ")} |`,
    ),
    "",
    `Pareto front over the medians: ${summary.front.join(", ") || "-"}.`,
    `Not on the front because of a break over the floor, no run or two different outputs: ${summary.excluded.join(", ") || "-"}.`,
  ];
  if (summary.predictions.length > 0) {
    lines.push("", "| prediction | strategy | input | measure | expected | measured | met | reason |", "|---|---|---|---|---:|---:|---|---|");
    for (const p of summary.predictions)
      lines.push(`| ${p.id} | ${p.strategy} | ${p.input ?? "median"} | ${p.measure} | ${p.op} ${fmt(p.expected)} | ${fmt(p.measured)} | ${p.met === undefined ? "-" : p.met ? "yes" : "no"} | ${p.reason} |`);
  }
  return lines.join("\n") + "\n";
}
