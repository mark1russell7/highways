/**
 * The work counters (SEARCH-BUDGET). Each hot loop of the routes and of the bundle measures adds its steps to one counter.
 * The counts are deterministic. The same graph and plan give the same counts on each platform.
 * The strategy `search` reads them to stop at its work budget. The script `scripts/search-work.ts` fits the time against them.
 */
export interface WorkCounts {
  /** The point steps of the lane order: `findRun`, and the walks of `partAfter` and `partBefore`. */
  lane: number;
  /** The corners that the A* search of the corner graph settles, and the links that it examines. */
  corner: number;
  /** The tests of sight: the corners that `#nearestVisible` examines, and the boxes that `Obstacles.hit` examines. */
  sight: number;
  /** The steps of the bundle measures of the score: the segments of the routes and the node visits of `ambiguity`. */
  score: number;
  /** The nodes and the edges of each call of `follow`: the fixed work of its corner graph and of each route. */
  route: number;
}

/** The counters. Each loop adds its count when it ends, so the cost of a count is small. */
export const WORK: WorkCounts = { lane: 0, corner: 0, sight: 0, score: 0, route: 0 };

/** The weight of each counter in a unit of work. The fit of `scripts/search-work.ts` gives them. */
export const WORK_WEIGHTS: Readonly<WorkCounts> = Object.freeze({ lane: 1, corner: 1, sight: 1, score: 1, route: 1 });

/** This function gives a copy of the counters. */
export function workCounts(): WorkCounts {
  return { ...WORK };
}

/** This function gives the units of work of a set of counts: the sum of each count times its weight. */
export function workUnits(counts: Readonly<WorkCounts>, weights: Readonly<WorkCounts> = WORK_WEIGHTS): number {
  return counts.lane * weights.lane + counts.corner * weights.corner + counts.sight * weights.sight + counts.score * weights.score + counts.route * weights.route;
}

/** This function gives the units of work since the counts `from`. */
export function workSince(from: Readonly<WorkCounts>, weights: Readonly<WorkCounts> = WORK_WEIGHTS): number {
  return workUnits({ lane: WORK.lane - from.lane, corner: WORK.corner - from.corner, sight: WORK.sight - from.sight, score: WORK.score - from.score, route: WORK.route - from.route }, weights);
}
