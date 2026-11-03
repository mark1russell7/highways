import { inkSaved } from "../../bench/measures/bundles.ts";
import { detourSpread } from "../../bench/measures/routes.ts";
import { checkProperties } from "../../bench/properties.ts";
import { measureQuality } from "../../bench/quality.ts";
import type { Graph, Result } from "../../model.ts";
import type { WholeOutput } from "../../strategies/model.ts";
import { runPipeline, type PipelineOptions } from "../pipeline/index.ts";

/** The clock in milliseconds. */
const clock = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

/** One setting of the portfolio: a name and the options of the pipeline. */
export interface PortfolioSetting {
  readonly name: string;
  readonly pipeline: PipelineOptions;
}

/** The options of the whole strategy `board-portfolio` (WILD-045). */
export interface BoardPortfolioOptions {
  /** The number of settings that the portfolio tries, from the start of its list, from 3 to 12. The default is 4. */
  readonly settings: number;
  /** The weight of the crossings (R1) in the score, from 0 to 4. The default is 1. */
  readonly crossings: number;
  /** The weight of the median detour (R5) in the score, from 0 to 4. The default is 1. */
  readonly detour: number;
  /** The weight of the ink saved (B1) in the score, from 0 to 4. The default is 1. */
  readonly ink: number;
  /**
   * The time budget in seconds, from 0 to 10. After the budget, no new setting starts. The first setting always runs.
   * The value 0, the default, sets no budget, so the output does not depend on the speed of the machine.
   */
  readonly budget: number;
}

/** The default options of the strategy `board-portfolio`. */
export const BOARD_PORTFOLIO_DEFAULTS: Readonly<BoardPortfolioOptions> = Object.freeze({ settings: 4, crossings: 1, detour: 1, ink: 1, budget: 0 });

/** The measures of one setting on the board, and its output. */
export interface PortfolioEntry {
  readonly name: string;
  readonly output: WholeOutput;
  readonly crossings: number;
  readonly detour: number;
  readonly ink: number;
}

/** The result of `boardPortfolio`: the output and the name of the pick. It also holds the measures of each setting with no break of a hard rule. */
export interface BoardPortfolioRun {
  readonly output: WholeOutput;
  readonly pick: string;
  readonly entries: readonly PortfolioEntry[];
}

/** This function gives the rank of each value from 0 (the best) to 1 (the worst). Equal values get the mean of their ranks. One value gets 0. */
export function rankShares(values: readonly number[], lowerIsBetter: boolean): number[] {
  const n = values.length;
  if (n < 2) return values.map(() => 0);
  const order = values.map((_, i) => i).sort((a, b) => (lowerIsBetter ? values[a]! - values[b]! : values[b]! - values[a]!));
  const rank = new Array<number>(n).fill(0);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && Math.abs(values[order[j + 1]!]! - values[order[i]!]!) <= 1e-9) j++;
    for (let k = i; k <= j; k++) rank[order[k]!] = (i + j) / 2 / (n - 1);
    i = j + 1;
  }
  return rank;
}

/**
 * This function runs the portfolio for one board (WILD-045, after Rice, 1976). It reads only the board and the outputs of its own settings.
 * A setting whose router or highway strategy has a node limit below the size of the board does not run.
 * A setting with a break of a hard rule does not count. The score of a setting is `Σ w_i × the rank share of measure_i` over the settings.
 * The measures are the crossings (R1), the median detour (R5) and the ink saved (B1). The least score wins, and a tie goes to the earlier setting.
 */
export function boardPortfolio(graph: Graph, list: readonly PortfolioSetting[], o: Readonly<BoardPortfolioOptions>, now: () => number = clock): BoardPortfolioRun {
  const count = Math.max(1, Math.min(list.length, Math.floor(o.settings)));
  const t0 = now();
  const entries: PortfolioEntry[] = [];
  let fallback: { name: string; output: WholeOutput } | undefined;
  for (const s of list.slice(0, count)) {
    if (o.budget > 0 && fallback !== undefined && now() - t0 > o.budget * 1000) break;
    const limit = (s.pipeline.highway ?? s.pipeline.router).maxNodes;
    if (limit !== undefined && graph.nodes.length > limit) continue;
    const output = runPipeline(graph, s.pipeline);
    fallback ??= { name: s.name, output };
    if (checkProperties(output.graph, output.result, 1).length > 0) continue;
    entries.push({ name: s.name, output, ...portfolioMeasures(output.graph, output.result) });
  }
  if (entries.length === 0) {
    const first = fallback ?? { name: list[0]!.name, output: runPipeline(graph, list[0]!.pipeline) };
    return { output: first.output, pick: first.name, entries };
  }
  const r1 = rankShares(entries.map((e) => e.crossings), true);
  const r5 = rankShares(entries.map((e) => e.detour), true);
  const b1 = rankShares(entries.map((e) => e.ink), false);
  let best = 0;
  let score = Infinity;
  entries.forEach((_, i) => {
    const s = o.crossings * r1[i]! + o.detour * r5[i]! + o.ink * b1[i]!;
    if (s < score - 1e-9) [best, score] = [i, s];
  });
  return { output: entries[best]!.output, pick: entries[best]!.name, entries };
}

/** This function gives the three measures of the score of one output: the crossings, the median detour and the ink saved. */
export function portfolioMeasures(graph: Graph, result: Result): { crossings: number; detour: number; ink: number } {
  return { crossings: measureQuality(graph, result).crossings, detour: detourSpread(result.routes).median, ink: inkSaved(result.routes) };
}
