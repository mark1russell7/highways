/**
 * Plug ranges (PORT-RANGE): a free plug of a port with `range` stays in that interval of its side.
 * The plug rules read the interval of each plug, and place the plugs of a side in their order with a least gap.
 */
import type { Box, Point } from "../geom.ts";
import type { End, Node, Port, Side } from "../model.ts";

/** The tolerance of the comparisons of places along a side. */
const EPS = 1e-9;

/** This function gives the axis along a side. */
export function alongAxis(side: Side): "x" | "y" {
  return side === "east" || side === "west" ? "y" : "x";
}

/** This function gives the port of an end, or `undefined` when the end has no port or the node has no such port. */
export function portOfEnd(node: Node, end: End): Port | undefined {
  return end.port === undefined ? undefined : node.ports?.find((p) => p.id === end.port);
}

/**
 * This function gives the interval of a plug with a range, on the axis along its side, or `undefined` for a port without a range.
 * The interval is the range of the port, without the corner insets of the side.
 * When the range is all in a corner inset, the interval is the range.
 */
export function rangeInterval(box: Box, side: Side, port: Port | undefined, inset = 6): [number, number] | undefined {
  const range = port?.range;
  if (range === undefined) return undefined;
  const along = alongAxis(side);
  const start = along === "y" ? box.y : box.x;
  const len = along === "y" ? box.h : box.w;
  const m = Math.min(inset, len / 4);
  const lo = start + range[0] * len;
  const hi = start + range[1] * len;
  const a = Math.max(lo, start + m);
  const b = Math.min(hi, start + len - m);
  return a <= b ? [a, b] : [lo, hi];
}

/** This function moves a point of a side into the interval of its range, on the axis along the side. A point of a port without a range stays. */
export function clampToRange(box: Box, side: Side, port: Port | undefined, point: Point, inset = 6): Point {
  const r = rangeInterval(box, side, port, inset);
  if (!r) return point;
  const along = alongAxis(side);
  const v = Math.max(r[0], Math.min(r[1], point[along]));
  return along === "y" ? { x: point.x, y: v } : { x: v, y: point.y };
}

/**
 * This function places `ideal.length` plugs of one side in their given order. The plug `i` stays in the interval from `lo[i]` to `hi[i]`.
 * Two neighbours are at least `gap` apart. When the intervals are too short for the gap, the gap shrinks evenly to the largest gap that they let.
 * The sum of the squares of the moves from the ideal places is the least.
 *
 * When the order cannot keep each plug in its interval, the plugs take the order of their ideal places in their intervals. Thus the intervals win over the order.
 * The result is in the order of `ideal`.
 */
export function placeInIntervals(ideal: readonly number[], lo: readonly number[], hi: readonly number[], gap: number): number[] {
  const k = ideal.length;
  if (k === 0) return [];
  let order = ideal.map((_, i) => i);
  // A later plug with an interval wholly before the interval of an earlier plug breaks the order.
  let most = -Infinity;
  let broken = false;
  for (const i of order) {
    if (hi[i]! < most - EPS) broken = true;
    most = Math.max(most, lo[i]!);
  }
  if (broken) {
    const c = order.map((i) => Math.max(lo[i]!, Math.min(hi[i]!, ideal[i]!)));
    order = [...order].sort((a, b) => c[a]! - c[b]! || a - b);
  }
  // The largest gap that the order lets: the plug j and the later plug i need (i - j)·s <= hi_i - lo_j.
  let s = Math.max(0, gap);
  for (let i = 1; i < k; i++) {
    const hiI = hi[order[i]!]!;
    for (let j = 0; j < i; j++) s = Math.min(s, (hiI - lo[order[j]!]!) / (i - j));
  }
  s = Math.max(0, s);
  // With y_i = x_i - i·s, the gap becomes the rule y_i <= y_(i+1), and each y_i has the bounds L_i and U_i.
  // The bounds become monotone: L_i is the most of the lower bounds before i, and U_i is the least of the upper bounds after i.
  const lower = new Array<number>(k);
  const upper = new Array<number>(k);
  let run = -Infinity;
  for (let i = 0; i < k; i++) lower[i] = run = Math.max(run, lo[order[i]!]! - i * s);
  run = Infinity;
  for (let i = k - 1; i >= 0; i--) upper[i] = run = Math.min(run, hi[order[i]!]! - i * s);
  // Pool adjacent violators with bounds. The value of a block is its mean, clamped to the bounds of the block.
  // The lower bound of a block is the lower bound of its last item, and its upper bound is the upper bound of its first item.
  const sum: number[] = [];
  const size: number[] = [];
  const blockLo: number[] = [];
  const blockHi: number[] = [];
  const value: number[] = [];
  const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
  for (let i = 0; i < k; i++) {
    sum.push(ideal[order[i]!]! - i * s);
    size.push(1);
    blockLo.push(lower[i]!);
    blockHi.push(upper[i]!);
    value.push(clamp(sum[sum.length - 1]!, lower[i]!, upper[i]!));
    while (value.length > 1 && value[value.length - 2]! > value[value.length - 1]!) {
      const t = value.length - 1;
      sum[t - 1]! += sum[t]!;
      size[t - 1]! += size[t]!;
      blockLo[t - 1] = blockLo[t]!;
      value[t - 1] = clamp(sum[t - 1]! / size[t - 1]!, blockLo[t - 1]!, blockHi[t - 1]!);
      sum.pop();
      size.pop();
      blockLo.pop();
      blockHi.pop();
      value.pop();
    }
  }
  const out = new Array<number>(k);
  let i = 0;
  value.forEach((v, b) => {
    for (let j = 0; j < size[b]!; j++, i++) out[order[i]!] = v + i * s;
  });
  return out;
}
