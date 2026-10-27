import type { Graph, Result } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { createRegistry, listStrategies, STEPS, type AnyStrategy, type Registry, type Strategy } from "../../strategies/model.ts";
import { compareStep, type CompareRow, type CompareStep, type StepComparison } from "../compare.ts";
import { paretoFront, type Objective } from "../measures/pareto.ts";
import { routeStability } from "../measures/stability.ts";
import { quantile } from "../measures/stats.ts";
import { checkLevels, checkProperties } from "../properties.ts";
import { measureQuality } from "../quality.ts";
import { sameData } from "../run.ts";
import { FRONT_OBJECTIVES } from "../suite.ts";
import { inputGraph, jsonSafe, type LayoutInput, type LayoutPrediction, type LayoutRecord, type PredictionOp } from "./forms.ts";
import { measureByName, measureName, namedObjectives } from "./measures.ts";
import { SCREEN_V1, screenInputs, type ScreenSet } from "./set.ts";

/** The hard rules of each step of the screen, in the order of the records. A good run has 0 for each rule. */
export const SCREEN_RULES: Readonly<Record<CompareStep, readonly string[]>> = {
  router: ["complete", "ends-at-plugs", "fixed-plugs", "no-pass-through", "counts-sum", "link-ends", "bundle-trunk", "run-shared", "same-twice"],
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
  readonly step: CompareStep;
  /** The number of inputs. */
  readonly inputs: number;
  /** The axes of the Pareto front, by the names of a record. */
  readonly objectives: readonly Objective[];
  /** One summary for each strategy, in the order of the registry. */
  readonly strategies: readonly ScreenStrategySummary[];
  /** The strategies on the Pareto front of the medians over the set. */
  readonly front: readonly string[];
  /** The strategies with a break of a hard rule, without a run or with two different outputs of one input. They do not enter the front. */
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
function screenRegistry(step: CompareStep, strategies: readonly (Strategy<CompareStep> | string)[], baseline: boolean): { registry: Registry; candidates: Set<string> } {
  const builtins = listStrategies(STRATEGIES, step) as readonly Strategy<CompareStep>[];
  const chosen: Strategy<CompareStep>[] = [];
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

/** This function gives the values of a row of `compareStep`, with the measures of `measureQuality` for a router. */
function rowValues(step: CompareStep, graph: Graph, row: CompareRow): Record<string, number> {
  const values: Record<string, number> = { ...row.values };
  delete values["ms"];
  if (step === "router" && row.result) {
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
function rowRules(step: CompareStep, graph: Graph, row: CompareRow, again: CompareRow | undefined): { hard: Record<string, number>; deterministic: boolean } {
  const rules = SCREEN_RULES[step];
  if (step === "router") {
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
 * An input with a `base` in the inputs also gets the measures `route.stability.base.*`: the routes on the variant against the routes on its base.
 * The same inputs and the same options give the same records. Only the times change.
 */
export function screen(step: CompareStep, strategies: readonly (Strategy<CompareStep> | string)[] = [], options: ScreenOptions = {}): ScreenReport {
  const set = options.set ?? SCREEN_V1;
  const { registry, candidates } = screenRegistry(step, strategies, options.baseline ?? true);
  const own = options.options ?? {};
  const seed = options.seed ?? 1;
  const log = options.log ?? ((): void => {});
  const families = options.families;
  const inputs = (options.inputs ?? screenInputs(set)).filter((i) => families?.includes(i.family) ?? true);
  const bases = new Set(inputs.flatMap((i) => (i.base !== undefined ? [i.base] : [])));
  const byName = new Map(listStrategies(registry, step).map((s) => [s.name, s as Strategy<CompareStep>]));
  const records: (LayoutRecord & { measures: Record<string, number> })[] = [];
  const comparisons: StepComparison[] = [];
  const kept = new Map<string, { graph: Graph; results: Map<string, Result> }>();
  const variants: { record: (typeof records)[number]; base: string; result: Result }[] = [];

  for (const input of inputs) {
    const graph = inputGraph(input);
    const compare = { registry, options: own, seed, name: input.id, ...(options.curveRouter ? { curveRouter: options.curveRouter } : {}) };
    const cmp = compareStep(step, graph, compare);
    const again = step === "router" ? undefined : compareStep(step, graph, compare);
    comparisons.push(cmp);
    log(`${input.id}: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${cmp.rows.map((r) => `${r.strategy} ${r.ms.toFixed(0)}`).join(", ")}`);
    if (bases.has(input.id)) kept.set(input.id, { graph, results: new Map(cmp.rows.flatMap((r) => (r.result ? [[r.strategy, r.result] as const] : []))) });
    cmp.rows.forEach((row, i) => {
      const strategy = byName.get(row.strategy)!;
      const head = {
        schema: "layout-record/1" as const,
        stage: "route" as const,
        step,
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
        records.push({ ...head, measures: {}, hard: {}, deterministic: true, ms: 0, ...tail, skipped: row.skipped });
        return;
      }
      const { hard, deterministic } = rowRules(step, graph, row, again?.rows[i]);
      const record = { ...head, measures: named(rowValues(step, graph, row)), hard, deterministic, ms: row.ms, ...tail };
      records.push(record);
      if (step === "router" && input.base !== undefined && row.result) variants.push({ record, base: input.base, result: row.result });
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
  at: { set: string; step: CompareStep; candidates: ReadonlySet<string>; predictions?: readonly LayoutPrediction[] },
): ScreenSummary {
  const objectives = namedObjectives(FRONT_OBJECTIVES[at.step]);
  const names = [...new Set(records.map((r) => r.strategy))];
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
      medians,
      ms: median(ran.map((r) => r.ms)),
      onFront: comparisons.filter((c) => c.front.includes(strategy)).length,
    };
  });
  const fair = strategies.filter((s) => s.runs > 0 && s.hardTotal === 0 && s.deterministic);
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
    "",
    `| strategy | new | runs | skipped | hard | same twice | on the front of an input | ms | ${axes.join(" | ")} |`,
    `|---|---|---:|---:|---:|---|---:|---:|${axes.map(() => "---:").join("|")}|`,
    ...summary.strategies.map(
      (s) =>
        `| ${s.strategy} | ${s.candidate ? "yes" : ""} | ${s.runs} | ${s.skipped} | ${s.hardTotal} | ${s.deterministic ? "yes" : "no"} | ${s.onFront} | ${fmt(s.ms)} | ${summary.objectives.map((o) => fmt(s.medians[o.key])).join(" | ")} |`,
    ),
    "",
    `Pareto front over the medians: ${summary.front.join(", ") || "-"}.`,
    `Not on the front because of a hard rule, no run or two different outputs: ${summary.excluded.join(", ") || "-"}.`,
  ];
  if (summary.predictions.length > 0) {
    lines.push("", "| prediction | strategy | input | measure | expected | measured | met | reason |", "|---|---|---|---|---:|---:|---|---|");
    for (const p of summary.predictions)
      lines.push(`| ${p.id} | ${p.strategy} | ${p.input ?? "median"} | ${p.measure} | ${p.op} ${fmt(p.expected)} | ${fmt(p.measured)} | ${p.met === undefined ? "-" : p.met ? "yes" : "no"} | ${p.reason} |`);
  }
  return lines.join("\n") + "\n";
}
