import type { Box, Point } from "./geom.ts";

/** The labels of a set of points, and the number of cells that the labeling looked at. */
export interface FreeRegions {
  /** The region of each point. The value 0 tells that the point is in no free cell, so no filter can use it. */
  readonly labels: Int32Array;
  /** The number of cells of the table. Each cell costs one pass of the marks and one pass of the flood. */
  readonly cells: number;
}

/** The length of a segment inside a box that the sight test forgives. This is the default `eps` of `segmentHitsRect`. */
const SIGHT_EPS = 1e-6;

/** This function gives the distinct values in ascending order. */
function sortedUnique(values: readonly number[]): Float64Array {
  const sorted = Float64Array.from(values).sort();
  let n = 0;
  for (const v of sorted) {
    if (n === 0 || v !== sorted[n - 1]) sorted[n++] = v;
  }
  return sorted.subarray(0, n);
}

/** This function counts the values that are at most `v`. */
function rank(sorted: Float64Array, v: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid]! <= v) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * This function labels the free regions of a board, and each point with its region (JOIN-COST).
 * Two points with different labels have no clear sight line, with the padded sight test of `Obstacles`.
 * The reverse is not true: two points with one label can have no clear sight line.
 *
 * The boxes get `pad` and then lose a small slack on each side. Their edges cut the plane into a table of cells, so each cell is free or blocked.
 * The slack is larger than the length that the sight test forgives. So a sight line that the test passes stays out of each reduced box.
 * The flood goes in eight directions. A seam between two touching boxes stays open, and a thin box that the test forgives does not block.
 * The function gives undefined when the table has more than `limit` cells, or when a box has no finite position.
 */
export function freeRegions(boxes: readonly Box[], pad: number, points: readonly Point[], limit: number): FreeRegions | undefined {
  let extent = 0;
  for (const b of boxes) extent = Math.max(extent, Math.abs(b.x) + b.w + pad, Math.abs(b.y) + b.h + pad);
  if (!Number.isFinite(extent)) return undefined;
  const slack = Math.max(2 * SIGHT_EPS, extent * 1e-12);
  const rects: (readonly [number, number, number, number])[] = [];
  const xValues: number[] = [];
  const yValues: number[] = [];
  for (const b of boxes) {
    const x0 = b.x - pad + slack;
    const y0 = b.y - pad + slack;
    const x1 = b.x + b.w + pad - slack;
    const y1 = b.y + b.h + pad - slack;
    if (x1 <= x0 || y1 <= y0) continue;
    rects.push([x0, y0, x1, y1]);
    xValues.push(x0, x1);
    yValues.push(y0, y1);
  }
  const xs = sortedUnique(xValues);
  const ys = sortedUnique(yValues);
  const cols = xs.length + 1;
  const rows = ys.length + 1;
  const cells = cols * rows;
  if (cells > limit) return undefined;

  // The value at a cell is the number of boxes on that cell, after the running sums. The cell `c` lies between `xs[c - 1]` and `xs[c]`.
  const width = cols + 1;
  const marks = new Int32Array(width * (rows + 1));
  for (const [x0, y0, x1, y1] of rects) {
    const c0 = rank(xs, x0);
    const c1 = rank(xs, x1);
    const r0 = rank(ys, y0);
    const r1 = rank(ys, y1);
    marks[r0 * width + c0]!++;
    marks[r0 * width + c1]!--;
    marks[r1 * width + c0]!--;
    marks[r1 * width + c1]!++;
  }
  const FREE = -1;
  const cellLabels = new Int32Array(cells);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const at = r * width + c;
      if (c > 0) marks[at]! += marks[at - 1]!;
      if (r > 0) marks[at]! += marks[at - width]!;
      if (c > 0 && r > 0) marks[at]! -= marks[at - width - 1]!;
      if (marks[at] === 0) cellLabels[r * cols + c] = FREE;
    }
  }

  const stack = new Int32Array(cells);
  let next = 0;
  for (let start = 0; start < cells; start++) {
    if (cellLabels[start] !== FREE) continue;
    next++;
    cellLabels[start] = next;
    let top = 0;
    stack[top++] = start;
    while (top > 0) {
      const at = stack[--top]!;
      const c = at % cols;
      const r = (at - c) / cols;
      for (let nr = Math.max(0, r - 1); nr <= Math.min(rows - 1, r + 1); nr++) {
        for (let nc = Math.max(0, c - 1); nc <= Math.min(cols - 1, c + 1); nc++) {
          const near = nr * cols + nc;
          if (cellLabels[near] !== FREE) continue;
          cellLabels[near] = next;
          stack[top++] = near;
        }
      }
    }
  }

  const labels = new Int32Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    labels[i] = cellLabels[rank(ys, p.y) * cols + rank(xs, p.x)]!;
  }
  return { labels, cells };
}
