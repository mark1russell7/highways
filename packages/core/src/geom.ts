/** A point in the plane. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box with its top-left corner at (`x`, `y`). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** This function gives the distance between two points. */
export function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** This function gives the center of a box. */
export function center(b: Box): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** This function gives a box that is larger by `m` on each side. A negative `m` makes the box smaller. */
export function inflate(b: Box, m: number): Box {
  return { x: b.x - m, y: b.y - m, w: Math.max(0, b.w + 2 * m), h: Math.max(0, b.h + 2 * m) };
}

/** This function gives the sum of the lengths of the segments of a polyline. */
export function polylineLength(p: readonly Point[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist(p[i - 1]!, p[i]!);
  return s;
}

const orient = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/**
 * This function tells if the segments `ab` and `cd` cross at one point inside both of them.
 * Segments that only touch at an end, or that are collinear, do not cross.
 */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * This function tells if the segment `ab` goes through the inside of the box.
 * The function clips the segment to the box (Liang-Barsky) and asks for a part longer than `eps`.
 */
export function segmentHitsBox(a: Point, b: Point, box: Box, eps = 1e-6): boolean {
  return segmentHitsRect(a, b, box.x, box.y, box.x + box.w, box.y + box.h, eps);
}

/** This function tells if the segment `ab` goes through the inside of the box from (`x0`, `y0`) to (`x1`, `y1`). */
export function segmentHitsRect(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number, eps = 1e-6): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  if (dx === 0) {
    if (a.x <= x0 || a.x >= x1) return false;
  } else {
    const ta = (x0 - a.x) / dx;
    const tb = (x1 - a.x) / dx;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return false;
  }
  if (dy === 0) {
    if (a.y <= y0 || a.y >= y1) return false;
  } else {
    const ta = (y0 - a.y) / dy;
    const tb = (y1 - a.y) / dy;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return false;
  }
  return (t1 - t0) * Math.sqrt(dx * dx + dy * dy) > eps;
}

/** This function gives the distance from a point to a box. The distance is 0 when the point is in the box. */
export function pointBoxDistance(p: Point, b: Box): number {
  const qx = Math.max(b.x, Math.min(b.x + b.w, p.x));
  const qy = Math.max(b.y, Math.min(b.y + b.h, p.y));
  return Math.hypot(p.x - qx, p.y - qy);
}

/** This function gives the distance from a point to the segment `ab`. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** This function gives the distance from the segment `ab` to a box. The distance is 0 when they touch. */
export function segmentBoxDistance(a: Point, b: Point, box: Box): number {
  if (segmentHitsBox(a, b, box, 0) || pointBoxDistance(a, box) === 0 || pointBoxDistance(b, box) === 0) return 0;
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x, y: box.y + box.h },
    { x: box.x + box.w, y: box.y + box.h },
  ];
  let d = Math.min(pointBoxDistance(a, box), pointBoxDistance(b, box));
  for (const c of corners) d = Math.min(d, pointSegmentDistance(c, a, b));
  return d;
}

/**
 * This function gives the turn at each inner vertex of a polyline, in radians, from -π to π.
 * A positive turn is counterclockwise in a frame with the y axis up. The function skips segments shorter than `eps`.
 */
export function turns(p: readonly Point[], eps = 1e-9): number[] {
  const q: Point[] = [];
  for (const v of p) if (q.length === 0 || dist(q[q.length - 1]!, v) > eps) q.push(v);
  const out: number[] = [];
  for (let i = 1; i + 1 < q.length; i++) {
    const a = q[i - 1]!;
    const b = q[i]!;
    const c = q[i + 1]!;
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const dt = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    out.push(Math.atan2(cr, dt));
  }
  return out;
}

/** This function counts the vertices of a polyline where the direction changes by more than `minTurn` radians. */
export function bendCount(p: readonly Point[], minTurn = 0.05): number {
  return turns(p).filter((t) => Math.abs(t) > minTurn).length;
}

/**
 * This function counts the inflections of a polyline: the changes of the sign of the turn.
 * A turn smaller than `minTurn` radians does not count. Thus a straight part between two turns keeps their signs.
 */
export function inflectionCount(p: readonly Point[], minTurn = 1e-3): number {
  let n = 0;
  let last = 0;
  for (const t of turns(p)) {
    if (Math.abs(t) <= minTurn) continue;
    const s = Math.sign(t);
    if (last !== 0 && s !== last) n++;
    last = s;
  }
  return n;
}

/**
 * This function gives the discrete Fréchet distance between two polylines (Eiter and Mannila, 1994).
 * The cost is O(|p|·|q|) in time and O(|q|) in memory.
 */
export function frechet(p: readonly Point[], q: readonly Point[]): number {
  if (p.length === 0 || q.length === 0) return p.length === q.length ? 0 : Infinity;
  let prev = new Float64Array(q.length);
  let cur = new Float64Array(q.length);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      const d = dist(p[i]!, q[j]!);
      if (i === 0 && j === 0) cur[j] = d;
      else if (i === 0) cur[j] = Math.max(cur[j - 1]!, d);
      else if (j === 0) cur[j] = Math.max(prev[j]!, d);
      else cur[j] = Math.max(Math.min(prev[j]!, prev[j - 1]!, cur[j - 1]!), d);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[q.length - 1]!;
}
