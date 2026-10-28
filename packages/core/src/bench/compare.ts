import type { CurveSegment } from "../curves/model.ts";
import { polylineLength, type Box } from "../geom.ts";
import { highwayRouterStrategy } from "../highways/router.ts";
import type { Graph, LevelLink, Node, Result } from "../model.ts";
import { openGaps, roomLinks } from "../room/index.ts";
import { cornersRouter } from "../routers/corners.ts";
import { sectionsRouter } from "../routers/sections.ts";
import type { Section } from "../sections.ts";
import { runKey, segmentsOf } from "../segments.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { asRouter, createRegistry, defineStrategy, getStrategy, listStrategies, STEPS, type AnyStrategy, type LaneBoard, type Registry, type Step, type Strategy } from "../strategies/model.ts";
import { peakCurvature } from "./curves.ts";
import { measureLevelFaults, sumFaults } from "./links.ts";
import { paretoFront, type Objective } from "./measures/pareto.ts";
import { roomOrderFaults } from "./measures/room.ts";
import { boardUnit } from "./measures/routes.ts";
import { changeGraph, routeStability } from "./measures/stability.ts";
import { farLinks, measureBoard } from "./room.ts";
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

/**
 * The steps whose strategies give no routes alone. `compareAnyStep` and the screen compare each strategy of these steps as a router (`stepRouterStrategy`).
 * The step `highway` gives a plan, the step `plugs` gives the plugs, the step `levels` gives the zoom levels, and the step `whole` gives a board with its routes.
 */
export type RoutedStep = "plugs" | "highway" | "levels" | "whole";

/** The steps of `RoutedStep`, in the order of the pipeline. */
export const ROUTED_STEPS: readonly RoutedStep[] = ["plugs", "highway", "levels", "whole"];

/** This function tells if a step is a step of `RoutedStep`. */
export const isRoutedStep = (step: Step): step is RoutedStep => (ROUTED_STEPS as readonly Step[]).includes(step);

/**
 * The steps that `compareStep` compares. The step `room` takes a packed board, not a graph, so it is not in the list.
 * The steps of `RoutedStep` give no routes alone, so they are not in the list. `compareAnyStep` compares them as routers.
 */
export type CompareStep = Exclude<Step, "room" | RoutedStep>;

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

// The core runs in any host, so it reads the clock without the types of Node or the browser.
const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

/** The steps that `compareAnyStep` compares: each step of `STEPS`, in the order of the pipeline. */
export const COMPARE_ALL_STEPS: readonly Step[] = STEPS;

/**
 * This function gives a router for each highway strategy of a registry, in the order of the registry.
 * Each router makes the plan of its strategy and routes the plan with `follow` (`highwayRouterStrategy`).
 * The screen and `compareAnyStep` compare the highway strategies as these routers.
 */
export function highwayRouters(registry: Registry): Strategy<"router">[] {
  return listStrategies(registry, "highway").map((s) => highwayRouterStrategy(s) as Strategy<"router">);
}

/**
 * This function gives a router strategy that runs a strategy of a step of `RoutedStep`. The router has the name, the options and the schema of the strategy.
 * - A highway strategy makes its plan, and `follow` routes the plan (`highwayRouterStrategy`).
 * - A plug rule gives the plugs of the router `corners` (its option `plug`).
 * - A level rule gives the zoom levels of the router `sections` (its option `level`).
 * - A whole strategy gives the routes of its output. A room strategy in its options can change the board, but the measures read the input graph.
 */
export function stepRouterStrategy(strategy: Strategy<RoutedStep>): Strategy<"router"> {
  if (strategy.step === "highway") return highwayRouterStrategy(strategy as Strategy<"highway">) as Strategy<"router">;
  const { name, describe, defaults } = strategy;
  const own = (maxNodes: number | undefined, route: (graph: Graph, options: object) => Result): Strategy<"router"> =>
    defineStrategy<"router", object>({
      step: "router",
      name,
      describe,
      defaults,
      ...(strategy.schema === undefined ? {} : { schema: strategy.schema }),
      ...(maxNodes === undefined ? {} : { maxNodes }),
      run: route,
    });
  if (strategy.step === "plugs") return own(strategy.maxNodes ?? 10_000, (graph, o) => cornersRouter({ name, plug: strategy as Strategy<"plugs">, plugOptions: o }).route(graph));
  if (strategy.step === "levels") return own(strategy.maxNodes ?? 100_000, (graph, o) => sectionsRouter({ name, level: strategy as Strategy<"levels">, levelOptions: o }).route(graph));
  return own(strategy.maxNodes, (graph, o) => (strategy as Strategy<"whole">).run(graph, o).result);
}

/** This function gives a router for each strategy of one step of `RoutedStep` in a registry, in the order of the registry (`stepRouterStrategy`). */
export function stepRouters(registry: Registry, step: RoutedStep): Strategy<"router">[] {
  return (listStrategies(registry, step) as readonly Strategy<RoutedStep>[]).map((s) => stepRouterStrategy(s));
}

/** One strategy of any step on one graph: a row of `compareStep`, or a row of the steps `highway` and `room`. */
export interface AnyCompareRow extends Omit<CompareRow, "step"> {
  readonly step: Step;
  /** The boxes of the board that the room strategy opens, in the order of the nodes, for the step `room`. */
  readonly boxes?: readonly Box[];
  /** The links of the far view on the board that the room strategy opens, for the step `room`. */
  readonly links?: readonly LevelLink[];
}

/** The comparison of the strategies of any step on one graph. */
export interface AnyStepComparison extends Omit<StepComparison, "step" | "rows"> {
  readonly step: Step;
  /** One row for each strategy of the step, in the order of the registry. */
  readonly rows: readonly AnyCompareRow[];
}

/** The options of `compareAnyStep`. */
export interface AnyCompareOptions extends CompareOptions {
  /** This function gets each row when its strategy is done, with the number of rows that are done and the number of all rows. A host can show the progress. */
  readonly onRow?: (row: AnyCompareRow, done: number, total: number) => void;
}

/** This function gives the area of the bounding box of the nodes. */
function boundsArea(nodes: readonly Node[]): number {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  return nodes.length ? (x1 - x0) * (y1 - y0) : 0;
}

/**
 * This function gives the measures of a board that a room strategy opened.
 * It uses the keys and the lane spacing 4 of the step `room` of `runSuite`.
 * The measures are the area against the board before (`M1.area`), the lane routes through a box (`M4.laneThrough`), the faults of the far view and `room-order`.
 */
export function roomValues(graph: Graph, open: readonly Node[]): Record<string, number> {
  const area0 = boundsArea(graph.nodes);
  const m = measureBoard({ nodes: open, edges: graph.edges }, 4);
  return {
    "M1.area": area0 > 0 ? boundsArea(open) / area0 : 1,
    "M4.laneThrough": m.laneThrough,
    crossings: m.crossings,
    through: m.faults.through,
    "R6.worstDetour": m.faults.worstDetour,
    "room-order": roomOrderFaults(graph.nodes, open),
  };
}

/** This function runs one room strategy on the boxes of a graph, opens the gaps of the board and measures the open board. */
function roomRow(strategy: Strategy<"room">, graph: Graph, options: object | undefined): AnyCompareRow {
  const t0 = now();
  const gaps = strategy.run({ items: graph.nodes, links: roomLinks(graph) }, options);
  const open = openGaps(graph.nodes, gaps);
  const ms = now() - t0;
  const values = { ...roomValues(graph, open), ms };
  return { step: "room", strategy: strategy.name, violations: 0, ms, values, boxes: open.map((n) => n.box), links: farLinks({ nodes: open, edges: graph.edges }) };
}

/** This function runs one strategy of one step on one graph, as `compareAnyStep` does. */
function compareOne(step: Step, strategy: AnyStrategy, graph: Graph, registry: Registry, options: CompareOptions): AnyCompareRow {
  if (step === "room") return roomRow(strategy as Strategy<"room">, graph, options.options?.[strategy.name]);
  if (isRoutedStep(step)) {
    const one = createRegistry([stepRouterStrategy(strategy as Strategy<RoutedStep>) as AnyStrategy]);
    return { ...compareStep("router", graph, { ...options, registry: one }).rows[0]!, step };
  }
  const curveRouter = step === "curve" ? [getStrategy(registry, "router", options.curveRouter ?? "corners") as AnyStrategy] : [];
  return compareStep(step, graph, { ...options, registry: createRegistry([...curveRouter, strategy]) }).rows[0]!;
}

/**
 * This function runs each strategy of any step of `STEPS` on one graph and measures it. Then it gives the Pareto front of `FRONT_OBJECTIVES`.
 * The steps `group`, `router` and `curve` give the rows of `compareStep`.
 * The step `highway` makes the plan of each strategy and routes it with `follow`, as the screen does. It measures the routes as the step `router`.
 * The steps `plugs`, `levels` and `whole` also run each strategy as a router (`stepRouterStrategy`), and measure the routes as the step `router`.
 * The step `room` opens the gaps of the board with each strategy (`openGaps`). It measures the open board as the step `room` of `runSuite`.
 * The step `room` expects a packed board, for example `packedGridBoard`. On a board with wide gaps, a gap opens only when its links need more room.
 *
 * The function runs one strategy at a time and gives each row to `onRow`. The same graph and the same options give the same measures. Only the times change.
 */
export function compareAnyStep(step: Step, graph: Graph, options: AnyCompareOptions = {}): AnyStepComparison {
  const registry = options.registry ?? STRATEGIES;
  const { onRow, ...rest } = options;
  const strategies = listStrategies(registry, step) as readonly AnyStrategy[];
  const rows: AnyCompareRow[] = [];
  for (const strategy of strategies) {
    const over = graph.nodes.length > (strategy.maxNodes ?? Infinity);
    const row: AnyCompareRow = over ? { step, strategy: strategy.name, violations: 0, ms: 0, values: {}, skipped: `over ${strategy.maxNodes} nodes` } : compareOne(step, strategy, graph, registry, rest);
    rows.push(row);
    onRow?.(row, rows.length, strategies.length);
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
