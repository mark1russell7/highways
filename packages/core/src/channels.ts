import { dist, type Box, type Point } from "./geom.ts";
import type { Obstacles } from "./visibility.ts";

/** The largest distance that `channelWidth` looks on each side of a link. A wider channel counts as this width on that side. */
export const CHANNEL_REACH = 64;

/**
 * This function gives the distance from `p` along the unit direction `d` to the box, or `Infinity` when the ray does not meet the box.
 * A point inside the box gives 0. The function uses the slab test.
 */
export function rayToBox(p: Point, d: Point, box: Box): number {
  let lo = 0;
  let hi = Infinity;
  for (const [o, v, min, max] of [
    [p.x, d.x, box.x, box.x + box.w],
    [p.y, d.y, box.y, box.y + box.h],
  ] as const) {
    if (Math.abs(v) < 1e-12) {
      if (o < min || o > max) return Infinity;
      continue;
    }
    const t1 = (min - o) / v;
    const t2 = (max - o) / v;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return Infinity;
  }
  return lo;
}

/** This function gives the free distance from `p` along the unit direction `d` to the nearest box, up to `reach`. */
function freeRay(obstacles: Obstacles, p: Point, d: Point, reach: number): number {
  const q = { x: p.x + d.x * reach, y: p.y + d.y * reach };
  let best = reach;
  obstacles.query({ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) }, (n) => {
    best = Math.min(best, rayToBox(p, d, n.box));
  });
  return best;
}

/**
 * This function gives the width of the channel of the link from `a` to `b`. The width is the free space between the nearest boxes on the two sides.
 * It measures the width at five points of the link, and gives the smallest. Each side counts up to `reach`.
 * A link of length 0 gives the free space across the x axis at its point.
 */
export function channelWidth(obstacles: Obstacles, a: Point, b: Point, reach: number = CHANNEL_REACH): number {
  const len = dist(a, b);
  const n = len > 1e-9 ? { x: -(b.y - a.y) / len, y: (b.x - a.x) / len } : { x: 0, y: 1 };
  const back = { x: -n.x, y: -n.y };
  let width = Infinity;
  for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    width = Math.min(width, freeRay(obstacles, p, n, reach) + freeRay(obstacles, p, back, reach));
  }
  return width;
}
