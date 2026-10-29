import { checkProperties } from "../../bench/properties.ts";
import { segmentsCross, type Point } from "../../geom.ts";
import type { Graph, Result } from "../../model.ts";
import { turnsOf } from "../../routers/reroute/index.ts";
import type { WholeOutput } from "../../strategies/model.ts";
import { runPipeline } from "../pipeline/index.ts";
import type { PortfolioSetting } from "../portfolio/index.ts";

/** The value of the loads of the edges of a board that the pick reads: the median, the quantile 0.95 or the mean. */
export type TracingQuantile = "q50" | "q95" | "mean";

/** The values of `TracingQuantile`. */
export const TRACING_QUANTILES: readonly TracingQuantile[] = Object.freeze(["q50", "q95", "mean"]);

/** The weights of the places to choose on the way of one edge (WILD-057). */
export interface TracingWeights {
  /** The weight of a crossing, from 0 to 4. The default is 1. */
  readonly crossing: number;
  /** The weight of a merge or a split where the edge is not an outer lane, from 0 to 4. The default is 2. */
  readonly merge: number;
  /** The weight of a bend, from 0 to 4. The default is 0.5. */
  readonly bend: number;
}

/** The default weights of the tracing load, as the record gives them. */
export const TRACING_WEIGHTS: Readonly<TracingWeights> = Object.freeze({ crossing: 1, merge: 2, bend: 0.5 });

/** The options of the whole strategy `tracing` (WILD-057). */
export interface TracingOptions extends TracingWeights {
  /** The number of settings that the strategy tries, from the start of its list, from 1 to 12. The default is 4. */
  readonly settings: number;
  /** The value of the loads that the pick reads. The default is `q95`. */
  readonly quantile: TracingQuantile;
}

/** The default options of the strategy `tracing`. */
export const TRACING_DEFAULTS: Readonly<TracingOptions> = Object.freeze({ ...TRACING_WEIGHTS, settings: 4, quantile: "q95" });

/** The bounds of a polyline: the least x and y, and the largest x and y. */
function boundsOf(p: readonly Point[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of p) {
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
  }
  return [x0, y0, x1, y1];
}

/**
 * This function gives the tracing load of each edge of a result (WILD-057, after the tracing tasks of Ware, Purchase, Colpoys and McGill 2002).
 * The load is `T(e) = crossing × crossings + merge × (merges and splits where e is not an outer lane) + bend × bends`.
 * A shared run where the edge is not an outer lane gives one merge and one split. Such a bundle gives one split.
 * A bend is a turn of more than 1 degree. The measure is W4 of MEAS3.
 */
export function tracingLoads(result: Result, weights: Partial<TracingWeights> = {}): Map<string, number> {
  const w = { ...TRACING_WEIGHTS, ...weights };
  const routes = result.routes;
  const bounds = routes.map((r) => boundsOf(r.points));
  const crossings = new Array<number>(routes.length).fill(0);
  for (let i = 0; i < routes.length; i++) {
    const a = routes[i]!.points;
    const [ax0, ay0, ax1, ay1] = bounds[i]!;
    for (let j = i + 1; j < routes.length; j++) {
      const [bx0, by0, bx1, by1] = bounds[j]!;
      if (bx0 > ax1 || bx1 < ax0 || by0 > ay1 || by1 < ay0) continue;
      const b = routes[j]!.points;
      let n = 0;
      for (let p = 1; p < a.length; p++) for (let q = 1; q < b.length; q++) if (segmentsCross(a[p - 1]!, a[p]!, b[q - 1]!, b[q]!)) n++;
      crossings[i]! += n;
      crossings[j]! += n;
    }
  }
  const choices = new Map<string, number>();
  const inner = (edges: readonly string[], add: number): void => {
    if (edges.length < 3) return;
    for (const e of edges.slice(1, -1)) choices.set(e, (choices.get(e) ?? 0) + add);
  };
  for (const run of result.runs ?? []) inner(run.edges, 2);
  for (const b of result.bundles ?? []) inner(b.edges, 1);
  const out = new Map<string, number>();
  routes.forEach((r, i) => out.set(r.edge, w.crossing * crossings[i]! + w.merge * (choices.get(r.edge) ?? 0) + w.bend * turnsOf(r.points)));
  return out;
}

/** This function gives a value of a list of loads: the median, the quantile 0.95 by the nearest rank, or the mean. An empty list gives 0. */
export function tracingValue(loads: Iterable<number>, quantile: TracingQuantile): number {
  const list = [...loads].sort((a, b) => a - b);
  if (list.length === 0) return 0;
  if (quantile === "mean") return list.reduce((s, v) => s + v, 0) / list.length;
  const q = quantile === "q50" ? 0.5 : 0.95;
  return list[Math.min(list.length - 1, Math.max(0, Math.ceil(q * list.length) - 1))]!;
}

/** The tracing loads of one setting on the board: the value that the pick reads, and the median for a tie. */
export interface TracingEntry {
  readonly name: string;
  readonly value: number;
  readonly median: number;
}

/** The result of `tracing`: the output, the name of the pick and the loads of each setting with no break of a hard rule. */
export interface TracingRun {
  readonly output: WholeOutput;
  readonly pick: string;
  readonly entries: readonly TracingEntry[];
}

/**
 * This function runs the whole strategy `tracing` (WILD-057). It runs the first `settings` settings of `list` on the board.
 * A setting with a break of a hard rule, or above its node limit, does not count. The setting with the least tracing load wins.
 * A tie goes to the least median load, then to the earlier setting. It reads only the board and the outputs of its own settings.
 */
export function tracing(graph: Graph, list: readonly PortfolioSetting[], options: Partial<TracingOptions> = {}): TracingRun {
  const o = { ...TRACING_DEFAULTS, ...options };
  const count = Math.max(1, Math.min(list.length, Math.floor(o.settings)));
  const entries: TracingEntry[] = [];
  const outputs: WholeOutput[] = [];
  let fallback: { name: string; output: WholeOutput } | undefined;
  for (const s of list.slice(0, count)) {
    const limit = (s.pipeline.highway ?? s.pipeline.router).maxNodes;
    if (limit !== undefined && graph.nodes.length > limit) continue;
    const output = runPipeline(graph, s.pipeline);
    fallback ??= { name: s.name, output };
    if (checkProperties(output.graph, output.result, 1).length > 0) continue;
    const loads = [...tracingLoads(output.result, o).values()];
    entries.push({ name: s.name, value: tracingValue(loads, o.quantile), median: tracingValue(loads, "q50") });
    outputs.push(output);
  }
  if (entries.length === 0) {
    const first = fallback ?? { name: list[0]!.name, output: runPipeline(graph, list[0]!.pipeline) };
    return { output: first.output, pick: first.name, entries };
  }
  let best = 0;
  entries.forEach((e, i) => {
    const b = entries[best]!;
    if (e.value < b.value - 1e-9 || (Math.abs(e.value - b.value) <= 1e-9 && e.median < b.median - 1e-9)) best = i;
  });
  return { output: outputs[best]!, pick: entries[best]!.name, entries };
}
