import { TOLERANCE } from "../bench/properties.ts";
import { inflate, segmentHitsBox, type Box, type Point } from "../geom.ts";
import { Grid } from "../grid.ts";
import type { CurveSegment } from "./model.ts";
import { sampleCurve } from "./sample.ts";

/**
 * The free space of a board: the boxes that a curve must not go through.
 * Make it one time for a board with `curveSpace`, and give it to each call of `curveOf`.
 */
export interface CurveSpace {
  /** The boxes of the board. */
  readonly boxes: readonly Box[];
  /** The tolerance of the samples of a curve, in units of the plane. */
  readonly tolerance: number;
  /**
   * This method tells if the polyline `q` goes through a box that the polyline `p` does not go through.
   * A polyline goes through a box when a part of it longer than `TOLERANCE` is inside the box made smaller by `TOLERANCE`.
   */
  addsHit(q: readonly Point[], p: readonly Point[]): boolean;
  /**
   * This method tells if the triangle `(a, v, b)` overlaps a box that the polyline `(a, v, b)` does not go through.
   * A convex corner from `a` to `b` stays in this triangle, so a clear triangle proves a clear corner with no samples.
   * The method is optional. Without it, a corner samples its curve.
   */
  addsHitTriangle?(a: Point, v: Point, b: Point): boolean;
}

/**
 * This function makes the free space of a board from its boxes. The boxes are the nodes, or the items of a zoom level.
 * The curves sample each piece within `tolerance` of the curve for the test.
 */
export function curveSpace(boxes: readonly Box[], tolerance = 0.25): CurveSpace {
  const inner = boxes.map((b) => inflate(b, -TOLERANCE));
  let size = 0;
  for (const b of boxes) size += Math.max(b.w, b.h);
  // The buckets grow with the boxes, as the buckets of `measureLinks` do.
  const grid = new Grid<number>(Math.max(180, (2 * size) / Math.max(1, boxes.length)));
  inner.forEach((b, i) => grid.add(i, b));
  const hits = (p: readonly Point[]): Set<number> => {
    const out = new Set<number>();
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      grid.querySegment(a, b, 0, (id) => {
        if (!out.has(id) && segmentHitsBox(a, b, inner[id]!, TOLERANCE)) out.add(id);
      });
    }
    return out;
  };
  return {
    boxes,
    tolerance,
    addsHit(q: readonly Point[], p: readonly Point[]): boolean {
      let before: Set<number> | undefined;
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1]!;
        const b = q[i]!;
        const hit = grid.someSegment(a, b, 0, (id) => {
          if (!segmentHitsBox(a, b, inner[id]!, TOLERANCE)) return false;
          before ??= hits(p);
          return !before.has(id);
        });
        if (hit) return true;
      }
      return false;
    },
    addsHitTriangle(a: Point, v: Point, b: Point): boolean {
      const x0 = Math.min(a.x, v.x, b.x);
      const y0 = Math.min(a.y, v.y, b.y);
      let before: Set<number> | undefined;
      let hit = false;
      grid.query({ x: x0, y: y0, w: Math.max(a.x, v.x, b.x) - x0, h: Math.max(a.y, v.y, b.y) - y0 }, (id) => {
        if (hit || !triangleOverlapsBox(a, v, b, inner[id]!)) return;
        before ??= hits([a, v, b]);
        if (!before.has(id)) hit = true;
      });
      return hit;
    },
  };
}

/**
 * This function tells if the triangle `(a, b, c)` and the box overlap by more than `eps`. It is the test of the separating axes:
 * the two axes of the box and the normal of each side of the triangle.
 */
export function triangleOverlapsBox(a: Point, b: Point, c: Point, box: Box, eps = 1e-9): boolean {
  if (Math.max(a.x, b.x, c.x) <= box.x + eps || Math.min(a.x, b.x, c.x) >= box.x + box.w - eps) return false;
  if (Math.max(a.y, b.y, c.y) <= box.y + eps || Math.min(a.y, b.y, c.y) >= box.y + box.h - eps) return false;
  const corners: readonly Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x, y: box.y + box.h },
    { x: box.x + box.w, y: box.y + box.h },
  ];
  const tri = [a, b, c];
  for (let i = 0; i < 3; i++) {
    const p = tri[i]!;
    const q = tri[(i + 1) % 3]!;
    const n = { x: q.y - p.y, y: p.x - q.x };
    const len = Math.hypot(n.x, n.y);
    if (len < 1e-12) continue;
    const proj = (r: Point): number => ((r.x - p.x) * n.x + (r.y - p.y) * n.y) / len;
    // The triangle is on one side of its side pq: the side of the third vertex.
    const side = proj(tri[(i + 2) % 3]!);
    if (Math.abs(side) < 1e-12) continue;
    const toward = corners.map(proj).map((x) => (side > 0 ? x : -x));
    if (Math.max(...toward) <= eps) return false;
  }
  return true;
}

/**
 * This function finds the largest size from `max` down to 0 that keeps a convex corner clear, with the test of its triangle.
 * The function `triangle` gives the start of the corner, the vertex and the end of the corner at a size.
 * Without `addsHitTriangle` in the space, the function samples the segments of `piece`, as `fitSize` does.
 * The function tries `max` first, then it halves the interval `steps` times.
 */
export function fitCorner(
  space: CurveSpace | undefined,
  max: number,
  triangle: (size: number) => readonly [Point, Point, Point],
  piece: (size: number) => readonly CurveSegment[],
  steps = 8,
): number {
  if (space === undefined || max <= 0) return Math.max(0, max);
  const test = space.addsHitTriangle?.bind(space);
  if (!test) return fitSize(space, max, triangle, piece, steps);
  const clear = (size: number): boolean => !test(...triangle(size));
  if (clear(max)) return max;
  let lo = 0;
  let hi = max;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * This function finds the largest size from `max` down to 0 that keeps a piece of a curve clear.
 * A clear piece goes through no box that its polyline avoids.
 *
 * The function `piece` gives the segments of the piece at a size. They start with a `move`.
 * The polyline `chord` is the part of the original polyline that the piece replaces.
 * The function tries `max` first, then it halves the interval `steps` times. The result is 0 when no size of the search is clear.
 */
export function fitSize(
  space: CurveSpace | undefined,
  max: number,
  chord: (size: number) => readonly Point[],
  piece: (size: number) => readonly CurveSegment[],
  steps = 8,
): number {
  if (space === undefined || max <= 0) return Math.max(0, max);
  const clear = (size: number): boolean => !space.addsHit(sampleCurve(piece(size), space.tolerance), chord(size));
  if (clear(max)) return max;
  let lo = 0;
  let hi = max;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
