import { dist, type Point } from "../geom.ts";

/**
 * This function gives the Gilbert split point of a trunk with `targets.length` edges (EDA-030). The point makes the flow cost least:
 * `len(start, s) * k^alpha + Σ_j len(s, t_j)`, with `k` the number of targets. Weighted Weiszfeld steps find it.
 * The distance from `start` stays from `lo` to `hi` times the distance to the center of the targets, and at most half of the distance to the nearest target.
 * The point moves back toward `start` out of the boxes, in steps of `step`.
 */
export function gilbertPoint(
  start: Point,
  targets: readonly Point[],
  alpha: number,
  free: (p: Point) => boolean,
  step: number,
  lo = 0.2,
  hi = 0.8,
): Point {
  if (targets.length === 0) return start;
  const k = targets.length;
  const c = { x: targets.reduce((s, p) => s + p.x, 0) / k, y: targets.reduce((s, p) => s + p.y, 0) / k };
  const L = dist(start, c);
  if (L === 0) return start;
  const w0 = k ** Math.min(1, Math.max(0, alpha));
  let s = { x: start.x + (c.x - start.x) * 0.5, y: start.y + (c.y - start.y) * 0.5 };
  for (let it = 0; it < 32; it++) {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    const pull = (p: Point, w: number): void => {
      const d = Math.max(1e-6, dist(s, p));
      sx += (w * p.x) / d;
      sy += (w * p.y) / d;
      sw += w / d;
    };
    pull(start, w0);
    for (const t of targets) pull(t, 1);
    const n = { x: sx / sw, y: sy / sw };
    const moved = dist(n, s);
    s = n;
    if (moved < 1e-3) break;
  }
  // The clamp keeps the split from `lo` to `hi` of the way, and at most half of the way to the nearest target.
  const r = dist(start, s);
  const most = Math.min(hi * L, 0.5 * Math.min(...targets.map((p) => dist(start, p))));
  const want = Math.min(most, Math.max(lo * L, r));
  const dir = r > 1e-9 ? { x: (s.x - start.x) / r, y: (s.y - start.y) / r } : { x: (c.x - start.x) / L, y: (c.y - start.y) / L };
  const at = (t: number): Point => ({ x: start.x + dir.x * t, y: start.y + dir.y * t });
  let d = want;
  while (d > 0 && !free(at(d))) d -= step;
  return d > 0 ? at(d) : start;
}

/** One point of a balancing-factor tree. */
export interface FanPoint {
  readonly point: Point;
  /** The index of the point before, toward the root. The root has -1. */
  parent: number;
  /** The length of the tree from the root to this point. */
  pl: number;
  /** A new branch can join the tree at this point, and on the link from its parent. A plug of a target is not open. */
  readonly open: boolean;
}

/** The result of `balancedFan`: the points of the tree, and the index of the last point of the route of each target. */
export interface Fan {
  readonly points: readonly FanPoint[];
  readonly leaf: readonly number[];
}

/**
 * This function grows a balancing-factor tree from `root` to the targets (NAT-017, after Cuntz and others, 2010).
 * At each step, the target `t` and the place `v` of the tree with the least `|v - goal(t)| + bf * PL(v)` join, with `PL(v)` the length of the tree from the root to `v`.
 * A place is a point of the tree, or the foot of `goal(t)` on a link of the tree. `bf` 0 gives the least ink, and a large `bf` gives direct routes.
 * `branch(v, t)` gives the way from `v` to the plug of the target `t`: its first point is `v`, and its last point is the plug.
 */
export function balancedFan(root: Point, goals: readonly Point[], bf: number, branch: (from: Point, t: number) => Point[]): Fan {
  const points: FanPoint[] = [{ point: root, parent: -1, pl: 0, open: true }];
  const leaf: number[] = goals.map(() => -1);
  const left = new Set(goals.map((_, i) => i));
  while (left.size > 0) {
    let best = Infinity;
    let pick = -1;
    let at = -1;
    let foot: { point: Point; pl: number } | undefined;
    for (const t of left) {
      const g = goals[t]!;
      for (let v = 0; v < points.length; v++) {
        const p = points[v]!;
        if (!p.open) continue;
        const c = dist(p.point, g) + bf * p.pl;
        if (c < best - 1e-9) {
          best = c;
          pick = t;
          at = v;
          foot = undefined;
        }
        // The foot of the goal on the link from the parent of v to v.
        if (p.parent < 0) continue;
        const a = points[p.parent]!.point;
        const b = p.point;
        const L = dist(a, b);
        if (L <= 1e-9) continue;
        const u = ((g.x - a.x) * (b.x - a.x) + (g.y - a.y) * (b.y - a.y)) / (L * L);
        if (u <= 1e-6 || u >= 1 - 1e-6) continue;
        const f = { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y) };
        const pl = points[p.parent]!.pl + u * L;
        const cf = dist(f, g) + bf * pl;
        if (cf < best - 1e-9) {
          best = cf;
          pick = t;
          at = v;
          foot = { point: f, pl };
        }
      }
    }
    left.delete(pick);
    let from = at;
    if (foot) {
      // The foot splits the link from the parent of `at` to `at`.
      points.push({ point: foot.point, parent: points[at]!.parent, pl: foot.pl, open: true });
      from = points.length - 1;
      points[at]!.parent = from;
    }
    const way = branch(points[from]!.point, pick);
    let prev = from;
    for (let i = 1; i < way.length; i++) {
      const q = way[i]!;
      const base = points[prev]!;
      if (dist(q, base.point) <= 1e-9) continue;
      points.push({ point: q, parent: prev, pl: base.pl + dist(base.point, q), open: i < way.length - 1 });
      prev = points.length - 1;
    }
    leaf[pick] = prev;
  }
  return { points, leaf };
}

/** This function gives the points of the tree from the root to the point `i`. */
export function fanPath(fan: Fan, i: number): Point[] {
  const out: Point[] = [];
  for (let j = i; j >= 0; j = fan.points[j]!.parent) out.push(fan.points[j]!.point);
  return out.reverse();
}
