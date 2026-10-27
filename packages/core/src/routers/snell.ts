import { dist, type Point } from "../geom.ts";
import type { Way } from "./shared.ts";

/**
 * This function gives the Snell merge point of a route that comes from `from`, reaches a run at `at` and goes on along the run to `next` (NAT-035).
 * A unit of length on the run costs `d` against 1 off it. The cheapest route meets the run at the angle `acos(d)`.
 * The function gives the distance from `at` toward `next` of that merge point. A value of 0 or less tells that the turn at `at` is already at most `acos(d)`.
 */
export function snellOffset(from: Point, at: Point, next: Point, d: number): number {
  const len = dist(at, next);
  if (len <= 0) return 0;
  const ux = (next.x - at.x) / len;
  const uy = (next.y - at.y) / len;
  const vx = from.x - at.x;
  const vy = from.y - at.y;
  // The foot of `from` on the line of the run is at `along` from `at`, and `from` is `h` from the line.
  const along = vx * ux + vy * uy;
  const h = Math.abs(vx * uy - vy * ux);
  const c = Math.min(0.999, Math.max(0, d));
  return along + (h * c) / Math.sqrt(1 - c * c);
}

/** The turn, in radians from 0 to π, at `b` on the way from `a` through `b` to `c`. */
function turnAt(a: Point, b: Point, c: Point): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
}

/**
 * This function moves the merge points of the ways of the router `shared` to the Snell angle (NAT-035). It changes the ways in place.
 *
 * A way joins a run at a corner `J` when it comes alone from the corner before, and the link from `J` to the next corner has other edges of its key.
 * When the way turns at `J` by more than `acos(d)`, it goes directly to a new point `J*` on that link, where it meets the link at that angle.
 * Each way on the link gets `J*` as a new corner, so the run keeps the same points in each route. Then the same rule moves the exits, on the reversed ways.
 *
 * `firstId` is the first free id of a corner. `clear` tells if a line keeps out of the boxes. `delta` gives the cost share `d` of a link with `f` other edges.
 */
export function snellMerges(ways: readonly Way[], firstId: number, clear: (a: Point, b: Point) => boolean, delta: (f: number) => number): void {
  let next = firstId;
  const keys = new Map<string, Way[]>();
  for (const w of ways) {
    if (!w.found) continue;
    const list = keys.get(w.key);
    if (list) list.push(w);
    else keys.set(w.key, [w]);
  }
  for (const group of keys.values()) {
    if (group.length < 2) continue;
    const linkOf = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const on = new Map<string, Set<Way>>();
    const add = (k: string, w: Way): void => {
      const set = on.get(k);
      if (set) set.add(w);
      else on.set(k, new Set([w]));
    };
    const drop = (k: string, w: Way): void => {
      const set = on.get(k);
      if (!set) return;
      set.delete(w);
      if (set.size === 0) on.delete(k);
    };
    for (const w of group) for (let i = 1; i < w.ids.length; i++) add(linkOf(w.ids[i - 1]!, w.ids[i]!), w);
    // First the merges, then the exits: an exit is a merge of the reversed way.
    for (const back of [false, true]) {
      for (const w of group) {
        if (back) {
          w.seq.reverse();
          w.ids.reverse();
        }
        for (let i = 1; i < w.ids.length - 1; i++) {
          const before = on.get(linkOf(w.ids[i - 1]!, w.ids[i]!));
          const after = on.get(linkOf(w.ids[i]!, w.ids[i + 1]!));
          if (!before || !after || before.size !== 1 || after.size < 2) continue;
          const P = w.seq[i - 1]!;
          const J = w.seq[i]!;
          const N = w.seq[i + 1]!;
          const d = delta(after.size - 1);
          const turn = turnAt(P, J, N);
          if (turn <= Math.acos(d) + 1e-3) continue;
          const len = dist(J, N);
          let t = Math.min(len, snellOffset(P, J, N, d));
          // A line from P to the merge point that goes through a box moves the point back toward J, at most three times.
          const pointAt = (s: number): Point => ({ x: J.x + ((N.x - J.x) * s) / len, y: J.y + ((N.y - J.y) * s) / len });
          let tries = 0;
          while (t >= 1 && !clear(P, pointAt(t)) && tries < 3) {
            t /= 2;
            tries++;
          }
          if (t < 1 || !clear(P, pointAt(t))) continue;
          const a = w.ids[i - 1]!;
          const j = w.ids[i]!;
          const n = w.ids[i + 1]!;
          if (t >= len - 1e-6) {
            // The merge point is the next corner: the way skips J.
            drop(linkOf(a, j), w);
            drop(linkOf(j, n), w);
            w.seq.splice(i, 1);
            w.ids.splice(i, 1);
            add(linkOf(a, n), w);
            continue;
          }
          const star = pointAt(t);
          const id = next++;
          const users = [...after];
          on.delete(linkOf(j, n));
          // Each way on the link from J to N gets the new corner between them.
          for (const o of users) {
            for (let k = 0; k < o.ids.length - 1; k++) {
              const x = o.ids[k]!;
              const y = o.ids[k + 1]!;
              if ((x === j && y === n) || (x === n && y === j)) {
                o.seq.splice(k + 1, 0, star);
                o.ids.splice(k + 1, 0, id);
                break;
              }
            }
            add(linkOf(j, id), o);
            add(linkOf(id, n), o);
          }
          // The way itself goes from P directly to the new corner.
          drop(linkOf(a, j), w);
          drop(linkOf(j, id), w);
          w.seq.splice(i, 1);
          w.ids.splice(i, 1);
          add(linkOf(a, id), w);
        }
        if (back) {
          w.seq.reverse();
          w.ids.reverse();
        }
      }
    }
  }
}
