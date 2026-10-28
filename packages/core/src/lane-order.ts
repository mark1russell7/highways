// The lane order of a run (LANE-ORDER): the relation of two lanes, and a total order from it. `orderLanes` of `segments.ts` uses this module.
// The package index does not export this module.
import { byText } from "./compare.ts";
import { dist, type Point } from "./geom.ts";

/** Two points nearer than this distance are the same point. The value is the same as in `segments.ts`. */
const SAME = 1e-6;

/** The place of a route on a run. The points go in the direction of the run. `s` and `e` are the indexes of the ends of the run. */
export interface Placed {
  readonly edge: string;
  readonly p: readonly Point[];
  readonly s: number;
  readonly e: number;
}

/** The place where two routes part past one end of their common stretch, and the side of the first route there. */
interface Parting {
  /** The last common point. */
  readonly at: Point;
  /** This value is below 0 when the first route goes to the left of the second route. It is above 0 when it goes to the right. */
  readonly side: number;
}

/** The angle, from -π to π, of the turn at `base` from the direction `from` → `base` to the point `to`. */
function turn(from: Point, base: Point, to: Point): number {
  const dx = base.x - from.x;
  const dy = base.y - from.y;
  const vx = to.x - base.x;
  const vy = to.y - base.y;
  return Math.atan2(dx * vy - dy * vx, dx * vx + dy * vy);
}

/** This function gives the place where the routes `P` and `Q` part after the last point of the run, or nothing. */
function partAfter(P: Placed, Q: Placed): Parting | undefined {
  for (let j = 1; ; j++) {
    const a = P.p[P.e + j];
    const b = Q.p[Q.e + j];
    if (a === undefined || b === undefined) return undefined;
    if (dist(a, b) > SAME) {
      const from = P.p[P.e + j - 2]!;
      const at = P.p[P.e + j - 1]!;
      const side = turn(from, at, a) - turn(from, at, b);
      return side === 0 ? undefined : { at, side };
    }
  }
}

/** This function gives the place where the routes `P` and `Q` part before the first point of the run, or nothing. */
function partBefore(P: Placed, Q: Placed): Parting | undefined {
  for (let j = 1; ; j++) {
    const a = P.p[P.s - j];
    const b = Q.p[Q.s - j];
    if (a === undefined || b === undefined) return undefined;
    if (dist(a, b) > SAME) {
      const from = P.p[P.s - j + 2]!;
      const at = P.p[P.s - j + 1]!;
      // Seen backward, the left side is the right side. Thus the order turns around.
      const side = turn(from, at, b) - turn(from, at, a);
      return side === 0 ? undefined : { at, side };
    }
  }
}


/** This function compares two placed routes by their edge ids. */
export const byEdge = (P: Placed, Q: Placed): number => byText(P.edge, Q.edge);

/** This function puts the point `a` before the point `b`: the smaller x first, then the smaller y. */
const firstPoint = (a: Point, b: Point): boolean => a.x < b.x - SAME || (Math.abs(a.x - b.x) <= SAME && a.y < b.y);

/**
 * This function is the relation of the order `run`: the side after the run, else the side before the run, else the order of the edges.
 * A value below 0 puts `P` before `Q`. The relation is not transitive: three lanes can make a cycle.
 */
export const byRun = (P: Placed, Q: Placed): number => partAfter(P, Q)?.side ?? partBefore(P, Q)?.side ?? byEdge(P, Q);

/**
 * This function is the relation of the order `bundle`. When the two ends disagree, the end with the smaller x, then the smaller y, tells the side.
 * A value below 0 puts `P` before `Q`. The relation is not transitive: three lanes can make a cycle.
 */
export const byBundle = (P: Placed, Q: Placed): number => {
  const after = partAfter(P, Q);
  const before = partBefore(P, Q);
  if (after && before && Math.sign(after.side) !== Math.sign(before.side)) return firstPoint(after.at, before.at) ? after.side : before.side;
  return after?.side ?? before?.side ?? byEdge(P, Q);
};

/** The result of `precedenceOrder`. */
export interface PrecedenceOrder {
  /** The indexes of the items, in their order. */
  readonly order: number[];
  /** The count of the steps that broke a cycle. */
  readonly breaks: number;
}

/**
 * This function gives a total order of `n` items from a relation of each pair, with the algorithm of Kahn.
 * The items are in the order of their ids. For `i < j`, a value of `before(i, j)` below 0 puts `i` before `j`.
 * A value above 0 puts `j` before `i`. Any other value (0 or NaN) puts `i` before `j`.
 * The function calls `before` one time for each pair, with `i < j`.
 *
 * Each step takes the free item with the smallest index. An item is free when no remaining item must come before it.
 * When no item is free, the remaining items hold a cycle. Then the step takes the remaining item with the fewest remaining predecessors, then the smallest index.
 * It drops the incoming constraints of that item. `breaks` counts these steps.
 * That item is in the source component of the remaining items, so the step drops only constraints inside a cycle.
 *
 * The result depends only on the relation. When the relation has no cycle, the result is the only order that keeps each pair.
 */
export function precedenceOrder(n: number, before: (i: number, j: number) => number): PrecedenceOrder {
  const next: number[][] = Array.from({ length: n }, () => []);
  const waits = new Int32Array(n);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (before(i, j) > 0) {
        next[j]!.push(i);
        waits[i]!++;
      } else {
        next[i]!.push(j);
        waits[j]!++;
      }
    }
  const done = new Uint8Array(n);
  const order: number[] = [];
  let breaks = 0;
  for (let step = 0; step < n; step++) {
    let pick = -1;
    let fewest = -1;
    for (let k = 0; k < n; k++) {
      if (done[k]) continue;
      if (waits[k] === 0) {
        pick = k;
        break;
      }
      if (fewest < 0 || waits[k]! < waits[fewest]!) fewest = k;
    }
    if (pick < 0) {
      pick = fewest;
      breaks++;
    }
    done[pick] = 1;
    order.push(pick);
    for (const k of next[pick]!) waits[k]!--;
  }
  return { order, breaks };
}

/** The function that `observeLanes` installs. It gets the count of the lanes of each run that `orderLanes` orders, and the count of the broken cycles. */
export type LaneObserver = (lanes: number, breaks: number) => void;

let observer: LaneObserver | undefined;

/** This function installs an observer of `orderLanes`, or removes it with `undefined`. The measure scripts use it. The routes do not change. */
export function observeLanes(fn: LaneObserver | undefined): void {
  observer = fn;
}

/** This function gives the lane order of the placed routes of a run. The routes are in any order. `order` selects the relation. */
export function orderPlaced(placed: readonly Placed[], order: "run" | "bundle"): Placed[] {
  const compare = order === "run" ? byRun : byBundle;
  const sorted = [...placed].sort(byEdge);
  const { order: ranks, breaks } = precedenceOrder(sorted.length, (i, j) => compare(sorted[i]!, sorted[j]!));
  observer?.(sorted.length, breaks);
  return ranks.map((i) => sorted[i]!);
}
