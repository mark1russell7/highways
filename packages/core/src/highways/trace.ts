import { dist, type Point } from "../geom.ts";
import type { Obstacles } from "../visibility.ts";
import type { WayFinder } from "../ways.ts";
import type { HighwayInput, HighwayPlan } from "./model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "./stretches.ts";

/** The options of `tracePlan`. */
export interface TraceOptions {
  /** The side of the grid that the waypoints snap to, in units of the board. The value 0 keeps each waypoint where it is. */
  readonly snap: number;
  /** A highway has this number of edges or more. The value is 2 or more. */
  readonly minSize: number;
  /** The key of the ways. Only the ways with one key share a highway. */
  readonly key: string;
}

/**
 * This function moves a point out of each box, made larger by `pad`. A point in a box moves to the nearest side of that box.
 * The function tries four times, so a point between two near boxes can stay in a box.
 */
export function outOfBoxes(obstacles: Obstacles, p: Point, pad: number): Point {
  let q = p;
  for (let k = 0; k < 4; k++) {
    let hit: { x: number; y: number; w: number; h: number } | undefined;
    obstacles.query({ x: q.x - pad, y: q.y - pad, w: 2 * pad, h: 2 * pad }, (n) => {
      const b = n.box;
      if (!hit && q.x > b.x - pad && q.x < b.x + b.w + pad && q.y > b.y - pad && q.y < b.y + b.h + pad) hit = b;
    });
    if (!hit) return q;
    const b = hit;
    const eps = 1e-3;
    const moves = [
      { d: q.x - (b.x - pad), p: { x: b.x - pad - eps, y: q.y } },
      { d: b.x + b.w + pad - q.x, p: { x: b.x + b.w + pad + eps, y: q.y } },
      { d: q.y - (b.y - pad), p: { x: q.x, y: b.y - pad - eps } },
      { d: b.y + b.h + pad - q.y, p: { x: q.x, y: b.y + b.h + pad + eps } },
    ];
    moves.sort((u, v) => u.d - v.d);
    q = moves[0]!.p;
  }
  return q;
}

/**
 * This function gives the push of the boxes on a point. Each box nearer than `reach` adds a unit vector away from it, times `(reach - d) / reach`.
 * The value `d` is the distance from the point to the box. It is the gradient of a field that is 0 at the distance `reach` from each box.
 */
export function boxPush(obstacles: Obstacles, p: Point, reach: number): Point {
  let x = 0;
  let y = 0;
  if (reach <= 0) return { x, y };
  obstacles.query({ x: p.x - reach, y: p.y - reach, w: 2 * reach, h: 2 * reach }, (n) => {
    const b = n.box;
    const qx = Math.max(b.x, Math.min(b.x + b.w, p.x));
    const qy = Math.max(b.y, Math.min(b.y + b.h, p.y));
    let dx = p.x - qx;
    let dy = p.y - qy;
    let d = Math.hypot(dx, dy);
    if (d >= reach) return;
    if (d < 1e-9) {
      // The point is in the box: it goes out through the nearest side.
      const sides = [
        { d: p.x - b.x, v: [-1, 0] },
        { d: b.x + b.w - p.x, v: [1, 0] },
        { d: p.y - b.y, v: [0, -1] },
        { d: b.y + b.h - p.y, v: [0, 1] },
      ].sort((u, v) => u.d - v.d);
      [dx, dy] = sides[0]!.v as [number, number];
      d = 0;
    } else {
      dx /= d;
      dy /= d;
    }
    const f = (reach - d) / reach;
    x += dx * f;
    y += dy * f;
  });
  return { x, y };
}

/** This function gives points at equal steps of `step` or a little less along a polyline, without its two ends. A polyline without length gives no point. */
export function innerPoints(line: readonly Point[], step: number): Point[] {
  const at: number[] = [0];
  for (let i = 1; i < line.length; i++) at.push(at[i - 1]! + dist(line[i - 1]!, line[i]!));
  const total = at[at.length - 1] ?? 0;
  if (total <= 1e-9 || step <= 0) return [];
  const count = Math.floor(total / step);
  const out: Point[] = [];
  let j = 1;
  for (let k = 1; k <= count; k++) {
    const s = (total * k) / (count + 1);
    while (j < line.length - 1 && at[j]! < s) j++;
    const a = line[j - 1]!;
    const b = line[j]!;
    const len = at[j]! - at[j - 1]!;
    const u = len > 0 ? Math.max(0, Math.min(1, (s - at[j - 1]!) / len)) : 0;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}

/**
 * This function gives the way of one edge through its waypoints. The way starts at `a` and ends at `b`.
 * Each waypoint snaps to the grid of side `snap`. A waypoint in a box moves to the nearest corner of the corner graph.
 * From each waypoint to the next one, the way is a straight line when that line is clear. Otherwise it goes through the corner graph.
 * A waypoint that the graph does not reach is not on the way. When the way cannot reach `b`, the function gives the way of the corner graph from `a` to `b`.
 */
export function waypointWay(finder: WayFinder, a: Point, b: Point, waypoints: readonly Point[], snap: number): Point[] | undefined {
  const corners = finder.corners;
  const pad = finder.margin / 2;
  const fixed: Point[] = [];
  for (const w of waypoints) {
    let q = snap > 0 ? { x: Math.round(w.x / snap) * snap, y: Math.round(w.y / snap) * snap } : w;
    if (finder.obstacles.inside(q, pad)) {
      const i = corners.nearest(q);
      if (i < 0) continue;
      q = corners.points[i]!;
    }
    const last = fixed[fixed.length - 1];
    if (last && dist(last, q) <= 1e-9) continue;
    fixed.push(q);
  }
  const out: Point[] = [a];
  let at = a;
  for (const q of fixed) {
    if (dist(at, q) <= 1e-9) continue;
    const piece = corners.path(at, q);
    if (!piece) continue;
    out.push(...piece.slice(1));
    at = q;
  }
  const tail = dist(at, b) <= 1e-9 ? [b] : corners.path(at, b);
  if (!tail) return corners.path(a, b);
  out.push(...tail.slice(1));
  return out;
}

/**
 * This function gives the highways of the waypoints of each edge. The ways go through the corner graph, so they stay out of the boxes.
 * Each edge goes from the point at `margin` from its source plug, through its waypoints, to the point at `margin` from its target plug.
 * Each stretch that `minSize` ways or more share is one highway, with the needless corners removed.
 * An edge without waypoints takes its way of the corner graph.
 */
export function tracePlan(input: HighwayInput, finder: WayFinder, waypoints: ReadonlyMap<string, readonly Point[]>, o: Readonly<TraceOptions>): HighwayPlan {
  const ways: KeyedWay[] = [];
  for (const { edge, ps, pt } of edgePlugs(input.graph)) {
    const a = finder.out(ps);
    const b = finder.out(pt);
    const way = waypointWay(finder, a, b, waypoints.get(edge.id) ?? [], o.snap);
    if (way) ways.push({ edge: edge.id, key: o.key, points: way });
  }
  return sharedStretches(ways, { minSize: o.minSize, pull: (p) => finder.corners.pull(p) });
}
