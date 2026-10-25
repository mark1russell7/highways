import { makeFixture, type FixtureSpec } from "../fixtures.ts";
import type { Graph, Result, Router } from "../model.ts";
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
    for (const router of routers) rows.push(benchOne(router, spec.name, graph, options.repeat ?? 3));
  }
  return rows;
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
    else if (i === 1 && JSON.stringify(r) !== JSON.stringify(first)) deterministic = false;
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
