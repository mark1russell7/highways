/**
 * The walls of the plug strategies `spread`, `leaders` and `assign`: one side of one node, its room, and the order of its far ends.
 */
import { center, type Box, type Point } from "../geom.ts";
import type { Side } from "../model.ts";
import { SIDE_NORMAL } from "../plugs.ts";

/** This function gives the axis along a side. */
export function alongOf(side: Side): "x" | "y" {
  return side === "east" || side === "west" ? "y" : "x";
}

/** This function gives the room of a wall: the segment of the axis along the side, without the corner insets. */
export function roomOf(box: Box, side: Side, inset: number): [number, number] {
  const along = alongOf(side);
  const start = along === "y" ? box.y : box.x;
  const len = along === "y" ? box.h : box.w;
  const m = Math.min(inset, len / 4);
  return [start + m, start + len - m];
}

/** This function gives the point of a side at `v` on the axis along the side. */
export function pointAt(box: Box, side: Side, v: number): Point {
  if (side === "east") return { x: box.x + box.w, y: v };
  if (side === "west") return { x: box.x, y: v };
  if (side === "south") return { x: v, y: box.y + box.h };
  return { x: v, y: box.y };
}

/**
 * This function gives the sort key of a far point on a wall. The key has the order of the angle from the normal of the wall, from the center of the box.
 * The key grows in the direction of the axis along the wall. Thus the plugs in the order of the keys do not cross at the wall.
 */
export function keyOf(box: Box, side: Side, far: Point): number {
  const c = center(box);
  const n = SIDE_NORMAL[side];
  const dx = far.x - c.x;
  const dy = far.y - c.y;
  const out = dx * n.x + dy * n.y;
  const along = alongOf(side) === "y" ? dy : dx;
  // A pseudo-angle with the order of the angle: a sum and one division, with no transcendental call. It goes from -2 to 2.
  const size = Math.abs(out) + Math.abs(along);
  if (size === 0) return 0;
  const p = along / size;
  if (out >= 0) return p;
  return along >= 0 ? 2 - p : -2 - p;
}
