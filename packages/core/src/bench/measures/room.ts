import { rng } from "../../fixtures.ts";
import type { Box } from "../../geom.ts";
import type { Boxed } from "../../room/index.ts";

/** Up to this number of boxes, `roomOrderFaults` examines each pair. */
const EXACT_PAIRS = 2000;
const SAMPLE_PAIRS = 2_000_000;

/**
 * This function counts the pairs of boxes whose order or alignment changes on an axis (M2 of MEAS0, the proposed rule `room-order`).
 * On each axis, it compares the order of the low edges, the order of the high edges, and the relation "a ends before b starts".
 * Two values nearer than `snap` are equal. Lower is better, and 0 is correct. Above 2000 boxes, a seeded sample of pairs gives an estimate.
 */
export function roomOrderFaults(before: readonly Boxed[], after: readonly Boxed[], snap = 0.5): number {
  const next = new Map(after.map((b) => [b.id, b.box] as const));
  const list: [Box, Box][] = [];
  for (const b of before) {
    const a = next.get(b.id);
    if (a) list.push([b.box, a]);
  }
  const sign = (x: number): number => (x > snap ? 1 : x < -snap ? -1 : 0);
  // The key packs the eight relations of a pair into one number in base 3.
  const axis = (p0: number, p1: number, q0: number, q1: number): number =>
    (sign(p0 - q0) + 1) * 27 + (sign(p1 - q1) + 1) * 9 + (q0 - p1 >= -snap ? 3 : 0) + (p0 - q1 >= -snap ? 1 : 0);
  const key = (p: Box, q: Box): number => axis(p.x, p.x + p.w, q.x, q.x + q.w) * 81 + axis(p.y, p.y + p.h, q.y, q.y + q.h);
  const changed = (i: number, j: number): boolean => key(list[i]![0], list[j]![0]) !== key(list[i]![1], list[j]![1]);
  const n = list.length;
  let faults = 0;
  if (n <= EXACT_PAIRS) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (changed(i, j)) faults++;
    return faults;
  }
  const R = rng(n);
  let seen = 0;
  for (let k = 0; k < SAMPLE_PAIRS; k++) {
    const i = Math.floor(R() * n);
    const j = Math.floor(R() * n);
    if (i === j) continue;
    seen++;
    if (changed(i, j)) faults++;
  }
  return Math.round((faults * (n * (n - 1)) / 2) / Math.max(1, seen));
}
