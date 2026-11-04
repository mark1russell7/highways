import { dist, type Point } from "./geom.ts";
import type { LaneRoom, SharedRun } from "./model.ts";
import { TOLERANCE } from "./bench/properties.ts";
import type { Obstacles } from "./visibility.ts";

/** The largest room that a side of a shared way reads, in units of the board. A wider set of lanes gets compressed to this room. */
export const LANE_ROOM_LIMIT = 100;

/** The distance that the outer lane keeps from a box, in units of the board. */
export const LANE_CLEAR = 1;

/** The smallest distance between two lanes on one side of a shared way, in units of the board. A set of lanes with a smaller distance set by the caller keeps that distance. */
export const LANE_LEAST = 1;

/** A leg must overlap a box along its length by more than this distance, so a box that only touches the end of a leg does not count. */
const TOUCH = 1e-6;

/**
 * This function gives the free room on each side of a shared way.
 * Each leg reads each box beside it. A box on the way itself leaves no room on the sides that it covers.
 * Left is on the left of the way, from its first point to its last, with the y axis down.
 */
export function laneRoom(points: readonly Point[], obstacles: Obstacles): LaneRoom {
  let left = LANE_ROOM_LIMIT;
  let right = LANE_ROOM_LIMIT;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = dist(a, b);
    if (length === 0) continue;
    const along = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const side = { x: along.y, y: -along.x };
    const reach = LANE_ROOM_LIMIT + LANE_CLEAR;
    const [x, y] = [Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach];
    const search = { x, y, w: Math.abs(b.x - a.x) + 2 * reach, h: Math.abs(b.y - a.y) + 2 * reach };
    obstacles.query(search, ({ box }) => {
      let [nearAlong, farAlong, nearSide, farSide] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const [cx, cy] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]] as const) {
        const [dx, dy] = [cx - a.x, cy - a.y];
        const u = dx * along.x + dy * along.y;
        const s = dx * side.x + dy * side.y;
        nearAlong = Math.min(nearAlong, u);
        farAlong = Math.max(farAlong, u);
        nearSide = Math.min(nearSide, s);
        farSide = Math.max(farSide, s);
      }
      if (farAlong <= TOUCH || nearAlong >= length - TOUCH) return;
      if (nearSide >= -TOLERANCE) left = Math.min(left, nearSide - LANE_CLEAR);
      else if (farSide <= TOLERANCE) right = Math.min(right, -farSide - LANE_CLEAR);
      else [left, right] = [0, 0];
    });
  }
  return { left: Math.max(0, left), right: Math.max(0, right) };
}

/** This function gives the shared ways with the field `room`. It takes the runs or the bundles of a router, and its obstacles. */
export function withLaneRoom<T extends SharedRun>(ways: readonly T[], obstacles: Obstacles): T[] {
  return ways.map((way) => ({ ...way, room: laneRoom(way.points, obstacles) }));
}
