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

/**
 * This function sorts a list with a stable merge sort of the package, not with `Array.prototype.sort`.
 * The pairs that it gives to `compare` depend only on the list and on the results of `compare`.
 * Thus the result is the same on each JavaScript engine, also when `compare` is not a total order.
 * A value of `compare(a, b)` above 0 puts `b` before `a`. Any other value (below 0, 0 or NaN) keeps `a` first.
 */
export function mergeSort<T>(list: readonly T[], compare: (a: T, b: T) => number): T[] {
  if (list.length < 2) return [...list];
  const mid = list.length >> 1;
  const left = mergeSort(list.slice(0, mid), compare);
  const right = mergeSort(list.slice(mid), compare);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compare(left[i]!, right[j]!) > 0) out.push(right[j++]!);
    else out.push(left[i++]!);
  }
  while (i < left.length) out.push(left[i++]!);
  while (j < right.length) out.push(right[j++]!);
  return out;
}

/**
 * This function gives true when the relation of `n` items has a cycle. For `i < j`, a value of `before(i, j)` above 0 puts `j` before `i`.
 * Any other value puts `i` before `j`. The relation has no cycle when the counts of the items that each item comes before are all different.
 */
export function hasCycle(n: number, before: (i: number, j: number) => number): boolean {
  const wins = new Int32Array(n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) wins[before(i, j) > 0 ? j : i]!++;
  const seen = new Uint8Array(n);
  for (const w of wins) seen[w] = 1;
  return seen.includes(0);
}

/**
 * The function that `observeLanes` installs. It gets the lanes of each run in their start order, the relation, and the lane order.
 * The measure scripts use it to compare the lane order with the sort of the engine.
 */
export type LaneObserver = <T>(start: readonly T[], compare: (a: T, b: T) => number, lanes: readonly T[]) => void;

let observer: LaneObserver | undefined;

/** This function installs an observer of the lane orders, or removes it with `undefined`. The measure scripts use it. The routes do not change. */
export function observeLanes(fn: LaneObserver | undefined): void {
  observer = fn;
}

/** This function gives the lane order of a run: the merge sort of `start` with the relation `compare`. It tells the observer of `observeLanes`. */
export function orderRun<T>(start: readonly T[], compare: (a: T, b: T) => number): T[] {
  const lanes = mergeSort(start, compare);
  observer?.(start, compare, lanes);
  return lanes;
}

/**
 * This function gives the lane order of the placed routes of a run. `order` selects the relation.
 * With `run`, the sort starts from the order of `placed`. With `bundle`, it starts from the order of the edges, so that each run sorts the same edges the same way.
 */
export function orderPlaced(placed: readonly Placed[], order: "run" | "bundle"): Placed[] {
  return order === "run" ? orderRun(placed, byRun) : orderRun([...placed].sort(byEdge), byBundle);
}
