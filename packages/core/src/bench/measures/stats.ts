import { rng } from "../../fixtures.ts";

/**
 * This function gives the `p` quantile of the values, with a linear step between two ranks (type 7 of Hyndman and Fan).
 * The result is `NaN` for an empty list.
 */
export function quantile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const at = Math.max(0, Math.min(1, p)) * (s.length - 1);
  const lo = Math.floor(at);
  const hi = Math.min(s.length - 1, lo + 1);
  return s[lo]! + (s[hi]! - s[lo]!) * (at - lo);
}

/** The spread of a measure over the seeds of a fixture family. */
export interface Spread {
  /** The number of values. */
  readonly n: number;
  readonly median: number;
  /** The `0.25` quantile. */
  readonly q1: number;
  /** The `0.75` quantile. */
  readonly q3: number;
  /** The interquartile range: `q3 - q1`. */
  readonly iqr: number;
  readonly min: number;
  readonly max: number;
}

/** This function gives the median, the quartiles, the interquartile range, the smallest and the largest value of a list. */
export function summarize(values: readonly number[]): Spread {
  const v = values.filter((x) => !Number.isNaN(x));
  const q1 = quantile(v, 0.25);
  const q3 = quantile(v, 0.75);
  return {
    n: v.length,
    median: quantile(v, 0.5),
    q1,
    q3,
    iqr: q3 - q1,
    min: v.length ? v.reduce((m, x) => Math.min(m, x), Infinity) : Number.NaN,
    max: v.length ? v.reduce((m, x) => Math.max(m, x), -Infinity) : Number.NaN,
  };
}

/** The largest number of values for which `kendallTau` examines each pair. Above it, the function examines a seeded sample of pairs. */
export const KENDALL_EXACT = 1500;
const KENDALL_SAMPLE = 200_000;

/**
 * This function gives the Kendall tau-b of two lists of the same length (Kendall, 1938).
 * The value is from -1 to 1. A value of 1 means the same order. A pair with a tie in both lists does not count.
 * When one list has only ties, the value is 1. Above `KENDALL_EXACT` values, a seeded sample of 200 000 pairs gives an estimate.
 */
export function kendallTau(a: readonly number[], b: readonly number[], seed = 1): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 1;
  let concordant = 0;
  let discordant = 0;
  let tieA = 0;
  let tieB = 0;
  const visit = (i: number, j: number): void => {
    const da = Math.sign(a[i]! - a[j]!);
    const db = Math.sign(b[i]! - b[j]!);
    if (da === 0 && db === 0) return;
    if (da === 0) tieA++;
    else if (db === 0) tieB++;
    else if (da === db) concordant++;
    else discordant++;
  };
  if (n <= KENDALL_EXACT) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) visit(i, j);
  } else {
    const R = rng(seed);
    for (let k = 0; k < KENDALL_SAMPLE; k++) {
      const i = Math.floor(R() * n);
      const j = Math.floor(R() * n);
      if (i !== j) visit(i, j);
    }
  }
  const den = Math.sqrt((concordant + discordant + tieA) * (concordant + discordant + tieB));
  return den === 0 ? 1 : (concordant - discordant) / den;
}

const pairs = (k: number): number => (k * (k - 1)) / 2;

/**
 * This function gives the adjusted Rand index of two groupings of the same items (Hubert and Arabie, 1985).
 * The item `i` is in the group `a[i]` of the first grouping and in the group `b[i]` of the second grouping.
 * The value is 1 for the same grouping, and near 0 for a random grouping. Two groupings with one group each give 1.
 */
export function adjustedRandIndex(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 1;
  const cells = new Map<string, number>();
  const rows = new Map<string | number, number>();
  const cols = new Map<string | number, number>();
  for (let i = 0; i < n; i++) {
    const key = `${String(a[i])}\u0000${String(b[i])}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
    rows.set(a[i]!, (rows.get(a[i]!) ?? 0) + 1);
    cols.set(b[i]!, (cols.get(b[i]!) ?? 0) + 1);
  }
  let index = 0;
  for (const c of cells.values()) index += pairs(c);
  let sa = 0;
  let sb = 0;
  for (const c of rows.values()) sa += pairs(c);
  for (const c of cols.values()) sb += pairs(c);
  const expected = (sa * sb) / pairs(n);
  const top = (sa + sb) / 2;
  return top === expected ? 1 : (index - expected) / (top - expected);
}
