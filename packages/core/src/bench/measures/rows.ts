/**
 * The measure of the rows of the ports (PLUG-ROW-GAP): R17 tells if the row of each plug has room on its wall.
 */
import type { Point } from "../../geom.ts";
import { portOffset, type Graph, type Node, type Route, type Side } from "../../model.ts";
import { nearestSide } from "../../plugs.ts";
import { alongOf, roomOf } from "../../plugs/walls.ts";

const EPS = 1e-6;

/** The value of R17. */
export interface RowFit {
  /** The share of the rows that fit: each row stays on its wall, and it overlaps no other row or plug. */
  readonly fit: number;
  /** The least distance of two neighbor plugs of one wall, in the mean height of their rows. A wall with one plug gives no value. */
  readonly gap?: number;
}

/** A plug of a wall: its place on the axis along the wall and the height of its row, or 0. */
interface WallPlug {
  readonly at: number;
  readonly row: number;
}

/**
 * This function gives R17 of the routes on a board, or `undefined` for a board without rows.
 * A plug is the first or the last point of a route. All the ends of one port are one plug.
 * A fixed port with a row counts also when no route uses it.
 */
export function rowFit(graph: Graph, routes: readonly Route[]): RowFit | undefined {
  if (!graph.nodes.some((n) => n.ports?.some((p) => (p.rowHeight ?? 0) > 0))) return undefined;
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const walls = new Map<string, { node: Node; side: Side; plugs: Map<string, WallPlug> }>();
  const add = (node: Node, side: Side, key: string, point: Point, row: number): void => {
    const id = JSON.stringify([node.id, side]);
    let wall = walls.get(id);
    if (!wall) walls.set(id, (wall = { node, side, plugs: new Map() }));
    wall.plugs.set(key, { at: point[alongOf(side)], row });
  };
  for (const node of graph.nodes)
    for (const port of node.ports ?? []) {
      const at = portOffset(node.box, port);
      if (at === undefined || !port.rowHeight) continue;
      const point = { x: node.box.x + at.x, y: node.box.y + at.y };
      add(node, port.side ?? nearestSide(node.box, point), `port ${port.id}`, point, port.rowHeight);
    }
  for (const route of routes) {
    const edge = edges.get(route.edge);
    const ends = [
      [edge?.source, route.points[0]],
      [edge?.target, route.points[route.points.length - 1]],
    ] as const;
    ends.forEach(([end, point], i) => {
      const node = end && nodes.get(end.node);
      if (!end || !node || !point) return;
      const port = end.port === undefined ? undefined : node.ports?.find((p) => p.id === end.port);
      add(node, port?.side ?? nearestSide(node.box, point), port ? `port ${port.id}` : `end ${i} ${route.edge}`, point, port?.rowHeight ?? 0);
    });
  }
  let rows = 0;
  let fit = 0;
  let gap = Infinity;
  for (const { node, side, plugs } of walls.values()) {
    const [start, end] = roomOf(node.box, side, 0);
    const list = [...plugs.values()].sort((a, b) => a.at - b.at);
    list.forEach((p, i) => {
      const next = list[i + 1];
      const mean = next ? (p.row + next.row) / 2 : 0;
      if (next && mean > 0) gap = Math.min(gap, (next.at - p.at) / mean);
      if (p.row <= 0) return;
      rows++;
      const inWall = p.at - p.row / 2 >= start - EPS && p.at + p.row / 2 <= end + EPS;
      if (inWall && list.every((q, j) => j === i || Math.abs(q.at - p.at) >= (q.row + p.row) / 2 - EPS)) fit++;
    });
  }
  return { fit: rows > 0 ? fit / rows : 1, ...(gap < Infinity ? { gap } : {}) };
}
