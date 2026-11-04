/**
 * The rows of the plug strategy `spread` (PLUG-ROW-GAP): a port with a `rowHeight` holds a band of its wall, centered on its plug.
 * Two neighbor plugs stay far enough apart for their bands, and a free plug leaves the band of a fixed plug.
 */
import { placeInIntervals } from "../range.ts";

const EPS = 1e-9;

/** A free plug of a wall with rows. */
export interface RowSlot {
  /** The height of the row of the plug. A plug without a row has no value. */
  readonly row?: number;
  /** The interval of the range of the port on the axis along the wall. */
  readonly range?: readonly [number, number];
  /** The place of the plug on the axis along the wall. */
  at: number;
}

/** The room of a wall with rows, on the axis along the wall. */
export interface RowRoom {
  /** The start of the wall. */
  readonly start: number;
  /** The end of the wall. */
  readonly end: number;
  /** The first place of a plug. */
  readonly lo: number;
  /** The last place of a plug. */
  readonly hi: number;
  /** The least gap between two plugs. */
  readonly gap: number;
  /** The fixed plugs of the wall: the place of each plug, with the height of its row, or 0. */
  readonly fixed: ReadonlyMap<number, number>;
}

/**
 * This function places the slots of one wall in their order, with room for the rows.
 * The least distance of two neighbors is the greater of `gap` and the mean of their row heights.
 * The fixed plugs cut the room into parts, and each slot starts in the part of its ideal place.
 * A slot leaves a part without room for a neighbor part with room. Thus a plug leaves a row when the wall has the room.
 * When a wall has too little room, the distances shrink evenly. No plug drops.
 */
export function placeRows<T extends RowSlot>(slots: readonly T[], room: RowRoom, idealOf: (s: T) => number): void {
  const { start, end, lo, hi, gap, fixed } = room;
  const cuts = [...fixed.keys()].filter((f) => f >= start - EPS && f <= end + EPS).sort((a, b) => a - b);
  const need = (a: number, b: number): number => Math.max(gap, (a + b) / 2);
  const rowOf = (s: T): number => s.row ?? 0;
  const fits = (list: readonly T[], p: number): boolean => {
    const first = list[0];
    const last = list[list.length - 1];
    if (first === undefined || last === undefined) return true;
    const a = p > 0 ? cuts[p - 1]! + need(fixed.get(cuts[p - 1]!)!, rowOf(first)) : Math.max(lo, start + rowOf(first) / 2);
    const b = p < cuts.length ? cuts[p]! - need(fixed.get(cuts[p]!)!, rowOf(last)) : Math.min(hi, end - rowOf(last) / 2);
    let used = 0;
    for (let i = 1; i < list.length; i++) used += need(rowOf(list[i - 1]!), rowOf(list[i]!));
    return a + used <= b + EPS;
  };
  const parts: T[][] = cuts.map((): T[] => []).concat([[]]);
  let part = 0;
  for (const s of slots) {
    let p = 0;
    while (p < cuts.length && idealOf(s) > cuts[p]!) p++;
    part = Math.max(part, p);
    parts[part]!.push(s);
  }
  // A slot goes to the next part or the part before only when it fits there. The order of the slots does not change.
  for (let p = 0; p < cuts.length; p++)
    while (!fits(parts[p]!, p)) {
      const next = [parts[p]![parts[p]!.length - 1]!, ...parts[p + 1]!];
      if (!fits(next, p + 1)) break;
      parts[p]!.pop();
      parts[p + 1] = next;
    }
  for (let p = cuts.length; p > 0; p--)
    while (!fits(parts[p]!, p)) {
      const before = [...parts[p - 1]!, parts[p]![0]!];
      if (!fits(before, p - 1)) break;
      parts[p]!.shift();
      parts[p - 1] = before;
    }
  parts.forEach((list, p) => {
    if (list.length === 0) return;
    const left = p > 0 ? cuts[p - 1] : undefined;
    const right = p < cuts.length ? cuts[p] : undefined;
    const lower = Math.max(lo, left ?? -Infinity);
    const upper = Math.max(lower, Math.min(hi, right ?? Infinity));
    const inWall = fits(list, p);
    const span = list.map((s): [number, number] => {
      const half = inWall ? rowOf(s) / 2 : 0;
      const a = Math.max(lower, start + half);
      const b = Math.min(upper, end - half);
      const [x, y] = a <= b ? [a, b] : [lower, upper];
      if (!s.range) return [x, y];
      const u = Math.max(x, s.range[0]);
      const v = Math.min(y, s.range[1]);
      if (u <= v) return [u, v];
      const w = s.range[1] < x ? x : y;
      return [w, w];
    });
    // Each fixed plug at an end of the part is one more plug with a place of one point, so the distances to it shrink with the others.
    const ideal = list.map((s) => idealOf(s));
    const rows = list.map((s) => rowOf(s));
    const los = span.map((r) => r[0]);
    const his = span.map((r) => r[1]);
    if (left !== undefined) {
      ideal.unshift(left);
      rows.unshift(fixed.get(left)!);
      los.unshift(left);
      his.unshift(left);
    }
    if (right !== undefined) {
      ideal.push(right);
      rows.push(fixed.get(right)!);
      los.push(right);
      his.push(right);
    }
    const at = placeInIntervals(ideal, los, his, gap, (i, j) => need(rows[i]!, rows[j]!));
    const shift = left !== undefined ? 1 : 0;
    list.forEach((s, i) => {
      s.at = at[i + shift]!;
    });
  });
}
