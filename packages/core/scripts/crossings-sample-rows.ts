/**
 * This module makes the rows of the record `crossings-sample/1` (CROSSINGS-SAMPLE).
 * Above 20 000 segments, `route.crossings` reads a sample of 2 000 segments. So a ratio can compare an estimate with a full count.
 * Each row reads one estimate of the benchmark against the full count of the same segments.
 */
import { deriveSeed, fnv1a32 } from "@mark1russell7/rigor-generators";
import { countCrossings } from "../src/bench/quality.ts";
import { drawnSegments } from "../src/bench/measures/routes.ts";
import { SCREEN_SETS } from "../src/bench/screen/set.ts";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import { ROUTERS } from "../src/routers/index.ts";

export const SCHEMA = "crossings-sample/1";
export const REGENERATE = "node packages/core/scripts/crossings-sample.ts packages/core/scripts/data/crossings-sample/record.json";

/** The limit of the full count of `countCrossings`, in segments. */
export const SAMPLE_LIMIT = 20_000;

/** The names of the draws of the sample. */
export const DRAWS = ["draw-a", "draw-b", "draw-c", "draw-d", "draw-e"] as const;

/** The rows of the benchmark that hold an estimate, on the boards of this read. */
export const CELLS: readonly { readonly board: string; readonly router: string }[] = [
  { board: "grid-400", router: "corners-smooth" },
  ...["mid-uniform", "mid-clustered", "mid-hubs", "mid-fanout"].flatMap((board) => ["plugs", "corners-smooth"].map((router) => ({ board, router }))),
  { board: "large-clustered", router: "straight" },
  { board: "large-clustered", router: "plugs" },
];

/** One row of the record. */
export interface SampleRow {
  readonly board: string;
  readonly router: string;
  readonly nodes: number;
  readonly edges: number;
  /** The drawn segments. Above `SAMPLE_LIMIT`, the measure reads a sample. */
  readonly segments: number;
  /** The count of each crossing of the drawn segments. */
  readonly full: number;
  /** The estimate of the measure, as the benchmark reads it. */
  readonly estimate: number;
  /** The absolute difference of the estimate and the full count, over the full count. */
  readonly error: number;
  /** The estimates of the draws of `DRAWS`, in that order. */
  readonly draws: readonly number[];
  /** The smallest and the largest of the draws. */
  readonly low: number;
  readonly high: number;
  /** The largest error of a draw. */
  readonly worstDraw: number;
}

/** This function rounds a value, so the record reads the same on each machine. */
const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/** This function reads one cell. */
export function sampleRow(cell: (typeof CELLS)[number]): SampleRow {
  const graph = makeFixture(FIXTURES.find((f) => f.name === cell.board)!);
  const router = ROUTERS.find((r) => r.name === cell.router)!;
  const segments = drawnSegments(router.route(graph).routes);
  const [full] = countCrossings(segments, { limit: Infinity });
  const [estimate] = countCrossings(segments);
  const draws = DRAWS.map((name) => countCrossings(segments, { seed: deriveSeed(fnv1a32(`${cell.board}/${cell.router}`), name) })[0]);
  return {
    board: cell.board,
    router: cell.router,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    segments: segments.length,
    full,
    estimate,
    error: round(Math.abs(estimate - full) / full),
    draws,
    low: Math.min(...draws),
    high: Math.max(...draws),
    worstDraw: round(Math.max(...draws.map((d) => Math.abs(d - full) / full))),
  };
}

/** One row for each screen set: the largest board, and the segments that one route needs to reach the limit. */
export interface SetRow {
  readonly set: string;
  readonly boards: number;
  readonly largestNodes: number;
  readonly largestEdges: number;
  /** The limit over the edges of the largest board: the mean segments per route at which an estimate starts. */
  readonly segmentsPerRouteAtLimit: number;
}

/** This function reads the size of the boards of the three sets of the verdict snapshots. */
export function setRows(): SetRow[] {
  return ["screen-v1", "screen-v2", "screen-v3"].map((name) => {
    let [boards, largestNodes, largestEdges] = [0, 0, 0];
    for (const family of SCREEN_SETS[name]!.families) {
      for (let seed = 0; seed < family.seeds; seed++) {
        const board = family.make(seed);
        boards++;
        largestNodes = Math.max(largestNodes, board.nodes.length);
        largestEdges = Math.max(largestEdges, board.edges.length);
      }
    }
    return { set: name, boards, largestNodes, largestEdges, segmentsPerRouteAtLimit: round(SAMPLE_LIMIT / largestEdges) };
  });
}
