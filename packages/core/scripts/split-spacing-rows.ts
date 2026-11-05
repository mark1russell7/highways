/**
 * This module makes the rows of the record `split-spacing/1` (SPLIT-SPACING).
 * Each row reads the same samples with the two denominators of the spacing error, so the record shows the change of method on one run.
 * The record also holds the rows of `split-spacing-bisect.ts`, which read the older commits.
 */
import { benchHighways, SPACING_METHOD, SPACING_WIDE, type SpacingSample } from "../src/bench/curves.ts";
import { CASES } from "../src/cases.ts";
import { byCollection, trunksRouter } from "../src/routers/trunks.ts";

export const SCHEMA = "split-spacing/1";
export const REGENERATE = "node packages/core/scripts/split-spacing.ts packages/core/scripts/data/split-spacing/record.json";

/** The method of the rows before LANE-ROOM. */
export const FIXED_METHOD = "fixed-spacing";

/** The name of each option of the leave of a lane. */
export const LEAVES = ["split", "part"] as const;

/** The cells of the table of the README file. */
const CELLS = [
  { router: "trunks", board: "case-dense-groups" },
  { router: "trunks-all", board: "case-dense-groups" },
  { router: "trunks-all", board: "case-many-groups" },
] as const;

/** The read of one denominator over the samples of one row. */
export interface MethodRead {
  readonly method: string;
  readonly worst: number;
  readonly mean: number;
  readonly overWide: number;
  readonly overWidePairs: number;
}

/** One row of the record. */
export interface SpacingRow {
  readonly router: string;
  readonly board: string;
  readonly leave: (typeof LEAVES)[number];
  readonly samples: number;
  /** The read against the gap of each pair of lanes. It is the read of the measure. */
  readonly pairGap: MethodRead;
  /** The read of the same samples against the fixed spacing. */
  readonly fixed: MethodRead;
  /** The sample with the largest error against the gap of its pair. */
  readonly worstSample: {
    readonly lanes: readonly [string, string];
    readonly at: readonly [number, number];
    readonly distance: number;
    readonly gap: number;
    readonly spacing: number;
    readonly lanesOfSegment: number;
    readonly segmentLength: number;
    readonly errorOnGap: number;
    readonly errorOnSpacing: number;
  } | null;
}

/** This function rounds a value, so the record reads the same on each machine. */
const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/** This function reads the samples against one denominator. */
function read(samples: readonly SpacingSample[], method: string, denominator: (s: SpacingSample) => number): MethodRead {
  const errors = samples.map((s) => Math.abs(s.distance - denominator(s)) / denominator(s));
  const wide = samples.filter((_, i) => errors[i]! > SPACING_WIDE);
  return {
    method,
    worst: round(errors.reduce((a, b) => Math.max(a, b), 0)),
    mean: round(errors.reduce((a, b) => a + b, 0) / Math.max(samples.length, 1)),
    overWide: wide.length,
    overWidePairs: new Set(wide.map((s) => [...s.edges].sort().join("|"))).size,
  };
}

/** This function gives the rows of the record. */
export function spacingRows(): SpacingRow[] {
  const rows: SpacingRow[] = [];
  for (const cell of CELLS) {
    const board = CASES.find((c) => c.name === cell.board)!;
    for (const leave of LEAVES) {
      const samples: SpacingSample[] = [];
      const rule = cell.router === "trunks" ? byCollection : () => "all" as const;
      const router = trunksRouter({ name: cell.router, rule, leave });
      benchHighways(router, board.name, board.make(), { onSample: (s) => samples.push(s) });
      const worst = samples.reduce<SpacingSample | null>((a, s) => (a && Math.abs(a.distance - a.gap) / a.gap >= Math.abs(s.distance - s.gap) / s.gap ? a : s), null);
      rows.push({
        router: cell.router,
        board: cell.board,
        leave,
        samples: samples.length,
        pairGap: read(samples, SPACING_METHOD, (s) => s.gap),
        fixed: read(samples, FIXED_METHOD, (s) => s.spacing),
        worstSample: worst && {
          lanes: worst.edges,
          at: [round(worst.at.x), round(worst.at.y)],
          distance: round(worst.distance),
          gap: round(worst.gap),
          spacing: round(worst.spacing),
          lanesOfSegment: worst.lanes,
          segmentLength: round(worst.length),
          errorOnGap: round(Math.abs(worst.distance - worst.gap) / worst.gap),
          errorOnSpacing: round(Math.abs(worst.distance - worst.spacing) / worst.spacing),
        },
      });
    }
  }
  return rows;
}

/** One row of `split-spacing-bisect.ts`: `trunks-all` on `case-many-groups` at one commit. */
export interface BisectRow {
  readonly commit: string;
  readonly leave: (typeof LEAVES)[number];
  readonly method: string;
  readonly samples: number;
  readonly worst: number;
  readonly mean: number;
  readonly overWide: number;
  readonly worstSample: { readonly lanes: readonly string[]; readonly distance: number; readonly denominator: number };
}
