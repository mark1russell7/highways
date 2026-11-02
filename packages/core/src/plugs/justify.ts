/**
 * Plug justification (WILD-002, with NAT-031): the plugs of one side keep their order and a minimum gap.
 * They move the least distance from their ideal places.
 */

import { center, type Box, type Point } from "../geom.ts";
import { fixedPortPoint, nodeIndex, type Edge, type Node, type Port, type Side } from "../model.ts";
import { placePlug, type Plug } from "../plugs.ts";
import type { PlugInput, PlugPair } from "../strategies/model.ts";
import { alongAxis, placeInIntervals, portOfEnd, rangeInterval } from "./range.ts";

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

/**
 * This function moves the free plugs of each side of each node, so that two of them are at least `gap` apart (`justifyPlugs`).
 * The plugs keep their order on the side. Two plugs at one place take the order of their other ends. A fixed plug does not move.
 * A plug stays `inset` from the corners of its side, or a quarter of the side when the side is short.
 * A plug of a port with a `range` stays in its range (PORT-RANGE), and the plugs keep their order and the gap (`placeInIntervals`).
 */
export function spacePlugs(ends: [Edge, Node, Node, Plug, Plug][], gap: number, inset = 6): void {
  // The free plugs of each side: the index of the edge, the end (3 for the source, 4 for the target), the point of the other end and the port.
  const sides = new Map<string, { node: Node; normal: Point; items: [number, 3 | 4, Point, Port | undefined][] }>();
  ends.forEach(([e, s, t, ps, pt], i) => {
    for (const [end, node, plug, other, k] of [
      [e.source, s, ps, pt, 3],
      [e.target, t, pt, ps, 4],
    ] as const) {
      if (fixedPortPoint(node, end) !== undefined) continue;
      const key = JSON.stringify([node.id, plug.normal.x, plug.normal.y]);
      let side = sides.get(key);
      if (!side) sides.set(key, (side = { node, normal: plug.normal, items: [] }));
      side.items.push([i, k, other.point, portOfEnd(node, end)]);
    }
  });
  for (const { node, normal, items } of sides.values()) {
    const ranged = items.some((x) => x[3]?.range !== undefined);
    if (items.length < 2 && !ranged) continue;
    const along = normal.x !== 0 ? "y" : "x";
    const b = node.box;
    const start = along === "y" ? b.y : b.x;
    const len = along === "y" ? b.h : b.w;
    const m = Math.min(inset, len / 4);
    const ideal = items.map(([i, k]) => ends[i]![k].point[along]);
    const placed = ranged ? spaceInRanges(b, normal, items, ideal, start + m, start + len - m, gap, inset) : justifyPlugs(ideal, start + m, start + len - m, gap, (j) => items[j]![2][along]);
    items.forEach(([i, k], j) => {
      const old = ends[i]![k];
      ends[i]![k] = { point: along === "y" ? { x: old.point.x, y: placed[j]! } : { x: placed[j]!, y: old.point.y }, normal: old.normal };
    });
  }
}

/**
 * This function places the free plugs of one side with ranges (PORT-RANGE). The order is the order of `justifyPlugs`.
 * Each plug stays in the interval of its range, or in the room of the side without a range.
 */
function spaceInRanges(box: Box, normal: Point, items: readonly [number, 3 | 4, Point, Port | undefined][], ideal: readonly number[], lo: number, hi: number, gap: number, inset: number): number[] {
  const side = sideOfNormal(normal);
  const along = alongAxis(side);
  const order = ideal.map((_, i) => i).sort((a, b) => ideal[a]! - ideal[b]! || items[a]![2][along] - items[b]![2][along] || a - b);
  const span = order.map((j): [number, number] => rangeInterval(box, side, items[j]![3], inset) ?? [lo, hi]);
  const at = placeInIntervals(
    order.map((j) => ideal[j]!),
    span.map((r) => r[0]),
    span.map((r) => r[1]),
    gap,
  );
  const out = new Array<number>(ideal.length);
  order.forEach((j, i) => {
    out[j] = at[i]!;
  });
  return out;
}

/** This function gives the side of an outward normal. */
function sideOfNormal(n: Point): Side {
  if (n.x > 0) return "east";
  if (n.x < 0) return "west";
  return n.y > 0 ? "south" : "north";
}

/** The options of the plug strategy `justify`. */
export interface JustifyOptions {
  /** The least gap between two free plugs of one side. The default is 8. 0 keeps each plug where it faces. */
  readonly plugGap?: number;
}

/**
 * This function gives the plugs of the plug strategy `justify` (WILD-002): the plugs of `facing`, then the gaps of `spacePlugs`.
 * The router `corners` with the option `plugGap` gives the same plugs.
 */
export function justifyEnds(input: PlugInput, options: JustifyOptions = {}): PlugPair[] {
  const { graph } = input;
  const byId = nodeIndex(graph);
  const ends: [Edge, Node, Node, Plug, Plug][] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    ends.push([e, s, t, placePlug(s, e.source, center(t.box)), placePlug(t, e.target, center(s.box))]);
  }
  const gap = options.plugGap ?? 8;
  if (gap > 0) spacePlugs(ends, gap);
  return ends.map(([e, , , source, target]) => ({ edge: e.id, source, target }));
}
