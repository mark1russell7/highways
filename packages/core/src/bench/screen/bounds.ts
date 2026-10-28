import { quantile } from "../measures/stats.ts";
import { GAP_BASELINES, type ExactOptimum, type GapRule } from "./gap.ts";

/**
 * The interval of the optimum B1 of one solve (EXACT-BOUNDS). The low end is the B1 of the best solution of HiGHS.
 * The high end comes from the dual bound. For a proven optimum, the two ends are equal.
 */
export interface OptimumInterval {
  readonly lo: number;
  readonly hi: number;
  readonly proven: boolean;
}

/**
 * This function gives the interval of the optimum B1 of a solve, or `undefined` without a solution.
 * The high end is `1 - (1 - b1) × bound / objective`. It supposes that the ink of the optimum is at least `bound / objective` times the ink of the best solution,
 * with routes of the same length. The objective of the model is the ink plus a small cost of the length, so the ratio is a ratio of the ink.
 * Without a positive bound, the high end is 1.
 */
export function optimumInterval(o: ExactOptimum): OptimumInterval | undefined {
  if (o.b1 === null || o.objective === null) return undefined;
  if (o.proven) return { lo: o.b1, hi: o.b1, proven: true };
  const ratio = o.bound !== null && o.bound > 0 && o.objective > 0 ? Math.min(1, o.bound / o.objective) : 0;
  return { lo: o.b1, hi: Math.min(1, Math.max(o.b1, 1 - (1 - o.b1) * ratio)), proven: false };
}

/** The interval of the gap closed of one run against an interval of the optimum. */
export interface GapInterval {
  readonly lo: number;
  readonly hi: number;
  readonly mid: number;
  readonly width: number;
}

/**
 * This function gives the interval of the gap closed `(b1 - base) / (optimum - base)` over the interval of the optimum.
 * For a run above the baseline, the high end of the optimum gives the low end of the gap closed, and the low end of the optimum gives the high end.
 * It gives `undefined` when the low end of the optimum is at the baseline or below it, because then the gap closed has no limit.
 */
export function gapInterval(b1: number, base: number, optimum: { readonly lo: number; readonly hi: number }): GapInterval | undefined {
  const dLo = optimum.lo - base;
  const dHi = optimum.hi - base;
  if (!(dLo > 1e-9)) return undefined;
  const a = (b1 - base) / dHi;
  const b = (b1 - base) / dLo;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return { lo, hi, mid: (lo + hi) / 2, width: hi - lo };
}

/** The values of one run that the bounds read: B1, the largest stretch of the model and the flag of mixed collections. */
export interface BoundsRun {
  readonly b1: number;
  readonly stretch: number;
  readonly mixed: boolean;
}

/** The gap closed of one strategy at one size, one rule and one cap, over the inputs. */
export interface BoundsRow {
  readonly strategy: string;
  /** The number of inputs, and the number of inputs where the run has a value. */
  readonly inputs: number;
  readonly values: number;
  /** The medians over the inputs with a value: the midpoint, the low end, the high end and the width of the interval. */
  readonly mid: number;
  readonly lo: number;
  readonly hi: number;
  readonly width: number;
}

/** The gap closed of each strategy at one size, one rule and one cap, sorted by the median of the midpoint. */
export interface BoundsCell {
  readonly nodes: number;
  readonly rule: GapRule;
  readonly cap: number;
  /** The counts of the solves: the inputs, the proven optima, the solves with a bound only, and the solves without a solution. */
  readonly inputs: number;
  readonly proven: number;
  readonly bounded: number;
  readonly none: number;
  /** The median width of the interval of the optimum B1, over the solves with a solution. */
  readonly optimumWidth: number;
  readonly rows: readonly BoundsRow[];
}

/**
 * This function gives the gap closed of each strategy for each size, rule and cap of the optima.
 * A run has a value when it obeys the rule, when its stretch is at or below the cap, and when the solve has a solution.
 * The rule `collection` refuses a run with a shared segment that holds edges of two collections.
 * The baseline of each rule is the run of `GAP_BASELINES` on the same input, with the prefix `hw:` for a highway strategy.
 * The rows sort by the median of the midpoint, from high to low. A strategy with a value on fewer than half of the inputs comes after the others.
 */
export function boundsCells(runs: ReadonlyMap<string, ReadonlyMap<string, BoundsRun>>, optima: readonly ExactOptimum[]): BoundsCell[] {
  const keys = [...new Set(optima.map((o) => `${o.nodes}|${o.rule}|${o.cap}`))];
  const cells: BoundsCell[] = [];
  const baseName = (rule: GapRule): string => (rule === "all" ? `hw:${GAP_BASELINES.all}` : GAP_BASELINES.collection);
  for (const key of keys) {
    const [n, rule, c] = key.split("|") as [string, GapRule, string];
    const nodes = Number(n);
    const cap = Number(c);
    const mine = optima.filter((o) => o.nodes === nodes && o.rule === rule && o.cap === cap && runs.has(o.input));
    const intervals = new Map(mine.flatMap((o) => (optimumInterval(o) ? [[o.input, optimumInterval(o)!] as const] : [])));
    const names = [...new Set(mine.flatMap((o) => [...runs.get(o.input)!.keys()]))].sort();
    const rows: BoundsRow[] = names.map((strategy) => {
      const vs: GapInterval[] = [];
      for (const o of mine) {
        const row = runs.get(o.input)!;
        const r = row.get(strategy);
        const base = row.get(baseName(rule));
        const opt = intervals.get(o.input);
        if (r === undefined || base === undefined || opt === undefined) continue;
        if ((rule === "collection" && r.mixed) || r.stretch > cap + 1e-9) continue;
        const g = gapInterval(r.b1, base.b1, opt);
        if (g !== undefined) vs.push(g);
      }
      const med = (f: (g: GapInterval) => number): number => quantile(vs.map(f), 0.5);
      return { strategy, inputs: mine.length, values: vs.length, mid: med((g) => g.mid), lo: med((g) => g.lo), hi: med((g) => g.hi), width: med((g) => g.width) };
    });
    const few = (r: BoundsRow): number => (2 * r.values < r.inputs || r.values === 0 ? 1 : 0);
    rows.sort((a, b) => few(a) - few(b) || (Number.isNaN(b.mid) ? -Infinity : b.mid) - (Number.isNaN(a.mid) ? -Infinity : a.mid) || (a.strategy < b.strategy ? -1 : 1));
    const widths = [...intervals.values()].map((i) => i.hi - i.lo);
    cells.push({
      nodes,
      rule,
      cap,
      inputs: mine.length,
      proven: mine.filter((o) => o.proven).length,
      bounded: mine.filter((o) => !o.proven && intervals.has(o.input)).length,
      none: mine.filter((o) => !intervals.has(o.input)).length,
      optimumWidth: quantile(widths, 0.5),
      rows,
    });
  }
  return cells.sort((a, b) => a.nodes - b.nodes || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0) || a.cap - b.cap);
}

/** This function gives the strategies that rank in a cell: the first `k` rows with a value on at least half of the inputs. */
export function topOf(cell: BoundsCell, k = 5): BoundsRow[] {
  return cell.rows.filter((r) => r.values > 0 && 2 * r.values >= r.inputs).slice(0, k);
}
