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
}

/** The options of a benchmark run. */
export interface BenchOptions {
  /** The number of timed routes of each fixture by each router. The default is 3. */
  readonly repeat?: number;
}

/** This function routes each fixture with each router, checks the hard rules and measures the quality. */
export function runBenchmark(routers: readonly Router[], fixtures: readonly FixtureSpec[], options: BenchOptions = {}): BenchRow[] {
  const rows: BenchRow[] = [];
  for (const spec of fixtures) {
    const graph = makeFixture(spec);
    for (const router of routers) if (graph.nodes.length <= (router.maxNodes ?? Infinity)) rows.push(benchOne(router, spec.name, graph, options.repeat ?? 3));
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

/** This function routes one graph with one router and measures the result. */
export function benchOne(router: Router, fixture: string, graph: Graph, repeat = 3): BenchRow {
  const times: number[] = [];
  let first: Result | undefined;
  let deterministic = true;
  for (let i = 0; i < Math.max(2, repeat); i++) {
    const t0 = now();
    const r = router.route(graph);
    times.push(now() - t0);
    if (!first) first = r;
    else if (i === 1 && !sameData(r, first)) deterministic = false;
  }
  times.sort((a, b) => a - b);
  const result = first!;
  const all = checkProperties(graph, result, 1_000_000);
  return {
    router: router.name,
    fixture,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    ms: times[Math.floor(times.length / 2)]!,
    deterministic,
    violations: all.length,
    sample: all.slice(0, 5),
    quality: measureQuality(graph, result),
    faults: measureRouteFaults(graph, result),
    levelFaults: measureLevelFaults(result),
  };
}

/** This function writes the rows as a Markdown table. */
export function formatTable(rows: readonly BenchRow[]): string {
  const head = "| router | fixture | nodes | edges | ms | same twice | violations | ink | crossings | bends | inflections | clearance | tight | detour | plug angle |";
  const line = "|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const f = (v: number, d = 2): string => (Number.isInteger(v) ? String(v) : v.toFixed(d));
  const body = rows.map((r) => {
    const q = r.quality;
    return `| ${r.router} | ${r.fixture} | ${r.nodes} | ${r.edges} | ${f(r.ms, 1)} | ${r.deterministic ? "yes" : "NO"} | ${r.violations} | ${Math.round(q.ink)} | ${q.crossingsEstimated ? "≈" : ""}${q.crossings} | ${f(q.bends)} | ${f(q.inflections)} | ${f(q.clearance, 1)} | ${f(q.tight)} | ${f(q.detour)} | ${f(q.plugAngle, 1)} |`;
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
