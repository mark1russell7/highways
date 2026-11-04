import { dist, type Point } from "./geom.ts";
import type { LaneRoom, SharedRun } from "./model.ts";
import { TOLERANCE } from "./bench/properties.ts";
import type { Obstacles } from "./visibility.ts";

/** The largest room that a side of a shared way reads, in units of the board. */
export const LANE_ROOM_LIMIT = 100;

/** The distance that the outer lane keeps from a box when the room holds it, in units of the board. */
export const LANE_CLEAR = 1;

/** The smallest distance between two lanes on one side of a shared way, in units of the board. A set of lanes with a smaller distance set by the caller keeps that distance. */
export const LANE_LEAST = 1;

/** A box counts only past this distance from a limit of a leg. So a box that only touches an end of a way does not count. */
const TOUCH = 1e-6;

/** The search around a leg reads this many times the limit of the room, because `offsetPolyline` moves a bend at most 2 times the offset. */
const MITER = 2;

/** One half plane: the points `p` with `(p - at) · normal >= least`. */
interface HalfPlane {
  readonly at: Point;
  readonly normal: Point;
  readonly least: number;
}

const inside = (p: Point, h: HalfPlane): number => (p.x - h.at.x) * h.normal.x + (p.y - h.at.y) * h.normal.y - h.least;

/** This function cuts a convex polygon with a half plane. */
function clip(polygon: readonly Point[], h: HalfPlane): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const [da, db] = [inside(a, h), inside(b, h)];
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) out.push({ x: a.x + (b.x - a.x) * (da / (da - db)), y: a.y + (b.y - a.y) * (da / (da - db)) });
  }
  return out;
}

const unit = (v: Point): Point | undefined => {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : undefined;
};

/** This function gives the unit direction of each leg of a way. A leg with no length takes the direction of the leg before it. */
function directions(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    out.push(unit({ x: b.x - a.x, y: b.y - a.y }) ?? out[out.length - 1] ?? { x: 0, y: 0 });
  }
  return out;
}

/**
 * This function gives the free room on each side of a shared way, as the distance to the nearest box.
 * A leg owns the part of the plane between the bisectors at its two ends, because `offsetPolyline` moves a bend along its bisector.
 * So each box counts at its nearest point inside that part, and the room also holds at the outer side of a bend.
 * A wall counts as `Obstacles.across` counts it. A box with less than `TOLERANCE` over the way leaves that side at 0 and the other side free.
 * Left is on the left of the way, from its first point to its last, with the y axis down.
 */
export function laneRoom(points: readonly Point[], obstacles: Obstacles): LaneRoom {
  const room = { left: LANE_ROOM_LIMIT, right: LANE_ROOM_LIMIT };
  const along = directions(points);
  for (let i = 0; i < along.length; i++) {
    const [a, b, dir] = [points[i]!, points[i + 1]!, along[i]!];
    if (dist(a, b) === 0) continue;
    const before = i > 0 ? unit({ x: along[i - 1]!.x + dir.x, y: along[i - 1]!.y + dir.y }) : undefined;
    const after = i + 1 < along.length ? unit({ x: along[i + 1]!.x + dir.x, y: along[i + 1]!.y + dir.y }) : undefined;
    const end = after ?? dir;
    const start: HalfPlane = { at: a, normal: before ?? dir, least: TOUCH };
    const stop: HalfPlane = { at: b, normal: { x: -end.x, y: -end.y }, least: TOUCH };
    const left = { x: dir.y, y: -dir.x };
    const reach = MITER * LANE_ROOM_LIMIT;
    const [x, y] = [Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach];
    const search = { x, y, w: Math.abs(b.x - a.x) + 2 * reach, h: Math.abs(b.y - a.y) + 2 * reach };
    obstacles.query(search, ({ box }) => {
      const corners = [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }];
      const part = clip(clip(corners, start), stop);
      for (const [name, normal] of [["left", left], ["right", { x: -left.x, y: -left.y }]] as const) {
        const side: HalfPlane = { at: a, normal, least: TOLERANCE };
        const near = clip(part, side).map((p) => inside(p, side));
        if (near.length === 0) continue;
        const gap = Math.min(...near);
        room[name] = Math.min(room[name], gap <= 1e-9 ? 0 : gap + TOLERANCE);
      }
    });
  }
  return room;
}

/**
 * This function gives the room in the wedge at the outer side of a turn from `before` over `at` to `after`.
 * The room has the sides of that direction.
 * A lane goes straight from the end of one way to the start of the next one.
 * That link stays in the triangle of `at` and the two offset points.
 * A box in the wedge stops the link at the offset where the line of the link reaches the box. The other side has no wedge.
 */
function wedgeRoom(before: Point, at: Point, after: Point, obstacles: Obstacles): LaneRoom {
  const room = { left: LANE_ROOM_LIMIT, right: LANE_ROOM_LIMIT };
  const [dir, next] = [unit({ x: at.x - before.x, y: at.y - before.y }), unit({ x: after.x - at.x, y: after.y - at.y })];
  if (dir === undefined || next === undefined) return room;
  const turn = dir.x * next.y - dir.y * next.x;
  if (Math.abs(turn) <= 1e-9) return room;
  const outer = turn > 0 ? "left" : "right";
  const sign = outer === "left" ? 1 : -1;
  const normal = (d: Point): Point => ({ x: sign * d.y, y: -sign * d.x });
  const across = unit({ x: normal(dir).x + normal(next).x, y: normal(dir).y + normal(next).y });
  if (across === undefined) return room;
  const scale = normal(dir).x * across.x + normal(dir).y * across.y;
  const past: HalfPlane = { at, normal: dir, least: TOUCH };
  const ahead: HalfPlane = { at, normal: { x: -next.x, y: -next.y }, least: TOUCH };
  const reach = LANE_ROOM_LIMIT;
  obstacles.query({ x: at.x - reach, y: at.y - reach, w: 2 * reach, h: 2 * reach }, ({ box }) => {
    const corners = [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }];
    for (const p of clip(clip(corners, past), ahead)) {
      const offset = ((p.x - at.x) * across.x + (p.y - at.y) * across.y) / scale;
      room[outer] = Math.min(room[outer], Math.max(0, offset));
    }
  });
  return room;
}

const placeKey = (p: Point): string => `${p.x},${p.y}`;

/** This record is a neighbor of a corner of a way: the place of the neighbor, and the index of its way. */
interface Neighbor {
  readonly point: Point;
  readonly way: number;
}

/** This function gives the neighbors of each corner of the ways, by the place of the corner. */
function cornerNeighbors(ways: readonly SharedRun[]): Map<string, Neighbor[]> {
  const out = new Map<string, Neighbor[]>();
  ways.forEach((way, index) => {
    way.points.forEach((p, i) => {
      const near = [way.points[i - 1], way.points[i + 1]].filter((q): q is Point => q !== undefined && dist(p, q) > 0);
      const list = out.get(placeKey(p)) ?? [];
      for (const point of near) list.push({ point, way: index });
      out.set(placeKey(p), list);
    });
  });
  return out;
}

/**
 * This function gives the room of the way `index` at its joins with the other ways.
 * A join is a corner of another way at an end of this way.
 * No leg of a way owns the wedge at the outer side of a join. So `laneRoom` of a way does not read a box there.
 */
function joinRoom(points: readonly Point[], index: number, neighbors: ReadonlyMap<string, readonly Neighbor[]>, obstacles: Obstacles): LaneRoom {
  const room = { left: LANE_ROOM_LIMIT, right: LANE_ROOM_LIMIT };
  const [first, last] = [points[0]!, points[points.length - 1]!];
  const afterFirst = points.find((p) => dist(p, first) > 0);
  const beforeLast = [...points].reverse().find((p) => dist(p, last) > 0);
  if (afterFirst === undefined || beforeLast === undefined) return room;
  const others = (p: Point): readonly Point[] => (neighbors.get(placeKey(p)) ?? []).filter((n) => n.way !== index).map((n) => n.point);
  const near = [...others(first).map((exit) => wedgeRoom(exit, first, afterFirst, obstacles)), ...others(last).map((exit) => wedgeRoom(beforeLast, last, exit, obstacles))];
  return { left: Math.min(room.left, ...near.map((r) => r.left)), right: Math.min(room.right, ...near.map((r) => r.right)) };
}

/**
 * This function gives the shared ways with the field `room`. It takes the runs or the bundles of a router, and its obstacles.
 * The room of a way is the room along the way and at its joins with the other ways of the list.
 */
export function withLaneRoom<T extends SharedRun>(ways: readonly T[], obstacles: Obstacles): T[] {
  const neighbors = cornerNeighbors(ways);
  return ways.map((way, index) => {
    const along = laneRoom(way.points, obstacles);
    const joins = joinRoom(way.points, index, neighbors, obstacles);
    return { ...way, room: { left: Math.min(along.left, joins.left), right: Math.min(along.right, joins.right) } };
  });
}
