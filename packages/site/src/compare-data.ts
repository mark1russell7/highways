import {
  checkOptions,
  clampOptions,
  compareStep,
  COMPARE_STEPS,
  farLevel,
  FIXTURES,
  laneRoutes,
  listOptions,
  listStrategies,
  makeFixture,
  runKey,
  segmentsOf,
  STRATEGIES,
  toSvgPath,
  type AnyOption,
  type Box,
  type CompareRow,
  type CompareStep,
  type Graph,
  type Objective,
  type Point,
  type Registry,
  type Result,
  type Route,
  type Strategy,
} from "@mark1russell7/highways";
import { BOARDS } from "./boards.ts";

/** The largest board of the compare page, in nodes. Each strategy of a step runs on the board, so the board stays small. */
export const COMPARE_MAX_NODES = 100;

/** A board of the compare page: an example board or a small fixture, all with made-up data. */
export interface CompareBoard {
  readonly id: string;
  readonly name: string;
  readonly nodes: number;
  readonly edges: number;
  readonly graph: Graph;
}

/** The boards of the compare page: the example boards, then the fixtures up to `COMPARE_MAX_NODES` nodes. */
export const COMPARE_BOARDS: readonly CompareBoard[] = [
  ...BOARDS.map((make) => make()).map((b) => ({ id: b.id, name: b.name, graph: b.graph })),
  ...FIXTURES.filter((f) => f.nodes <= COMPARE_MAX_NODES).map((f) => ({ id: f.name, name: `Fixture ${f.name}`, graph: makeFixture(f) })),
]
  .filter((b) => b.graph.nodes.length <= COMPARE_MAX_NODES)
  .map((b) => ({ ...b, nodes: b.graph.nodes.length, edges: b.graph.edges.length }));

/** The router whose routes the step `curve` draws. It shares the ways of the edges, so the board has bundles for the curve `highway`. */
export const CURVE_ROUTER = "shared";

/**
 * The lanes of a shared way, in units of the board: the distance between two lanes and the largest width of a bundle.
 * The live demo uses the same values.
 * The panels of the steps `router` and `curve` open each shared way into one lane for each edge.
 */
export const LANES = { width: 5, maxWidth: 30 } as const;

/** The names of the steps on the page. */
export const STEP_NAMES: Readonly<Record<CompareStep, string>> = { group: "Grouping", router: "Router", curve: "Curve" };

/** The kind of a measure value: a count, a share from 0 to 1, a time or a plain number. */
export type MeasureKind = "count" | "share" | "ms" | "number";

/** A measure of the page: a key of `compareStep`, a short name and the direction that is better. */
export interface MeasureColumn {
  readonly key: string;
  readonly label: string;
  /** One short sentence that tells the measure. */
  readonly describe: string;
  /** The direction that is better. A measure without it gets no best mark. */
  readonly better?: "min" | "max";
  readonly kind: MeasureKind;
  /** The number of decimals of a plain number. */
  readonly digits?: number;
}

const TIME: MeasureColumn = { key: "ms", label: "Time", describe: "The time of the step on this device.", better: "min", kind: "ms" };

/** The measures of each step, in the order of the page. Each key is a key of the suite, so the page and the benchmark agree. */
export const COLUMNS: Readonly<Record<CompareStep, readonly MeasureColumn[]>> = {
  router: [
    { key: "R9.through", label: "Through", describe: "Routes that go through a box that is not an end.", better: "min", kind: "count" },
    { key: "R1.crossings", label: "Crossings", describe: "Points where two routes cross.", better: "min", kind: "count" },
    { key: "R6.worstDetour", label: "Worst detour", describe: "The longest route, divided by the straight line between its ends.", better: "min", kind: "number", digits: 2 },
    { key: "ink", label: "Total length", describe: "The length of all routes. A shared part counts one time.", better: "min", kind: "number", digits: 0 },
    { key: "R5.median", label: "Median detour", describe: "The median route length, divided by the straight line between its ends.", better: "min", kind: "number", digits: 2 },
    { key: "R4.turn", label: "Mean turn", describe: "The mean total turn of a route, in half turns.", better: "min", kind: "number", digits: 2 },
    { key: "B1.inkSaved", label: "Ink saved", describe: "The share of the length that the shared parts save.", better: "max", kind: "share" },
    { key: "Z3.through", label: "Level through", describe: "Links of the zoom levels that go through a box. Only a router with zoom levels has them.", better: "min", kind: "count" },
    { key: "Z3.length", label: "Level length", describe: "The length of all links of the zoom levels. Only a router with zoom levels has them.", better: "min", kind: "number", digits: 0 },
    TIME,
  ],
  curve: [
    { key: "C1.share", label: "Sharp curves", describe: "The share of curves with a tangent break of more than 0.5 degrees.", better: "min", kind: "share" },
    { key: "C1.max", label: "Worst break", describe: "The largest tangent break, in degrees.", better: "min", kind: "number", digits: 1 },
    { key: "C2.median", label: "Curvature jump", describe: "The median jump of the curvature at a joint, times the board unit.", better: "min", kind: "number", digits: 2 },
    { key: "C5.peak", label: "Peak curvature", describe: "The median peak curvature of a curve, times the board unit. A sharp corner is infinite.", better: "min", kind: "number", digits: 2 },
    { key: "C3.median", label: "Bending energy", describe: "The median bending energy of a curve.", better: "min", kind: "number", digits: 1 },
    { key: "C6.length", label: "Length ratio", describe: "The length of the curves, divided by the length of the routes.", better: "min", kind: "number", digits: 3 },
    { key: "curve-clear", label: "Through a box", describe: "Curves that go through a box that the route avoids.", better: "min", kind: "count" },
    { key: "curve-simple", label: "Loops", describe: "Curves that cross themselves or have a cusp.", better: "min", kind: "count" },
    { key: "curve-g1", label: "G1 faults", describe: "Curves of a smooth type with a tangent break.", better: "min", kind: "count" },
    { key: "curve-ends", label: "End faults", describe: "Curves that do not leave along the normal of the plug.", better: "min", kind: "count" },
    TIME,
  ],
  group: [
    { key: "G2.cut", label: "Cut links", describe: "The share of the edges between two groups of the far view.", better: "min", kind: "share" },
    { key: "Z4.farItems", label: "Far items", describe: "The number of items in the far view.", kind: "count" },
    { key: "G1.modularity", label: "Modularity", describe: "How much more the edges stay in their groups than by chance.", better: "max", kind: "number", digits: 3 },
    { key: "G6.balance", label: "Balance", describe: "1 for groups of equal size in the far view.", better: "max", kind: "number", digits: 2 },
    { key: "G8.treeCost", label: "Tree cost", describe: "The size of the smallest group that holds the two ends of an edge, on average.", better: "min", kind: "number", digits: 3 },
    { key: "G9.ari", label: "Stability", describe: "How much the groups stay the same after a small change of the board.", better: "max", kind: "number", digits: 2 },
    { key: "Z7.position", label: "Position shift", describe: "How far an item moves from one zoom level to the next.", better: "min", kind: "number", digits: 2 },
    { key: "Z8.order", label: "Order kept", describe: "How well the items keep the order of their nodes.", better: "max", kind: "number", digits: 2 },
    { key: "Z3.through", label: "Level through", describe: "Level links that go through a box.", better: "min", kind: "count" },
    { ...TIME, describe: "The time of the grouping rule on this device." },
  ],
};

/** The values of the options of each strategy, by the name of the strategy and the key of the option. */
export type OptionValues = Readonly<Record<string, Readonly<Record<string, number | boolean | string>>>>;

/** The state of the page. The URL hash keeps it. */
export interface CompareState {
  readonly step: CompareStep;
  readonly board: string;
  /** The options that differ from the defaults. */
  readonly options: OptionValues;
}

/** The first state of the page. */
export const START: CompareState = { step: "router", board: "delivery", options: {} };

/** An option that a control can set: a number, a whole number, a boolean or a value of a list. */
export type ControlOption = Extract<AnyOption, { readonly type: "number" | "integer" | "boolean" | "enum" }>;

const isControl = (d: AnyOption): d is ControlOption => d.type === "number" || d.type === "integer" || d.type === "boolean" || d.type === "enum";

/** This function gives the options of a strategy that a control can set, with the default value of each one. */
export function controlOptions(strategy: Strategy<CompareStep, object>): { readonly key: string; readonly declaration: ControlOption; readonly value: unknown }[] {
  return listOptions(strategy).filter((o): o is typeof o & { declaration: ControlOption } => isControl(o.declaration));
}

/** This function reads one option value from the text of the hash. It gives `undefined` for text that does not fit the declaration. */
function readValue(text: string, d: ControlOption): number | boolean | string | undefined {
  if (d.type === "boolean") return text === "true" ? true : text === "false" ? false : undefined;
  if (d.type === "enum") return d.values.includes(text) ? text : undefined;
  const v = Number(text);
  return Number.isNaN(v) || text.trim() === "" ? undefined : v;
}

/**
 * This function keeps the options that a strategy of the step declares, with the values that fit the declaration.
 * It moves a number into its range. It drops an unknown key, a value of the wrong type and a value that equals the default.
 */
export function cleanOptions(step: CompareStep, options: OptionValues, registry: Registry = STRATEGIES): OptionValues {
  const out: Record<string, Record<string, number | boolean | string>> = {};
  for (const strategy of listStrategies(registry, step) as readonly Strategy<CompareStep, object>[]) {
    const given = options[strategy.name];
    if (!given) continue;
    const controls = new Map(controlOptions(strategy).map((o) => [o.key, o]));
    const known = Object.fromEntries(Object.entries(given).filter(([k]) => controls.has(k)));
    const clamped = clampOptions(strategy, known) as Record<string, number | boolean | string>;
    const bad = new Set(checkOptions(strategy, clamped).map((i) => i.key));
    const kept = Object.entries(clamped).filter(([k, v]) => !bad.has(k) && !Object.is(v, controls.get(k)!.value));
    if (kept.length > 0) out[strategy.name] = Object.fromEntries(kept);
  }
  return out;
}

/** This function reads the state of the page from the URL hash, for example `#step=curve&board=delivery&arc.radius=20`. */
export function parseHash(hash: string, registry: Registry = STRATEGIES): CompareState {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const stepText = params.get("step");
  const step = COMPARE_STEPS.find((s) => s === stepText) ?? START.step;
  const boardText = params.get("board");
  const board = COMPARE_BOARDS.some((b) => b.id === boardText) ? boardText! : START.board;
  const options: Record<string, Record<string, number | boolean | string>> = {};
  for (const strategy of listStrategies(registry, step) as readonly Strategy<CompareStep, object>[]) {
    for (const o of controlOptions(strategy)) {
      const text = params.get(`${strategy.name}.${o.key}`);
      if (text === null) continue;
      const v = readValue(text, o.declaration);
      if (v !== undefined) (options[strategy.name] ??= {})[o.key] = v;
    }
  }
  return { step, board, options: cleanOptions(step, options, registry) };
}

/** This function writes the state of the page as a URL hash. The hash keeps only the options that differ from the defaults. */
export function formatHash(state: CompareState): string {
  const params = new URLSearchParams({ step: state.step, board: state.board });
  for (const [name, values] of Object.entries(state.options)) for (const [key, v] of Object.entries(values)) params.set(`${name}.${key}`, String(v));
  return `#${params.toString()}`;
}

/** One measure of a panel. */
export interface PanelMeasure {
  readonly key: string;
  readonly label: string;
  /** The value. `NaN` is a measure that the strategy does not have. */
  readonly value: number;
  /** The panel has the best value of the measure among the strategies without a violation. */
  readonly best: boolean;
}

/** A path of a drawing, as SVG path data, with a width in units of the board. */
export interface DrawnPath {
  readonly d: string;
  readonly width: number;
}

/** The drawing of one panel, in the coordinates of the board. */
export interface Drawing {
  /** The view box: the bounds of the boxes, with a margin. */
  readonly view: Box;
  readonly boxes: readonly Box[];
  /** The groups of the far view, for the step `group`. */
  readonly groups: readonly Box[];
  readonly paths: readonly DrawnPath[];
}

/** One panel: one strategy of the step, with its measures and its drawing. */
export interface Panel {
  readonly strategy: string;
  readonly describe: string;
  /** The options that the strategy ran with, when they differ from the defaults. */
  readonly options: Readonly<Record<string, number | boolean | string>>;
  readonly violations: number;
  readonly skipped?: string;
  /** The strategy is on the Pareto front of the step. */
  readonly front: boolean;
  readonly measures: readonly PanelMeasure[];
  readonly drawing: Drawing;
}

/** The panels of one step on one board. */
export interface ComparePanels {
  readonly step: CompareStep;
  readonly board: string;
  readonly nodes: number;
  readonly edges: number;
  /** The axes of the Pareto front. */
  readonly objectives: readonly Objective[];
  readonly panels: readonly Panel[];
  /** The time of the strategies and of the measures, in milliseconds. */
  readonly ms: number;
}

const r1 = (v: number): string => String(Math.round(v * 10) / 10);

/** This function writes a polyline as SVG path data. */
const polylinePath = (points: readonly Point[]): string => points.map((p, i) => `${i === 0 ? "M" : "L"}${r1(p.x)} ${r1(p.y)}`).join("");

/** This function gives the bounds of the boxes, with a margin of 4% of the larger side. */
function viewOf(boxes: readonly Box[]): Box {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
  const m = 0.04 * Math.max(x1 - x0, y1 - y0, 1);
  return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
}

/** This function gives the routes of a result, with one lane for each edge of a shared way. A result without shared ways gives its routes. */
function lanesOf(result: Result): readonly Route[] {
  const graph = segmentsOf(result);
  const open = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  return open.size === 0 ? result.routes : laneRoutes(graph, open, LANES.width, LANES.maxWidth);
}

/** This function gives the drawing of one row: the routes, the curves, or the groups and the links of the far view. */
function drawingOf(graph: Graph, row: CompareRow): Drawing {
  const boxes = graph.nodes.map((n) => n.box);
  const view = viewOf(boxes);
  if (row.step === "curve") return { view, boxes, groups: [], paths: (row.curves ?? []).map((c) => ({ d: toSvgPath(c, 1), width: 1 })) };
  if (row.step === "router") return { view, boxes, groups: [], paths: (row.result ? lanesOf(row.result) : []).map((r) => ({ d: polylinePath(r.points), width: 1 })) };
  const far = farLevel(row.result?.levels ?? []);
  const groups = (far?.items ?? []).filter((i) => i.nodes.length > 1).map((i) => i.box);
  const paths = (far?.links ?? []).map((l) => ({ d: polylinePath(l.points), width: Math.min(6, 1 + Math.log2(l.count)) }));
  return { view, boxes, groups, paths };
}

/** This function tells if a value is the best value `best` of a measure, with a small tolerance for the sums of floating point numbers. */
const same = (v: number, best: number): boolean => v === best || Math.abs(v - best) <= 1e-9 * Math.max(1, Math.abs(best));

/**
 * This function gives the best value of each measure of the step, over the rows without a violation. It skips a value that is not a number.
 * A measure without a direction, or without a finite best value, gets no entry.
 */
export function bestValues(step: CompareStep, rows: readonly CompareRow[]): Map<string, number> {
  const fair = rows.filter((r) => r.violations === 0 && r.skipped === undefined);
  const out = new Map<string, number>();
  for (const c of COLUMNS[step]) {
    if (!c.better) continue;
    const values = fair.map((r) => r.values[c.key]).filter((v): v is number => v !== undefined && !Number.isNaN(v));
    if (values.length === 0) continue;
    const best = c.better === "min" ? Math.min(...values) : Math.max(...values);
    if (Number.isFinite(best)) out.set(c.key, best);
  }
  return out;
}

/** The options of `computePanels`. */
export interface PanelOptions {
  /** The strategies of each step. The default is the registry of the built-in strategies. */
  readonly registry?: Registry;
}

/**
 * This function runs each strategy of the step of the state on its board, with the options of the state. It gives one panel for each strategy.
 * The panels come from the registry, so a new strategy gets its panel with no change to the page.
 * The worker of the page calls it, so the page stays responsive.
 */
export function computePanels(state: CompareState, options: PanelOptions = {}): ComparePanels {
  const registry = options.registry ?? STRATEGIES;
  const board = COMPARE_BOARDS.find((b) => b.id === state.board) ?? COMPARE_BOARDS[0]!;
  const own = cleanOptions(state.step, state.options, registry);
  const t0 = performance.now();
  const result = compareStep(state.step, board.graph, { registry, options: own, name: board.id, curveRouter: CURVE_ROUTER, lanes: LANES });
  const ms = performance.now() - t0;
  const best = bestValues(state.step, result.rows);
  const describe = new Map(listStrategies(registry, state.step).map((s) => [s.name, s.describe]));
  const panels = result.rows.map((row): Panel => {
    const fair = row.violations === 0 && row.skipped === undefined;
    return {
      strategy: row.strategy,
      describe: describe.get(row.strategy) ?? "",
      options: own[row.strategy] ?? {},
      violations: row.violations,
      ...(row.skipped === undefined ? {} : { skipped: row.skipped }),
      front: result.front.includes(row.strategy),
      measures: COLUMNS[state.step].map((c) => {
        const value = row.values[c.key] ?? Number.NaN;
        const b = best.get(c.key);
        return { key: c.key, label: c.label, value, best: fair && b !== undefined && same(value, b) };
      }),
      drawing: drawingOf(board.graph, row),
    };
  });
  return { step: state.step, board: board.id, nodes: board.nodes, edges: board.edges, objectives: result.objectives, panels, ms };
}

/** This function writes a measure value for the page. */
export function formatValue(value: number, column: MeasureColumn): string {
  if (Number.isNaN(value)) return "–";
  if (value === Infinity) return "∞";
  if (column.kind === "count") return new Intl.NumberFormat("en-US").format(Math.round(value));
  if (column.kind === "share") return `${(100 * value).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
  if (column.kind === "ms") return value < 10 ? `${value.toFixed(1)} ms` : `${Math.round(value)} ms`;
  return value.toFixed(column.digits ?? 2);
}
