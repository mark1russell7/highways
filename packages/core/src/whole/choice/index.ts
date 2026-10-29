/**
 * The whole strategy `choice` (WILD-046): a learned choice of the setting, after the algorithm selection problem of Rice (1976) and SATzilla.
 * Features of the board pick one setting of the portfolio by the k nearest boards of a table, so only one setting routes.
 */
import { checkProperties } from "../../bench/properties.ts";
import { center, dist } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import type { WholeOutput } from "../../strategies/model.ts";
import { runPipeline } from "../pipeline/index.ts";
import type { PortfolioSetting } from "../portfolio/index.ts";
import { CHOICE_TABLE } from "./table.ts";

/** The names of the features of a board, in the order of a feature vector. */
export const CHOICE_FEATURES: readonly string[] = Object.freeze(["nodes", "edges", "edgesPerNode", "degreeSkew", "sizeSpread", "neighbourRatio", "keyedShare", "fanOut", "span"]);

/** The features that the model reads: each feature, the size of the board only, or its shape only. */
export type ChoiceFeatureSet = "all" | "size" | "shape";

/** The values of `ChoiceFeatureSet`. */
export const CHOICE_FEATURE_SETS: readonly ChoiceFeatureSet[] = Object.freeze(["all", "size", "shape"]);

/** The indexes of the features of each feature set. */
const SETS: Readonly<Record<ChoiceFeatureSet, readonly number[]>> = { all: [0, 1, 2, 3, 4, 5, 6, 7, 8], size: [0, 1, 2, 7], shape: [3, 4, 5, 6, 8] };

/** One row of the table: the features of a made-up board, and the name of the setting that won the portfolio on it. */
export interface ChoiceRow {
  /** The family and the seed of the board, for the record. */
  readonly board: string;
  readonly features: readonly number[];
  readonly winner: string;
}

/** The options of the whole strategy `choice` (WILD-046). */
export interface ChoiceOptions {
  /** The number of nearest boards that vote, from 1 to 10. The default is 3. */
  readonly k: number;
  /** The features that the model reads. The default is `all`. */
  readonly features: ChoiceFeatureSet;
}

/** The default options of the strategy `choice`. */
export const CHOICE_DEFAULTS: Readonly<ChoiceOptions> = Object.freeze({ k: 3, features: "all" });

/**
 * This function gives the features of a board (WILD-046). They are the counts of the nodes and the edges, the edges for each node,
 * the skew of the degrees (the largest over the mean), the spread of the box areas (the standard deviation over the mean),
 * the nearest-neighbour ratio of the centers (Clark and Evans), the share of the edges with a key, the largest fan-out, and the mean span of the edges over the mean box size.
 */
export function boardFeatures(graph: Graph): number[] {
  const n = graph.nodes.length;
  const m = graph.edges.length;
  const centers = graph.nodes.map((v) => center(v.box));
  const at = new Map(graph.nodes.map((v, i) => [v.id, i]));
  const degree = new Array<number>(n).fill(0);
  const out = new Array<number>(n).fill(0);
  let span = 0;
  let spans = 0;
  let keyed = 0;
  for (const e of graph.edges) {
    const s = at.get(e.source.node);
    const t = at.get(e.target.node);
    if (typeof e.data?.["collection"] === "string") keyed++;
    if (s === undefined || t === undefined) continue;
    degree[s]!++;
    degree[t]!++;
    out[s]!++;
    span += dist(centers[s]!, centers[t]!);
    spans++;
  }
  const meanDegree = n > 0 ? degree.reduce((a, b) => a + b, 0) / n : 0;
  const areas = graph.nodes.map((v) => v.box.w * v.box.h);
  const meanArea = n > 0 ? areas.reduce((a, b) => a + b, 0) / n : 0;
  const varArea = n > 0 ? areas.reduce((a, b) => a + (b - meanArea) ** 2, 0) / n : 0;
  const size = n > 0 ? graph.nodes.reduce((a, v) => a + Math.sqrt(v.box.w * v.box.h), 0) / n : 1;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of centers) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x);
    y1 = Math.max(y1, c.y);
  }
  let nearest = 0;
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) if (j !== i) best = Math.min(best, dist(centers[i]!, centers[j]!));
    if (best < Infinity) nearest += best;
  }
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  const expected = n > 1 ? 0.5 * Math.sqrt(area / n) : 1;
  return [
    n,
    m,
    n > 0 ? m / n : 0,
    meanDegree > 0 ? Math.max(...degree) / meanDegree : 0,
    meanArea > 0 ? Math.sqrt(varArea) / meanArea : 0,
    n > 1 ? nearest / n / expected : 0,
    m > 0 ? keyed / m : 0,
    n > 0 ? Math.max(...out) : 0,
    spans > 0 && size > 0 ? span / spans / size : 0,
  ];
}

/** The mean and the standard deviation of each feature over the table, for the scale of the distance. A feature with no spread gets the scale 1. */
function scales(table: readonly ChoiceRow[]): { mean: number[]; sd: number[] } {
  const d = CHOICE_FEATURES.length;
  const mean = new Array<number>(d).fill(0);
  const sd = new Array<number>(d).fill(0);
  for (const r of table) r.features.forEach((v, i) => (mean[i]! += v / table.length));
  for (const r of table) r.features.forEach((v, i) => (sd[i]! += (v - mean[i]!) ** 2 / table.length));
  return { mean, sd: sd.map((v) => (v > 0 ? Math.sqrt(v) : 1)) };
}

/**
 * This function gives the names of the settings in the order of the vote of the `k` nearest rows of the table (WILD-046).
 * The distance is the sum of the squares of the scaled differences of the features of the set. A vote tie goes to the least sum of the distances, then to the earlier name in the table.
 * The names that no near row gives come after, in the order of the votes of all the rows.
 */
export function rankSettings(features: readonly number[], table: readonly ChoiceRow[], o: Readonly<ChoiceOptions>): string[] {
  if (table.length === 0) return [];
  const { mean, sd } = scales(table);
  const use = SETS[o.features];
  const z = (v: readonly number[], i: number): number => (v[i]! - mean[i]!) / sd[i]!;
  const near = table
    .map((r, row) => {
      let d = 0;
      for (const i of use) d += (z(r.features, i) - z(features, i)) ** 2;
      return { r, row, d };
    })
    .sort((a, b) => a.d - b.d || a.row - b.row);
  const k = Math.max(1, Math.min(table.length, Math.floor(o.k)));
  const tally = (rows: readonly { r: ChoiceRow; row: number; d: number }[]): string[] => {
    const votes = new Map<string, { n: number; d: number; first: number }>();
    for (const x of rows) {
      const v = votes.get(x.r.winner) ?? { n: 0, d: 0, first: x.row };
      votes.set(x.r.winner, { n: v.n + 1, d: v.d + x.d, first: Math.min(v.first, x.row) });
    }
    return [...votes].sort((a, b) => b[1].n - a[1].n || a[1].d - b[1].d || a[1].first - b[1].first).map(([name]) => name);
  };
  const first = tally(near.slice(0, k));
  return [...first, ...tally(near).filter((name) => !first.includes(name))];
}

/** The largest number of settings that `choice` routes on one board. */
export const CHOICE_TRIES = 3;

/** The result of `choice`: the output, the name of the pick and the order of the vote. */
export interface ChoiceRun {
  readonly output: WholeOutput;
  readonly pick: string;
  readonly ranked: readonly string[];
}

/**
 * This function runs the whole strategy `choice` (WILD-046). The features of the board rank the settings of `list` by the table, and the first one routes.
 * A setting above its node limit does not run. A setting with a break of a hard rule gives its place to the next one in the rank, up to `CHOICE_TRIES` settings.
 * When each try breaks a hard rule, the first one that ran gives the output. The table comes from made-up boards with seeds outside the screen sets.
 */
export function choice(graph: Graph, list: readonly PortfolioSetting[], options: Partial<ChoiceOptions> = {}, table: readonly ChoiceRow[] = CHOICE_TABLE): ChoiceRun {
  const o = { ...CHOICE_DEFAULTS, ...options };
  const byName = new Map(list.map((s) => [s.name, s]));
  const voted = rankSettings(boardFeatures(graph), table, o).filter((name) => byName.has(name));
  const ranked = [...voted, ...list.map((s) => s.name).filter((name) => !voted.includes(name))];
  let fallback: { name: string; output: WholeOutput } | undefined;
  let tries = 0;
  for (const name of ranked) {
    if (tries >= CHOICE_TRIES) break;
    const s = byName.get(name)!;
    const limit = (s.pipeline.highway ?? s.pipeline.router).maxNodes;
    if (limit !== undefined && graph.nodes.length > limit) continue;
    tries++;
    const output = runPipeline(graph, s.pipeline);
    if (checkProperties(output.graph, output.result, 1).length === 0) return { output, pick: name, ranked };
    fallback ??= { name, output };
  }
  const first = fallback ?? { name: list[0]!.name, output: runPipeline(graph, list[0]!.pipeline) };
  return { output: first.output, pick: first.name, ranked };
}
