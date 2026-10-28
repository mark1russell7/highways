// The total order of the lanes of a run (LANE-ORDER). `orderLanes` of `segments.ts` uses it.
// The package index does not export this module.

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
 * When no item is free, the remaining items hold a cycle. Then the step takes the remaining item with the smallest index, and drops its incoming constraints.
 * `breaks` counts these steps.
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
    let first = -1;
    let fewest = -1;
    for (let k = 0; k < n; k++) {
      if (done[k]) continue;
      if (first < 0) first = k;
      if (fewest < 0 || waits[k]! < waits[fewest]!) fewest = k;
      if (waits[k] === 0) {
        pick = k;
        break;
      }
    }
    if (pick < 0) {
      pick = breakRule === "fewest" ? fewest : first;
      breaks++;
    }
    done[pick] = 1;
    order.push(pick);
    for (const k of next[pick]!) waits[k]!--;
  }
  if (breaks > 0 && laneSort === "rank") {
    // MEASURE-ONLY: the rank by the count of the items that each item comes before, then the index.
    const wins = new Int32Array(n);
    for (let i = 0; i < n; i++) wins[i] = next[i]!.length;
    const ranked = Array.from({ length: n }, (_, i) => i).sort((a, b) => wins[b]! - wins[a]! || a - b);
    return { order: ranked, breaks };
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

/** This function gives the observer of `observeLanes`, or nothing. */
export function laneObserver(): LaneObserver | undefined {
  return observer;
}

// MEASURE-ONLY: the switch of the candidates of LANE-ORDER. The final change removes it.
/** The candidates of LANE-ORDER: the sort of the engine (before), a merge sort of the package, and the order of Kahn. */
export type LaneSort = "engine" | "merge" | "kahn" | "kahn-fewest" | "rank";

const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.["HIGHWAYS_LANE_SORT"];
let laneSort: LaneSort = fromEnv === "engine" || fromEnv === "merge" || fromEnv === "kahn-fewest" || fromEnv === "rank" ? fromEnv : "kahn";
let breakRule: "first" | "fewest" = laneSort === "kahn-fewest" ? "fewest" : "first";

/** This function sets the candidate. */
export function setLaneSort(s: LaneSort): void {
  laneSort = s;
  breakRule = s === "kahn-fewest" ? "fewest" : "first";
}

/** This function gives the candidate. */
export function currentLaneSort(): LaneSort {
  return laneSort;
}

/** This function sorts a list with a stable merge sort. The sequence of the pairs to `compare` depends only on the list and the results. */
export function mergeSort<T>(list: readonly T[], compare: (a: T, b: T) => number): T[] {
  if (list.length < 2) return [...list];
  const mid = list.length >> 1;
  const left = mergeSort(list.slice(0, mid), compare);
  const right = mergeSort(list.slice(mid), compare);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (!(compare(left[i]!, right[j]!) > 0)) out.push(left[i++]!);
    else out.push(right[j++]!);
  }
  while (i < left.length) out.push(left[i++]!);
  while (j < right.length) out.push(right[j++]!);
  return out;
}
