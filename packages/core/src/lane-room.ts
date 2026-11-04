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

/** This function gives the shared ways with the field `room`. It takes the runs or the bundles of a router, and its obstacles. */
export function withLaneRoom<T extends SharedRun>(ways: readonly T[], obstacles: Obstacles): T[] {
  return ways.map((way) => ({ ...way, room: laneRoom(way.points, obstacles) }));
}
