import { center, type Box, type Point } from "./geom.ts";
import { fixedPortPoint, type End, type Node, type Side } from "./model.ts";
import { clampToRange } from "./plugs/range.ts";

/** A plug: the point where a route leaves or enters a node, and the outward normal of its side. */
export interface Plug {
  readonly point: Point;
  readonly normal: Point;
}

/** The outward normal of each side, in a frame with the y axis down. */
export const SIDE_NORMAL: Readonly<Record<Side, Point>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

/** This function gives the side of the box that is nearest to the point. */
export function nearestSide(box: Box, p: Point): Side {
  const d: [Side, number][] = [
    ["north", Math.abs(p.y - box.y)],
    ["east", Math.abs(box.x + box.w - p.x)],
    ["south", Math.abs(box.y + box.h - p.y)],
    ["west", Math.abs(p.x - box.x)],
  ];
  let best = d[0]!;
  for (const x of d) if (x[1] < best[1]) best = x;
  return best[0];
}

/**
 * This function gives the side that faces `toward`: the side of the larger component of the direction from the center.
 * Thus the angle between the normal of the side and that direction is 45° or less.
 */
export function sideToward(box: Box, toward: Point): Side {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}

/**
 * This function gives the point on a side of the box that is nearest to the line from the center to `toward`.
 * The point stays away from the corners by `inset`, or by a quarter of the side when the side is short.
 */
export function pointOnSide(box: Box, side: Side, toward: Point, inset = 6): Point {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const clamp = (v: number, lo: number, len: number): number => {
    const m = Math.min(inset, len / 4);
    return Math.max(lo + m, Math.min(lo + len - m, v));
  };
  if (side === "east" || side === "west") {
    const x = side === "east" ? box.x + box.w : box.x;
    const y = dx === 0 ? c.y : c.y + (dy * (x - c.x)) / dx;
    return { x, y: clamp(y, box.y, box.h) };
  }
  const y = side === "south" ? box.y + box.h : box.y;
  const x = dy === 0 ? c.x : c.x + (dx * (y - c.y)) / dy;
  return { x: clamp(x, box.x, box.w), y };
}

/**
 * This function places the plug of one end of an edge. A fixed plug stays at its point. A plug with a side stays on that side.
 * The router places a free plug on the side that faces `toward`. A free plug of a port with a `range` stays in that range (`clampToRange`).
 */
export function placePlug(node: Node, end: End, toward: Point): Plug {
  const fixed = fixedPortPoint(node, end);
  const port = end.port === undefined ? undefined : node.ports?.find((p) => p.id === end.port);
  if (fixed) return { point: fixed, normal: SIDE_NORMAL[port?.side ?? nearestSide(node.box, fixed)] };
  const side = port?.side ?? sideToward(node.box, toward);
  const point = pointOnSide(node.box, side, toward);
  return { point: port?.range === undefined ? point : clampToRange(node.box, side, port, point), normal: SIDE_NORMAL[side] };
}
