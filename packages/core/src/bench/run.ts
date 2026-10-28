import { makeFixture, type FixtureSpec } from "../fixtures.ts";
import type { Graph, Result, Router } from "../model.ts";
import { measureLevelFaults, measureRouteFaults, sumFaults, type LevelFaults, type LinkFaults } from "./links.ts";
import { checkProperties, type Violation } from "./properties.ts";
import { measureQuality, type Quality } from "./quality.ts";

// The core runs in any host, so it reads the clock without the types of Node or the browser.
const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

/** One row of the benchmark: one router on one fixture. */
export interface BenchRow {
  readonly router: string;
  readonly fixture: string;
  readonly nodes: number;
  readonly edges: number;
  /** The median time of one run, in milliseconds. */
  readonly ms: number;
  /** This value is false when two runs on the same input gave different results. */
  readonly deterministic: boolean;
  readonly violations: number;
  /** The first violations, for the report. */
  readonly sample: readonly Violation[];
  readonly quality: Quality;
  /** The faults of the routes of the edges (`measureRouteFaults`). */
  readonly faults: LinkFaults;
  /** The faults of each zoom level with groups (`measureLevelFaults`). The list is empty for a router without levels. */
  readonly levelFaults: readonly LevelFaults[];
  /** The routes of this cell took longer than the cell limit. The cell did not start more routes. A row within the limit has no such field. */
  readonly overLimit?: OverLimit;
  /** The time of the paired baseline arm (BENCH-GREEN). Only a cell with a baseline router has it. */
  readonly paired?: Paired;
}

/**
 * The paired baseline arm of a cell. The baseline router routes the same graph in turn with the router, on the same CPU.
 * The ratio does not change with the speed of the runner, so the ratios of two runs compare better than their times.
 */
export interface Paired {
  /** The name of the baseline router. */
  readonly base: string;
  /** The median time of one route of the router in the paired routes, in milliseconds. */
  readonly ms: number;
  /** The median time of one route of the baseline router, in milliseconds. */
  readonly baseMs: number;
  /** The ratio `ms / baseMs`. A ratio below 1 tells that the router is faster than the baseline. */
  readonly ratio: number;
}

/** The record of a cell over its time limit. */
export interface OverLimit {
  /** The cell limit, in milliseconds. */
  readonly limit: number;
  /** The number of routes that the cell finished. With one route, the cell did not check "same twice". */
  readonly runs: number;
}

/** The options of a benchmark run. */
export interface BenchOptions {
  /** The number of timed routes of each fixture by each router. The default is 3. */
  readonly repeat?: number;
  /**
   * The time limit of one cell (one router on one fixture), in milliseconds. The default is no limit.
   * After the routes of a cell pass the limit, the cell starts no more routes, and its row gets `overLimit`.
   * A route that runs does not stop.
   */
  readonly cellLimit?: number;
}

/** This function routes each fixture with each router, checks the hard rules and measures the quality. */
export function runBenchmark(routers: readonly Router[], fixtures: readonly FixtureSpec[], options: BenchOptions = {}): BenchRow[] {
  const rows: BenchRow[] = [];
  for (const spec of fixtures) {
    const graph = makeFixture(spec);
    for (const router of routers) if (graph.nodes.length <= (router.maxNodes ?? Infinity)) rows.push(benchOne(router, spec.name, graph, options.repeat ?? 3, options.cellLimit));
  }
  return rows;
}

/**
 * This function tells if two values hold the same data, as JSON sees it. It does not make a string,
 * because the result of a large graph can be longer than the longest string.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const y = b as unknown[];
    if (a.length !== y.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameData(a[i], y[i])) return false;
    return true;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const kx = Object.keys(x).filter((k) => x[k] !== undefined);
  const ky = Object.keys(y).filter((k) => y[k] !== undefined);
  if (kx.length !== ky.length) return false;
  for (const k of kx) if (!sameData(x[k], y[k])) return false;
  return true;
}

/**
 * This function routes one graph with one router and measures the result. It routes at least two times, for the rule "same twice".
 * After the routes pass `cellLimit` milliseconds, it starts no more routes and marks the row with `overLimit`.
 */
export function benchOne(router: Router, fixture: string, graph: Graph, repeat = 3, cellLimit: number = Infinity): BenchRow {
  return benchRun(router, fixture, graph, repeat, cellLimit).row;
}

/** One run of `benchRun`: the row of the benchmark and the result that the row measures. */
export interface BenchRun {
  readonly row: BenchRow;
  readonly result: Result;
}

/**
 * This function does the work of `benchOne` and also gives the result, so more measures can read it without a second route.
 * With a baseline router `pair`, the baseline routes the graph one time for each route of the router, in turn: first before, then after.
 * The row then gets `paired`. The baseline routes do not count for the cell limit, and their results do not change the row.
 */
export function benchRun(router: Router, fixture: string, graph: Graph, repeat = 3, cellLimit: number = Infinity, pair?: Router): BenchRun {
  const times: number[] = [];
  const baseTimes: number[] = [];
  const timeBase = (): void => {
    if (!pair) return;
    const t0 = now();
    pair.route(graph);
    baseTimes.push(now() - t0);
  };
  let first: Result | undefined;
  let deterministic = true;
  let spent = 0;
  for (let i = 0; i < Math.max(2, repeat); i++) {
    // The order of the two arms changes at each route, so a warm cache helps each arm equally.
    if (i % 2 === 0) timeBase();
    const t0 = now();
    const r = router.route(graph);
    const t = now() - t0;
    times.push(t);
    spent += t;
    if (i % 2 === 1) timeBase();
    if (!first) first = r;
    else if (i === 1 && !sameData(r, first)) deterministic = false;
    if (spent > cellLimit) break;
  }
  const runs = times.length;
  times.sort((a, b) => a - b);
  baseTimes.sort((a, b) => a - b);
  const result = first!;
  const ms = times[Math.floor(times.length / 2)]!;
  const baseMs = baseTimes[Math.floor(baseTimes.length / 2)];
  const all = checkProperties(graph, result, 1_000_000);
  const row: BenchRow = {
    router: router.name,
    fixture,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    ms,
    deterministic,
    violations: all.length,
    sample: all.slice(0, 5),
    quality: measureQuality(graph, result),
    faults: measureRouteFaults(graph, result),
    levelFaults: measureLevelFaults(result),
    ...(spent > cellLimit ? { overLimit: { limit: cellLimit, runs } } : {}),
    ...(pair && baseMs !== undefined ? { paired: { base: pair.name, ms, baseMs, ratio: baseMs > 0 ? ms / baseMs : 0 } } : {}),
  };
  return { row, result };
}

/**
 * This function puts rows in the order of one benchmark run: by fixture, then by router, each in the order of its list.
 * A name that is not in its list goes after the names of the list. Rows with the same place keep their order.
 * The workflow `Bench` uses it to join the rows of its parts.
 */
export function orderRows(rows: readonly BenchRow[], routers: readonly string[], fixtures: readonly string[]): BenchRow[] {
  const place = (list: readonly string[], name: string): number => {
    const i = list.indexOf(name);
    return i < 0 ? list.length : i;
  };
  return rows
    .map((row, i) => ({ row, i, f: place(fixtures, row.fixture), r: place(routers, row.router) }))
    .sort((a, b) => a.f - b.f || a.r - b.r || a.i - b.i)
    .map((x) => x.row);
}

/** This function writes the rows as a Markdown table. A cell over its limit shows "over the limit" after its time, and a dash for "same twice" when it did not check it. */
export function formatTable(rows: readonly BenchRow[]): string {
  const head = "| router | fixture | nodes | edges | ms | same twice | violations | ink | crossings | bends | inflections | clearance | tight | detour | plug angle |";
  const line = "|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const f = (v: number, d = 2): string => (Number.isInteger(v) ? String(v) : v.toFixed(d));
  const body = rows.map((r) => {
    const q = r.quality;
    const over = r.overLimit;
    const ms = over ? `${f(r.ms, 1)} over the limit` : f(r.ms, 1);
    const same = over && over.runs < 2 ? "-" : r.deterministic ? "yes" : "NO";
    return `| ${r.router} | ${r.fixture} | ${r.nodes} | ${r.edges} | ${ms} | ${same} | ${r.violations} | ${Math.round(q.ink)} | ${q.crossingsEstimated ? "≈" : ""}${q.crossings} | ${f(q.bends)} | ${f(q.inflections)} | ${f(q.clearance, 1)} | ${f(q.tight)} | ${f(q.detour)} | ${f(q.plugAngle, 1)} |`;
  });
  return [head, line, ...body].join("\n");
}

/**
 * This function writes the faults of the rows as a Markdown table: the routes first, then the sum of the levels with groups.
 * A router without such levels gets a dash in the columns of the levels.
 */
export function formatFaults(rows: readonly BenchRow[]): string {
  const head =
    "| router | fixture | through | out and back | worst detour | outside | level links | level overlaps | level through | level unavoidable | level avoidable | level out and back | level worst detour | level outside |";
  const line = "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const body = rows.map((r) => {
    const f = r.faults;
    const cells = [r.router, r.fixture, f.through, f.backtrack, f.worstDetour.toFixed(2), f.outside];
    if (r.levelFaults.length === 0) cells.push("-", "-", "-", "-", "-", "-", "-", "-");
    else {
      const l = sumFaults(r.levelFaults);
      cells.push(l.links, r.levelFaults.reduce((s, x) => s + x.overlaps, 0), l.through, l.unavoidable, l.avoidable, l.backtrack, l.worstDetour.toFixed(2), l.outside);
    }
    return `| ${cells.join(" | ")} |`;
  });
  return [head, line, ...body].join("\n");
}

/** A row with the faults of each zoom level, as `formatLevels` reads it: a router or a setting on one fixture. */
export interface LevelRow {
  readonly router: string;
  readonly fixture: string;
  readonly levelFaults: readonly LevelFaults[];
}

/** This function writes the faults of each zoom level with groups as a Markdown table, one line for each level. */
export function formatLevels(rows: readonly LevelRow[]): string {
  const head = "| router | fixture | depth | items | groups | overlaps | links | through | unavoidable | avoidable | out and back | worst detour | outside |";
  const line = "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const body = rows.flatMap((r) =>
    r.levelFaults.map((l) =>
      [r.router, r.fixture, l.depth, l.items, l.groups, l.overlaps, l.links, l.through, l.unavoidable, l.avoidable, l.backtrack, l.worstDetour.toFixed(2), l.outside].join(" | "),
    ),
  );
  return [head, line, ...body.map((b) => `| ${b} |`)].join("\n");
}
