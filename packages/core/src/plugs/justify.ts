/**
 * Plug justification (WILD-002, with NAT-031): the plugs of one side keep their order and a minimum gap.
 * They move the least distance from their ideal places.
 */

/**
 * This function places `ideal.length` points on the segment from `lo` to `hi` of one side.
 * The points keep the order of their ideal places. Two neighbours are at least `gap` apart, or the side divided evenly when it is too short.
 * The sum of the squares of the moves is the least. The answer is exact: a fit by pool adjacent violators.
 *
 * The function `tie` orders two points with the same ideal place. The result is in the order of `ideal`.
 */
export function justifyPlugs(ideal: readonly number[], lo: number, hi: number, gap: number, tie?: (i: number) => number): number[] {
  const k = ideal.length;
  if (k === 0) return [];
  const order = ideal.map((_, i) => i).sort((a, b) => ideal[a]! - ideal[b]! || (tie ? tie(a) - tie(b) : 0) || a - b);
  const s = k > 1 ? Math.max(0, Math.min(gap, (hi - lo) / (k - 1))) : 0;
  // With y_i = x_i - i·s, the gap becomes the rule y_i <= y_(i+1): an isotonic fit of a_i - i·s.
  const y = isotonic(order.map((j, i) => ideal[j]! - i * s));
  const top = Math.max(lo, hi - (k - 1) * s);
  const out = new Array<number>(k);
  order.forEach((j, i) => {
    out[j] = Math.max(lo, Math.min(top, y[i]!)) + i * s;
  });
  return out;
}

/** This function gives the non-decreasing sequence nearest to `v` in the sum of squares (pool adjacent violators). */
export function isotonic(v: readonly number[]): number[] {
  const mean: number[] = [];
  const size: number[] = [];
  for (const x of v) {
    mean.push(x);
    size.push(1);
    while (mean.length > 1 && mean[mean.length - 2]! > mean[mean.length - 1]!) {
      const m = mean.pop()!;
      const n = size.pop()!;
      const i = mean.length - 1;
      mean[i] = (mean[i]! * size[i]! + m * n) / (size[i]! + n);
      size[i]! += n;
    }
  }
  const out: number[] = [];
  mean.forEach((m, i) => {
    for (let j = 0; j < size[i]!; j++) out.push(m);
  });
  return out;
}
