import type { CurveSegment } from "../curves/model.ts";
import { polylineLength } from "../geom.ts";
import type { Graph, Result } from "../model.ts";
import type { Section } from "../sections.ts";
import { runKey, segmentsOf } from "../segments.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { asRouter, getStrategy, listStrategies, type LaneBoard, type Registry, type Step } from "../strategies/model.ts";
import { peakCurvature } from "./curves.ts";
import { measureLevelFaults, sumFaults } from "./links.ts";
import { paretoFront, type Objective } from "./measures/pareto.ts";
import { boardUnit } from "./measures/routes.ts";
import { changeGraph, routeStability } from "./measures/stability.ts";
import { benchRun } from "./run.ts";
import { curveRuns, fixtureGroupOptions, FRONT_OBJECTIVES, groupRun, routeMeasures } from "./suite.ts";

/** This function gives the median of a list that can hold `Infinity`. An empty list gives 0. */
function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  if (s.length % 2 === 1) return s[mid]!;
  const [a, b] = [s[mid - 1]!, s[mid]!];
  return a === b ? a : (a + b) / 2;
}

/**
 * This function gives the measures of the level links of a result: the links through a box (`Z3.through`) and the length of all links (`Z3.length`).
 * A result without a level with groups gives no measure.
 */
function levelLinkMeasures(result: Result): Record<string, number> {
  const levels = (result.levels ?? []).filter((l) => l.items.some((i) => i.nodes.length > 1));
  if (levels.length === 0) return {};
  const length = levels.reduce((sum, l) => sum + l.links.reduce((s, k) => s + polylineLength(k.points), 0), 0);
  return { "Z3.through": sumFaults(measureLevelFaults(result)).through, "Z3.length": length };
}

/** This function gives the lanes of a result with each shared segment open. A result without shared segments gives `undefined`. */
function laneBoard(result: Result, lanes: { readonly width: number; readonly maxWidth?: number }): LaneBoard | undefined {
  const graph = segmentsOf(result);
  const open = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  if (open.size === 0) return undefined;
  return { graph, open, width: lanes.width, ...(lanes.maxWidth === undefined ? {} : { maxWidth: lanes.maxWidth }) };
}

/** The steps that `compareStep` compares. The step `room` takes a packed board, not a graph, so it is not in the list. */
export type CompareStep = Exclude<Step, "room">;

/** The steps that `compareStep` compares, in the order of the pipeline. */
export const COMPARE_STEPS: readonly CompareStep[] = ["group", "router", "curve"];

/** The options of `compareStep`. */
export interface CompareOptions {
  /** The strategies of each step. The default is the registry of the built-in strategies. */
  readonly registry?: Registry;
  /** The options of each strategy of the step, by its name. A strategy without an entry gets its defaults. */
  readonly options?: Readonly<Record<string, object>>;
  /** The router whose routes the step `curve` draws. The default is `corners`, as in `runSuite`. */
  readonly curveRouter?: string;
  /**
   * With this value, the step `curve` opens each shared segment of the routes of `curveRouter`, and each curve draws the lanes of `laneRoutes`.
   * So the curve `highway` bends the lanes of a bundle as one. Without it, each curve draws the routes. A router without shared segments gives the routes in both cases.
   */
  readonly lanes?: { readonly width: number; readonly maxWidth?: number };
  /** The seed of the small change of the graph for the stability measures (Z10 and G9). The default is 1. */
  readonly seed?: number;
  /** The route stability (Z10) routes a changed graph again, so the function measures it only up to this number of nodes. The default is 1000. */
  readonly stabilityMax?: number;
  /** The name of the graph in the rows. The default is `board`. */
  readonly name?: string;
}

/** One strategy of one step on one graph: its measures and its output. */
export interface CompareRow {
  readonly step: CompareStep;
  readonly strategy: string;
  /** The violations of the hard rules, as `runSuite` counts them. A strategy with a violation does not enter the front. */
  readonly violations: number;
  /** The time of the step, in milliseconds. For the step `router`, it is the median of two routes. */
  readonly ms: number;
  /**
   * The measures, by the keys of `runSuite`, and `ms`. The step `router` adds `ink`, and the step `curve` adds `C5.peak`.
   * A router with zoom levels also gets `Z3.through` and `Z3.length`, the measures of its level links.
   */
  readonly values: Readonly<Record<string, number>>;
  /** The reason when the strategy did not run, for example a graph over its `maxNodes`. */
  readonly skipped?: string;
  /** The result of the router, for the steps `router` and `group`. The step `group` routes with `sections` on the tree of the rule. */
  readonly result?: Result;
  /** The tree of the grouping rule, for the step `group`. */
  readonly tree?: Section;
  /** The segments of each curve, for the step `curve`, in the order of `edges`. */
  readonly curves?: readonly CurveSegment[][];
  /** The edge of each curve of `curves`. */
  readonly edges?: readonly string[];
}

/** The comparison of the strategies of one step on one graph. */
export interface StepComparison {
  readonly step: CompareStep;
  /** One row for each strategy of the step, in the order of the registry. */
  readonly rows: readonly CompareRow[];
  /** The axes of the Pareto front: `FRONT_OBJECTIVES` of the step. */
  readonly objectives: readonly Objective[];
  /** The strategies on the Pareto front, in the order of the registry. */
  readonly front: readonly string[];
  /** The strategies with a violation of a hard rule, or that did not run. They do not enter the front. */
  readonly excluded: readonly string[];
}

/**
 * This function runs each strategy of one step on one graph and measures it with the measures of `runSuite`. Then it gives the Pareto front.
 * The step `router` routes the graph with each router. The step `curve` draws the routes of `curveRouter` with each curve, or their lanes with the option `lanes`.
 * The step `group` routes the graph with `sections` on the tree of each grouping rule.
 *
 * The same graph and the same options give the same measures. Only the times change.
 */
export function compareStep(step: CompareStep, graph: Graph, options: CompareOptions = {}): StepComparison {
  const registry = options.registry ?? STRATEGIES;
  const own = options.options ?? {};
  const name = options.name ?? "board";
  const seed = options.seed ?? 1;
  const stabilityMax = options.stabilityMax ?? 1000;
  const at = { fixture: name, seed: 0 };
  let rows: CompareRow[];
  if (step === "router") {
    const change = graph.nodes.length <= stabilityMax ? changeGraph(graph, seed) : undefined;
    rows = listStrategies(registry, "router").map((strategy): CompareRow => {
      if (graph.nodes.length > (strategy.maxNodes ?? Infinity)) return { step, strategy: strategy.name, violations: 0, ms: 0, values: {}, skipped: `over ${strategy.maxNodes} nodes` };
      const router = asRouter(strategy, own[strategy.name]);
      const { row, result } = benchRun(router, name, graph, 2);
      const values: Record<string, number> = { ...routeMeasures(graph, result, row), ...levelLinkMeasures(result), ink: row.quality.ink, ms: row.ms };
      if (change) {
        const s = routeStability(graph, result, router.route(change.graph), { seed });
        values["Z10.mean"] = s.mean;
        values["Z10.max"] = s.max;
        values["Z10.moved"] = s.moved;
      }
      return { step, strategy: strategy.name, violations: row.violations + (row.deterministic ? 0 : 1), ms: row.ms, values, result };
    });
  } else if (step === "curve") {
    const router = asRouter(getStrategy(registry, "router", options.curveRouter ?? "corners"));
    const result = router.route(graph);
    const u = boardUnit(graph);
    const lanes = options.lanes && laneBoard(result, options.lanes);
    const runs = curveRuns(graph, result, listStrategies(registry, "curve"), {
      ...at,
      smooth: new Set(["rounded", "arc", "spline", "smooth", "clothoid", "highway"]),
      normals: new Set(["spline"]),
      curveOptions: own,
      ...(lanes ? { lanes } : {}),
    });
    rows = runs.map(({ row, drawn, edges }): CompareRow => {
      const peaks = drawn.map((d) => peakCurvature(d) * u);
      const values = { ...row.values, "C5.peak": medianOf(peaks), ms: row.ms };
      return { step, strategy: row.strategy, violations: row.violations, ms: row.ms, values, curves: drawn, edges };
    });
  } else {
    const change = changeGraph(graph, seed);
    rows = listStrategies(registry, "group").map((strategy): CompareRow => {
      const opts = { ...fixtureGroupOptions(strategy.name, graph), ...own[strategy.name] };
      const changed = { ...fixtureGroupOptions(strategy.name, change.graph), ...own[strategy.name] };
      const run = groupRun(graph, strategy, opts, { graph: change.graph, options: changed }, at);
      const ms = run.row.treeMs ?? run.row.ms;
      const values = { ...run.row.values, ms };
      return { step, strategy: strategy.name, violations: run.row.violations, ms, values, tree: run.tree, ...(run.result ? { result: run.result } : {}) };
    });
  }
  const objectives = FRONT_OBJECTIVES[step];
  const fair = rows.filter((r) => r.violations === 0 && r.skipped === undefined);
  return {
    step,
    rows,
    objectives,
    front: paretoFront(fair, (r) => r.values, objectives).map((r) => r.strategy),
    excluded: rows.filter((r) => !fair.includes(r)).map((r) => r.strategy),
  };
}
