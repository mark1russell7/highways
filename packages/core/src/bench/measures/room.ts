import { rng } from "../../fixtures.ts";
import { center, dist, type Box, type Point } from "../../geom.ts";
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

/**
 * This function gives the displacement of the boxes (M3 of MEAS0, Bridgeman 2000): `mean_v dist(box_open(v), box_packed(v)) / u`.
 * The distance is between the centers of the two boxes of a node, and `u` is the unit of the packed board.
 * The value has no unit, and lower is better. A board where no box moves gives 0. The cost is linear.
 */
export function boxDisplacement(before: readonly Boxed[], after: readonly Boxed[], unit: number): number {
  const next = new Map(after.map((b) => [b.id, b.box] as const));
  let sum = 0;
  let n = 0;
  for (const b of before) {
    const a = next.get(b.id);
    if (!a) continue;
    sum += dist(center(b.box), center(a));
    n++;
  }
  return n === 0 ? 0 : sum / n / (unit > 0 ? unit : 1);
}

/** The number of nearest boxes of each box that make the neighbour pairs of `distanceDistortion`. */
export const DISTORTION_NEIGHBOURS = 4;

/**
 * This function gives the distance distortion of the boxes (M5 of MEAS0): the Kruskal stress of the centers.
 * `σ = sqrt(Σ (α d'_ij - d_ij)^2 / Σ d_ij^2)`, with `d` the distance on the packed board, `d'` the distance on the open board, and `α = Σ d d' / Σ d'^2` the best scale.
 * The pairs are each box and its 4 nearest boxes on the packed board. The scale is 0 to 1, and lower is better.
 * A board that only changes its scale gives 0. The cost is `n log n` for an even density.
 */
export function distanceDistortion(before: readonly Boxed[], after: readonly Boxed[]): number {
  const next = new Map(after.map((b) => [b.id, center(b.box)] as const));
  const list = before.flatMap((b) => (next.has(b.id) ? [{ p: center(b.box), q: next.get(b.id)! }] : []));
  const pairs = neighbourPairs(
    list.map((x) => x.p),
    DISTORTION_NEIGHBOURS,
  );
  let dd = 0;
  let qq = 0;
  let pp = 0;
  const ds: [number, number][] = [];
  for (const [i, j] of pairs) {
    const d = dist(list[i]!.p, list[j]!.p);
    const e = dist(list[i]!.q, list[j]!.q);
    ds.push([d, e]);
    dd += d * e;
    qq += e * e;
    pp += d * d;
  }
  if (pp === 0) return 0;
  const alpha = qq > 0 ? dd / qq : 0;
  const res = ds.reduce((s, [d, e]) => s + (alpha * e - d) ** 2, 0);
  return Math.sqrt(res / pp);
}

/** This function gives each pair of a point and one of its `k` nearest points one time, as `[i, j]` with `i < j`. A grid of buckets finds the points. */
function neighbourPairs(points: readonly Point[], k: number): [number, number][] {
  const n = points.length;
  if (n < 2) return [];
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const cell = Math.max(1e-9, Math.sqrt(((x1 - x0) * (y1 - y0) || 1) / n) * 2);
  const key = (cx: number, cy: number): string => `${cx},${cy}`;
  const buckets = new Map<string, number[]>();
  points.forEach((p, i) => {
    const kk = key(Math.floor((p.x - x0) / cell), Math.floor((p.y - y0) / cell));
    const list = buckets.get(kk);
    if (list) list.push(i);
    else buckets.set(kk, [i]);
  });
  const span = Math.ceil(Math.max(x1 - x0, y1 - y0) / cell) + 1;
  const seen = new Set<string>();
  const out: [number, number][] = [];
  points.forEach((p, i) => {
    const cx = Math.floor((p.x - x0) / cell);
    const cy = Math.floor((p.y - y0) / cell);
    let near: { j: number; d: number }[] = [];
    for (let ring = 0; ring <= span; ring++) {
      for (let gx = cx - ring; gx <= cx + ring; gx++)
        for (let gy = cy - ring; gy <= cy + ring; gy++) {
          if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== ring) continue;
          for (const j of buckets.get(key(gx, gy)) ?? []) if (j !== i) near.push({ j, d: dist(p, points[j]!) });
        }
      // A point outside the rings is at least `ring · cell` away, so the k nearest points are known.
      if (near.length >= Math.min(k, n - 1)) {
        near.sort((a, b) => a.d - b.d || a.j - b.j);
        if (near[Math.min(k, n - 1) - 1]!.d <= ring * cell) break;
      }
    }
    near = near.sort((a, b) => a.d - b.d || a.j - b.j).slice(0, k);
    for (const { j } of near) {
      const pk = i < j ? `${i},${j}` : `${j},${i}`;
      if (seen.has(pk)) continue;
      seen.add(pk);
      out.push(i < j ? [i, j] : [j, i]);
    }
  });
  return out;
}
