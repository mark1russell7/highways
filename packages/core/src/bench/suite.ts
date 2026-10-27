import { packedGridBoard } from "../cases.ts";
import { curveSpace, sampleCurve } from "../curves/index.ts";
import { FIXTURES, makeFixture, type FixtureSpec } from "../fixtures.ts";
import { polylineLength } from "../geom.ts";
import { nodeIndex, type Graph, type Node, type Result } from "../model.ts";
import { nearestSide, SIDE_NORMAL } from "../plugs.ts";
import { makeRoom, openGaps, roomLinks } from "../room/index.ts";
import { sectionsRouter } from "../routers/sections.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { asRouter, listStrategies, type Registry, type Step, type Strategy } from "../strategies/model.ts";
import { measureLevelFaults, sumFaults } from "./links.ts";
import { ambiguity, inkSaved } from "./measures/bundles.ts";
import { bendingEnergy, curveFaults, g1Defect, g2Defect } from "./measures/curves.ts";
import { cutShare, farLevel, groupStability, levelGrouping, modularity, treeCost } from "./measures/groups.ts";
import { nestingFaults, orderStability, positionStability } from "./measures/levels.ts";
import { paretoFront, type Objective } from "./measures/pareto.ts";
import { roomOrderFaults } from "./measures/room.ts";
import { boardUnit, crossingAngles, detourSpread, drawnSegments, plugSpacing, totalTurn } from "./measures/routes.ts";
import { changeGraph, routeStability } from "./measures/stability.ts";
import { quantile, summarize, type Spread } from "./measures/stats.ts";
import { measureBoard } from "./room.ts";
import { benchRun, type BenchRow } from "./run.ts";

// The core runs in any host, so it reads the clock without the types of Node or the browser.
const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

/** The names of the proposed hard rules of MEAS0. The suite counts them. It does not apply them as rules yet. */
export const PROPOSED_RULES: readonly string[] = ["curve-clear", "curve-ends", "curve-g1", "curve-simple", "level-nesting", "room-order"];

/** The options of `runSuite`. */
export interface SuiteOptions {
  /** The largest fixture, in nodes. The default is 1000. */
  readonly max?: number;
  /** The number of seeds of each fixture family. The default is 5. The first seed is the seed of the fixture. */
  readonly seeds?: number;
  /** The number of timed routes of the first seed. The other seeds route two times, for the rule "same twice". The default is 3. */
  readonly repeat?: number;
  /** The route stability (Z10) routes a changed graph again, so the suite measures it only up to this number of nodes. The default is 1000. */
  readonly stabilityMax?: number;
  /** The step `curve` draws the routes of the fixtures up to this number of nodes. The default is 1000. */
  readonly curveMax?: number;
  /** The router whose routes the step `curve` draws. The default is `corners`. */
  readonly curveRouter?: string;
  /** The curve strategies that are G1 by their design. The rule `curve-g1` examines them. The default is `rounded`, `arc` and `spline`. */
  readonly smoothCurves?: readonly string[];
  /** The curve strategies that read the normals of the plugs. The rule `curve-ends` examines their end tangents. The default is `spline`. */
  readonly normalCurves?: readonly string[];
  /** The strategies of each step. The default is the registry of the built-in strategies. */
  readonly registry?: Registry;
  /** The fixtures of the families of the steps `router`, `curve` and `group`. The default is `FIXTURES`. */
  readonly fixtures?: readonly FixtureSpec[];
  /** The families of the step `room`. The default is `ROOM_FAMILIES`. */
  readonly roomFamilies?: readonly RoomFamily[];
  /** This function gets one line of progress for each fixture and seed. */
  readonly log?: (line: string) => void;
}

/** A family of packed boards for the step `room`: `packedGridBoard` with a seed for each member. */
export interface RoomFamily {
  readonly name: string;
  readonly cols: number;
  readonly rows: number;
  /** The number of long links. */
  readonly long: number;
}

/** The families of the step `room`: the board of ROOM, and a board of 1000 boxes. */
export const ROOM_FAMILIES: readonly RoomFamily[] = [
  { name: "packed-grid", cols: 12, rows: 8, long: 48 },
  { name: "packed-grid-1000", cols: 40, rows: 25, long: 500 },
];

/** One row of the suite: one strategy of one step on one member of a fixture family. */
export interface SuiteRow {
  readonly step: Step;
  /** The name of the fixture family. */
  readonly fixture: string;
  /** The index of the seed in the family, from 0. */
  readonly seed: number;
  readonly strategy: string;
  readonly nodes: number;
  readonly edges: number;
  /** The violations of the hard rules of today (`checkProperties` and "same twice"). Only the step `router` checks them. */
  readonly violations: number;
  /** The time of the step and of the measures of today, in milliseconds. */
  readonly ms: number;
  /** The time of the new measures of MEAS1, without the extra runs, in milliseconds. */
  readonly measureMs: number;
  /** The time of the extra routes of the stability measures (Z10 and G9), in milliseconds. */
  readonly extraMs: number;
  /** The measures, by a key that starts with the id of MEAS0, or the name of a proposed rule. */
  readonly values: Readonly<Record<string, number>>;
}

/** The spread of each measure of one strategy on one fixture family, over the seeds. */
export interface SuiteSummary {
  readonly step: Step;
  readonly fixture: string;
  readonly strategy: string;
  readonly nodes: number;
  readonly seeds: number;
  /** The sum of the violations over the seeds. */
  readonly violations: number;
  readonly measures: Readonly<Record<string, Spread>>;
}

/** The Pareto front of one step on one fixture family, over the medians of the seeds. */
export interface SuiteFront {
  readonly step: Step;
  readonly fixture: string;
  readonly nodes: number;
  readonly objectives: readonly Objective[];
  /** The strategies on the front, in the order of the registry. */
  readonly front: readonly string[];
  /** The strategies with a violation of a hard rule. They do not enter the front. */
  readonly excluded: readonly string[];
  /** Each strategy that the front compares. */
  readonly strategies: readonly string[];
}

/** The count of one proposed hard rule for one strategy, over each fixture and each seed. */
export interface RuleCount {
  readonly step: Step;
  readonly strategy: string;
  readonly rule: string;
  readonly count: number;
}

/** The report of the suite. The workflow `Bench` keeps it as an artifact. */
export interface SuiteReport {
  readonly options: {
    readonly max: number;
    readonly seeds: number;
    readonly repeat: number;
    readonly stabilityMax: number;
    readonly curveMax: number;
    readonly curveRouter: string;
  };
  readonly rows: readonly SuiteRow[];
  readonly summaries: readonly SuiteSummary[];
  readonly fronts: readonly SuiteFront[];
  readonly rules: readonly RuleCount[];
}

/** The axes of the Pareto front of each step. The note MEAS0 asks for two to four scores. */
export const FRONT_OBJECTIVES: Readonly<Record<Step, readonly Objective[]>> = {
  router: [
    { key: "R1.perEdge", better: "min" },
    { key: "R5.median", better: "min" },
    { key: "B1.inkSaved", better: "max" },
    { key: "R4.turn", better: "min" },
  ],
  curve: [
    { key: "C1.share", better: "min" },
    { key: "C2.median", better: "min" },
    { key: "C3.median", better: "min" },
    { key: "C6.length", better: "min" },
  ],
  room: [
    { key: "M1.area", better: "min" },
    { key: "M4.laneThrough", better: "min" },
    { key: "crossings", better: "min" },
  ],
  group: [
    { key: "G1.modularity", better: "max" },
    { key: "G2.cut", better: "min" },
    { key: "G8.treeCost", better: "min" },
    { key: "G9.ari", better: "max" },
  ],
};

/** This function gives the seed of the member `k` of the family of a fixture. The member 0 is the fixture itself. */
export function familySeed(spec: FixtureSpec, k: number): number {
  return k === 0 ? spec.seed : spec.seed + 1009 * k;
}

/** This function gives the measures of the levels of a result: Z6, Z7, Z8, and G1, G2 and G8 of the far view. A result without groups gives none. */
function levelMeasures(graph: Graph, result: Result): Record<string, number> {
  const levels = result.levels ?? [];
  if (!levels.some((l) => l.items.some((i) => i.nodes.length > 1))) return {};
  const far = farLevel(levels);
  const groups = far ? levelGrouping(far) : new Map<string, string>();
  return {
    "level-nesting": nestingFaults(levels),
    "Z7.position": positionStability(levels),
    "Z8.order": orderStability(graph, levels),
    "G1.modularity": modularity(graph, groups),
    "G2.cut": cutShare(graph, groups),
    "G8.treeCost": treeCost(graph, levels),
  };
}

/** This function gives the new measures of the routes of a result (MEAS1). The row of `benchRun` gives the values of today. */
function routeMeasures(graph: Graph, result: Result, row: BenchRow): Record<string, number> {
  const routes = result.routes;
  const m = Math.max(1, graph.edges.length);
  const ca = crossingAngles(drawnSegments(routes));
  const turn = totalTurn(routes);
  const detour = detourSpread(routes);
  const plugs = plugSpacing(graph, routes);
  return {
    "R1.crossings": row.quality.crossings,
    "R1.perEdge": row.quality.crossings / m,
    "R2.angle": ca.mean,
    "R2.min": ca.min,
    "B1.inkSaved": inkSaved(routes),
    "R4.turn": turn.mean,
    "R4.max": turn.max,
    "R5.median": detour.median,
    "R5.q95": detour.q95,
    "R5.mean": detour.mean,
    "R6.worstDetour": row.faults.worstDetour,
    "R7.backtrack": row.faults.backtrack / m,
    "R9.through": row.faults.through,
    "R13.outside": row.faults.outside,
    "R11.min": plugs.min,
    "R11.q05": plugs.q05,
    "B4.ambiguity": ambiguity(graph, routes).value,
    ...levelMeasures(graph, result),
  };
}

/** The input of one curve: a route with the normals of its plugs. */
interface CurveRoute {
  readonly points: readonly { x: number; y: number }[];
  readonly startNormal: { x: number; y: number };
  readonly endNormal: { x: number; y: number };
}

/** This function draws the routes of a result with each curve strategy and measures the curves (C1, C2, C3, C6 and the curve rules). */
function curveRows(
  graph: Graph,
  result: Result,
  curves: readonly Strategy<"curve">[],
  options: { fixture: string; seed: number; smooth: ReadonlySet<string>; normals: ReadonlySet<string> },
): SuiteRow[] {
  const byId = nodeIndex(graph);
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const space = curveSpace(
    graph.nodes.map((n) => n.box),
    0.25,
  );
  const u = boardUnit(graph);
  const routes: CurveRoute[] = [];
  for (const r of result.routes) {
    const e = edges.get(r.edge);
    const s = e && byId.get(e.source.node);
    const t = e && byId.get(e.target.node);
    if (!s || !t || r.points.length < 2) continue;
    routes.push({ points: r.points, startNormal: SIDE_NORMAL[nearestSide(s.box, r.points[0]!)], endNormal: SIDE_NORMAL[nearestSide(t.box, r.points[r.points.length - 1]!)] });
  }
  const ink = routes.reduce((sum, r) => sum + polylineLength(r.points), 0);
  return curves.map((curve): SuiteRow => {
    const t0 = now();
    const drawn = routes.map((r) => curve.run({ points: r.points, startNormal: r.startNormal, endNormal: r.endNormal, space }));
    const samples = drawn.map((d) => sampleCurve(d, 0.25));
    const ms = now() - t0;
    const t1 = now();
    const g1: number[] = [];
    const g2: number[] = [];
    const energy: number[] = [];
    const rules = { "curve-clear": 0, "curve-ends": 0, "curve-g1": 0, "curve-simple": 0 };
    let length = 0;
    drawn.forEach((segments, i) => {
      const r = routes[i]!;
      const s = samples[i]!;
      g1.push(g1Defect(segments));
      g2.push(g2Defect(segments, u));
      energy.push(bendingEnergy(s, 0.25));
      length += polylineLength(s);
      const normals = options.normals.has(curve.name);
      const f = curveFaults({
        polyline: r.points,
        segments,
        samples: s,
        space,
        smooth: options.smooth.has(curve.name),
        ...(normals ? { startNormal: r.startNormal, endNormal: r.endNormal } : {}),
      });
      if (f.clear) rules["curve-clear"]++;
      if (f.ends) rules["curve-ends"]++;
      if (f.g1) rules["curve-g1"]++;
      if (f.simple) rules["curve-simple"]++;
    });
    const n = Math.max(1, drawn.length);
    const values = {
      "C1.max": g1.reduce((m, x) => Math.max(m, x), 0),
      "C1.share": g1.filter((x) => x > 0.5).length / n,
      "C2.median": quantile(g2, 0.5) || 0,
      "C2.max": g2.reduce((m, x) => Math.max(m, x), 0),
      "C3.median": quantile(energy, 0.5) || 0,
      "C3.q95": quantile(energy, 0.95) || 0,
      "C6.length": ink > 0 ? length / ink : 1,
      ...rules,
    };
    return {
      step: "curve",
      fixture: options.fixture,
      seed: options.seed,
      strategy: curve.name,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      violations: 0,
      ms,
      measureMs: now() - t1,
      extraMs: 0,
      values,
    };
  });
}

/**
 * This function gives the options of a grouping rule on a fixture. The rule `keys` gets a key from the data of the edges:
 * the collection of the first edge into the node. A node without such an edge is a group alone.
 */
export function fixtureGroupOptions(strategy: string, graph: Graph): object {
  if (strategy !== "keys") return {};
  const key = new Map<string, string>();
  for (const e of graph.edges) {
    const c = e.data?.["collection"];
    if (typeof c === "string" && !key.has(e.target.node)) key.set(e.target.node, c);
  }
  return { key: (n: Node) => key.get(n.id) };
}

/**
 * This function starts the measure suite of MEAS1. The suite measures each strategy of each step on each seed of each fixture family.
 * The step `router` keeps the rows of today in `bench` for the first seed, so the tables of the benchmark stay the same.
 */
export function runSuite(options: SuiteOptions = {}): { report: SuiteReport; bench: BenchRow[] } {
  const max = options.max ?? 1000;
  const seeds = Math.max(1, Math.floor(options.seeds ?? 5));
  const repeat = options.repeat ?? 3;
  const stabilityMax = options.stabilityMax ?? 1000;
  const curveMax = options.curveMax ?? 1000;
  const curveRouter = options.curveRouter ?? "corners";
  const registry = options.registry ?? STRATEGIES;
  const smooth = new Set(options.smoothCurves ?? ["rounded", "arc", "spline"]);
  const normals = new Set(options.normalCurves ?? ["spline"]);
  const log = options.log ?? ((): void => {});
  const fixtures = (options.fixtures ?? FIXTURES).filter((f) => f.nodes <= max);
  const routers = listStrategies(registry, "router");
  const curves = listStrategies(registry, "curve");
  const groups = listStrategies(registry, "group");
  const rooms = listStrategies(registry, "room");
  const rows: SuiteRow[] = [];
  const bench: BenchRow[] = [];

  for (const spec of fixtures) {
    for (let k = 0; k < seeds; k++) {
      const seed = familySeed(spec, k);
      const graph = makeFixture({ ...spec, seed });
      const change = changeGraph(graph, seed);
      log(`${spec.name} seed ${k}: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
      // The step `router`: the hard rules and the measures of today, then the new measures.
      for (const strategy of routers) {
        if (graph.nodes.length > (strategy.maxNodes ?? Infinity)) continue;
        const router = asRouter(strategy);
        const t0 = now();
        const { row, result } = benchRun(router, spec.name, graph, k === 0 ? repeat : 1);
        const ms = now() - t0;
        if (k === 0) bench.push(row);
        const t1 = now();
        const values: Record<string, number> = routeMeasures(graph, result, row);
        const measureMs = now() - t1;
        let extraMs = 0;
        if (graph.nodes.length <= stabilityMax) {
          const t2 = now();
          const s = routeStability(graph, result, router.route(change.graph), { seed });
          extraMs = now() - t2;
          values["Z10.mean"] = s.mean;
          values["Z10.max"] = s.max;
          values["Z10.moved"] = s.moved;
        }
        rows.push({
          step: "router",
          fixture: spec.name,
          seed: k,
          strategy: strategy.name,
          nodes: row.nodes,
          edges: row.edges,
          violations: row.violations + (row.deterministic ? 0 : 1),
          ms,
          measureMs,
          extraMs,
          values,
        });
        if (strategy.name === curveRouter && graph.nodes.length <= curveMax) rows.push(...curveRows(graph, result, curves, { fixture: spec.name, seed: k, smooth, normals }));
      }
      // The step `group`: the router `sections` with each grouping rule, and the grouping of the changed graph (G9).
      for (const strategy of groups) {
        const opts = fixtureGroupOptions(strategy.name, graph);
        const t0 = now();
        const tree = strategy.run(graph, opts);
        const result = sectionsRouter({ name: "sections", group: strategy, groupOptions: opts }).route(graph);
        const ms = now() - t0;
        const t1 = now();
        const values: Record<string, number> = { ...levelMeasures(graph, result), "Z3.through": sumFaults(measureLevelFaults(result)).through };
        const measureMs = now() - t1;
        const t2 = now();
        values["G9.ari"] = groupStability(tree, strategy.run(change.graph, fixtureGroupOptions(strategy.name, change.graph)), graph.nodes.length);
        const extraMs = now() - t2;
        rows.push({ step: "group", fixture: spec.name, seed: k, strategy: strategy.name, nodes: graph.nodes.length, edges: graph.edges.length, violations: 0, ms, measureMs, extraMs, values });
      }
    }
  }

  // The step `room`: the board with each gap open to the gutter only, then each room strategy.
  for (const family of options.roomFamilies ?? ROOM_FAMILIES) {
    if (family.cols * family.rows > max) continue;
    for (let k = 0; k < seeds; k++) {
      const graph = packedGridBoard({ seed: 11 + 1009 * k, cols: family.cols, rows: family.rows, long: family.long });
      log(`${family.name} seed ${k}: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
      const links = roomLinks(graph);
      const area0 = areaOf(graph.nodes);
      const boards: { name: string; open: () => readonly Node[] }[] = [
        { name: "gutter", open: () => makeRoom(graph.nodes, links, { gutter: 8, spacing: 0, method: "routes" }).items },
        ...rooms.map((s) => ({ name: s.name, open: () => openGaps(graph.nodes, s.run({ items: graph.nodes, links }, { gutter: 8, spacing: 4 })) })),
      ];
      for (const b of boards) {
        const t0 = now();
        const nodes = b.open();
        const m = measureBoard({ nodes, edges: graph.edges }, 4);
        const ms = now() - t0;
        const t1 = now();
        const order = roomOrderFaults(graph.nodes, nodes);
        const measureMs = now() - t1;
        rows.push({
          step: "room",
          fixture: family.name,
          seed: k,
          strategy: b.name,
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          violations: 0,
          ms,
          measureMs,
          extraMs: 0,
          values: {
            "M1.area": area0 > 0 ? areaOf(nodes) / area0 : 1,
            "M4.laneThrough": m.laneThrough,
            crossings: m.crossings,
            through: m.faults.through,
            "R6.worstDetour": m.faults.worstDetour,
            "room-order": order,
          },
        });
      }
    }
  }

  const summaries = summarizeRows(rows);
  return {
    report: {
      options: { max, seeds, repeat, stabilityMax, curveMax, curveRouter },
      rows,
      summaries,
      fronts: suiteFronts(summaries),
      rules: ruleCounts(rows),
    },
    bench,
  };
}

/** This function gives the area of the bounding box of the nodes. */
function areaOf(nodes: readonly Node[]): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  return nodes.length ? (x1 - x0) * (y1 - y0) : 0;
}

/** This function gives the spread of each measure of each strategy on each fixture family, over the seeds. It keeps the order of the rows. */
export function summarizeRows(rows: readonly SuiteRow[]): SuiteSummary[] {
  const groups = new Map<string, SuiteRow[]>();
  for (const r of rows) {
    const key = `${r.step}\u0000${r.fixture}\u0000${r.strategy}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()].map((list) => {
    const first = list[0]!;
    const keys = [...new Set(list.flatMap((r) => Object.keys(r.values)))];
    const measures: Record<string, Spread> = {};
    for (const k of keys) measures[k] = summarize(list.map((r) => r.values[k] ?? Number.NaN));
    measures["ms"] = summarize(list.map((r) => r.ms));
    measures["measureMs"] = summarize(list.map((r) => r.measureMs));
    return {
      step: first.step,
      fixture: first.fixture,
      strategy: first.strategy,
      nodes: first.nodes,
      seeds: list.length,
      violations: list.reduce((s, r) => s + r.violations, 0),
      measures,
    };
  });
}

/**
 * This function gives the Pareto front of each step on each fixture family, over the medians of the seeds.
 * A strategy with a violation of a hard rule does not enter the front, as MEAS0 asks.
 */
export function suiteFronts(summaries: readonly SuiteSummary[], objectives: Readonly<Record<Step, readonly Objective[]>> = FRONT_OBJECTIVES): SuiteFront[] {
  const groups = new Map<string, SuiteSummary[]>();
  for (const s of summaries) {
    const key = `${s.step}\u0000${s.fixture}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  return [...groups.values()].map((list) => {
    const first = list[0]!;
    const axes = objectives[first.step];
    const fair = list.filter((s) => s.violations === 0);
    const medians = (s: SuiteSummary): Record<string, number> => Object.fromEntries(axes.map((o) => [o.key, s.measures[o.key]?.median ?? Number.NaN]));
    return {
      step: first.step,
      fixture: first.fixture,
      nodes: first.nodes,
      objectives: axes,
      front: paretoFront(fair, medians, axes).map((s) => s.strategy),
      excluded: list.filter((s) => s.violations > 0).map((s) => s.strategy),
      strategies: list.map((s) => s.strategy),
    };
  });
}

/** This function sums each proposed hard rule of MEAS0 for each strategy of each step, over each fixture and each seed. */
export function ruleCounts(rows: readonly SuiteRow[]): RuleCount[] {
  const out = new Map<string, RuleCount>();
  for (const r of rows)
    for (const rule of PROPOSED_RULES) {
      const v = r.values[rule];
      if (v === undefined) continue;
      const key = `${r.step}\u0000${r.strategy}\u0000${rule}`;
      const known = out.get(key);
      out.set(key, { step: r.step, strategy: r.strategy, rule, count: (known?.count ?? 0) + v });
    }
  return [...out.values()];
}

const fmt = (v: number | undefined, d = 3): string => (v === undefined || Number.isNaN(v) ? "-" : Number.isInteger(v) ? String(v) : v.toFixed(d));

/** The columns of the tables of `formatSuite`: the keys of the measures of each step. */
export const SUITE_COLUMNS: Readonly<Record<Step, readonly string[]>> = {
  router: ["R1.perEdge", "R2.angle", "R2.min", "B1.inkSaved", "R5.median", "R5.q95", "R4.turn", "R11.q05", "B4.ambiguity", "Z10.moved", "Z8.order", "Z7.position", "G8.treeCost"],
  curve: ["C1.share", "C1.max", "C2.median", "C3.median", "C3.q95", "C6.length"],
  room: ["M1.area", "M4.laneThrough", "crossings", "through", "room-order"],
  group: ["G1.modularity", "G2.cut", "G8.treeCost", "G9.ari", "Z7.position", "Z8.order", "Z3.through"],
};

/**
 * This function writes the summaries of one step as a Markdown table. Each cell is the median over the seeds, with the interquartile range in brackets.
 * The column `R1 IQR/median` gives the spread of the crossings.
 */
export function formatSummaries(summaries: readonly SuiteSummary[], step: Step, columns: readonly string[] = SUITE_COLUMNS[step]): string {
  const extra = step === "router" ? ["R1 IQR/median"] : [];
  const head = `| ${step} | fixture | seeds | violations | ${[...columns, ...extra].join(" | ")} |`;
  const line = `|---|---|---:|---:|${[...columns, ...extra].map(() => "---:").join("|")}|`;
  const body = summaries
    .filter((s) => s.step === step)
    .map((s) => {
      const cells = columns.map((c) => {
        const m = s.measures[c];
        return m && m.n > 0 ? `${fmt(m.median)} (${fmt(m.iqr)})` : "-";
      });
      if (step === "router") {
        const c = s.measures["R1.crossings"];
        cells.push(c && c.median > 0 ? fmt(c.iqr / c.median) : "-");
      }
      return `| ${s.strategy} | ${s.fixture} | ${s.seeds} | ${s.violations} | ${cells.join(" | ")} |`;
    });
  return [head, line, ...body].join("\n");
}

/** This function writes the Pareto fronts as a Markdown table. */
export function formatFronts(fronts: readonly SuiteFront[]): string {
  const head = "| step | fixture | nodes | axes | front | not on the front | excluded (hard rules) |";
  const line = "|---|---|---:|---|---|---|---|";
  const body = fronts.map((f) => {
    const axes = f.objectives.map((o) => `${o.key} ${o.better === "min" ? "↓" : "↑"}`).join(", ");
    const off = f.strategies.filter((s) => !f.front.includes(s) && !f.excluded.includes(s));
    return `| ${f.step} | ${f.fixture} | ${f.nodes} | ${axes} | ${f.front.join(", ")} | ${off.join(", ") || "-"} | ${f.excluded.join(", ") || "-"} |`;
  });
  return [head, line, ...body].join("\n");
}

/** This function writes the counts of the proposed hard rules as a Markdown table: one row for each step and strategy. */
export function formatRules(rules: readonly RuleCount[]): string {
  const head = `| step | strategy | ${PROPOSED_RULES.join(" | ")} |`;
  const line = `|---|---|${PROPOSED_RULES.map(() => "---:").join("|")}|`;
  const keys = [...new Set(rules.map((r) => `${r.step}\u0000${r.strategy}`))];
  const body = keys.map((k) => {
    const [step, strategy] = k.split("\u0000");
    const cells = PROPOSED_RULES.map((rule) => {
      const r = rules.find((x) => x.step === step && x.strategy === strategy && x.rule === rule);
      return r ? String(r.count) : "-";
    });
    return `| ${step} | ${strategy} | ${cells.join(" | ")} |`;
  });
  return [head, line, ...body].join("\n");
}

/**
 * This function compares the time of the new measures with the time of the step and the measures of today.
 * It gives one row for each fixture family of a step. The extra routes of the stability measures have their own column.
 */
export function formatMeasureTime(rows: readonly SuiteRow[], step: Step = "router"): string {
  const head = "| step | fixture | nodes | rows | ms of today | ms of the new measures | share | ms of the extra runs |";
  const line = "|---|---|---:|---:|---:|---:|---:|---:|";
  const byFixture = new Map<string, SuiteRow[]>();
  for (const r of rows.filter((x) => x.step === step)) {
    const list = byFixture.get(r.fixture);
    if (list) list.push(r);
    else byFixture.set(r.fixture, [r]);
  }
  const body = [...byFixture].map(([fixture, list]) => {
    const old = list.reduce((s, r) => s + r.ms, 0);
    const added = list.reduce((s, r) => s + r.measureMs, 0);
    const extra = list.reduce((s, r) => s + r.extraMs, 0);
    return `| ${step} | ${fixture} | ${list[0]!.nodes} | ${list.length} | ${old.toFixed(0)} | ${added.toFixed(0)} | ${old > 0 ? ((100 * added) / old).toFixed(1) : "-"}% | ${extra.toFixed(0)} |`;
  });
  return [head, line, ...body].join("\n");
}
