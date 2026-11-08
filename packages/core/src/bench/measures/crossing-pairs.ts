/**
 * This module counts the crossings of lines by pairs of edges (LANE-ROOM).
 * The count `crossings` of `measureQuality` keeps one copy of each drawn segment, so it cannot tell which edges cross. This count can tell, so a rise splits into new pairs and repeats.
 * The count reads each point on the grid `EPS_STEPS`, as `routePairCrossings` does. So a shift far under the grid does not move a touch.
 */
import { dist, segmentsCross, snapToEps, type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";

/** The line of one edge: a polyline of a lane, or the samples of a painted curve. */
export interface EdgeLine {
  readonly edge: string;
  readonly points: readonly Point[];
}

/** The change of the crossings from one set of lines to another set of the same edges. */
export interface PairSplit {
  /** The crossing points of the lines, and of the lines before the change. A point counts once for each pair of edges that meets at it. */
  readonly points: number;
  readonly beforePoints: number;
  /** The pairs of edges with at least one crossing, and the same count before the change. */
  readonly pairs: number;
  readonly beforePairs: number;
  /** The pairs that cross only after the change. */
  readonly added: number;
  /** The pairs that cross only before the change. */
  readonly lost: number;
}

/**
 * The version of the count of `crossingPairs`. Version 1 read the points as floats, and version 2 reads them on the grid `EPS_STEPS`.
 * Two counts of different versions do not compare.
 */
export const PAINT_COUNTER = 2;

/** The smallest cell of the grid. A curve has many short segments, so a cell of their mean length gives too many buckets. */
const LEAST_CELL = 20;

/** One segment of a line: the index of the line, the index of the segment in that line, and its ends. */
export interface LineSegment {
  readonly line: number;
  readonly index: number;
  readonly a: Point;
  readonly b: Point;
}

/** This function gives each pair of segments of two different edges that `test` accepts, and it gives no pair twice. It does not move a point. */
export function eachCrossing(
  lines: readonly EdgeLine[],
  visit: (first: LineSegment, second: LineSegment) => void,
  test: (a: Point, b: Point, c: Point, d: Point) => boolean = segmentsCross,
): void {
  const segments: LineSegment[] = [];
  lines.forEach((line, index) => {
    for (let i = 1; i < line.points.length; i++) {
      const [a, b] = [line.points[i - 1]!, line.points[i]!];
      if (a.x !== b.x || a.y !== b.y) segments.push({ line: index, index: i - 1, a, b });
    }
  });
  if (segments.length === 0) return;
  const mean = segments.reduce((sum, s) => sum + dist(s.a, s.b), 0) / segments.length;
  const grid = new Grid<number>(Math.max(LEAST_CELL, mean));
  segments.forEach((s, i) => grid.addSegment(i, s.a, s.b));
  segments.forEach((s, i) => {
    grid.querySegment(s.a, s.b, 0, (j) => {
      const other = segments[j]!;
      if (j > i && lines[other.line]!.edge !== lines[s.line]!.edge && test(s.a, s.b, other.a, other.b)) visit(s, other);
    });
  });
}

/** This function gives the lines with each point on the grid `EPS_STEPS`. */
export function snapLines(lines: readonly EdgeLine[]): EdgeLine[] {
  return lines.map((line) => ({ edge: line.edge, points: line.points.map(snapToEps) }));
}

/** This function gives the crossing points of each pair of edges, on the grid `EPS_STEPS`. Two lines of one edge do not count. */
export function crossingPairs(lines: readonly EdgeLine[]): ReadonlyMap<string, number> {
  const pairs = new Map<string, number>();
  const snapped = snapLines(lines);
  eachCrossing(snapped, (s, other) => {
    const key = [snapped[s.line]!.edge, snapped[other.line]!.edge].sort().join("|");
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  });
  return pairs;
}

/** This function compares the crossing pairs of `after` with `before`. The points that are not a first crossing of a pair are `points - pairs`. */
export function splitPairs(after: ReadonlyMap<string, number>, before: ReadonlyMap<string, number>): PairSplit {
  const sum = (pairs: ReadonlyMap<string, number>): number => [...pairs.values()].reduce((total, n) => total + n, 0);
  return {
    points: sum(after),
    beforePoints: sum(before),
    pairs: after.size,
    beforePairs: before.size,
    added: [...after.keys()].filter((key) => !before.has(key)).length,
    lost: [...before.keys()].filter((key) => !after.has(key)).length,
  };
}
