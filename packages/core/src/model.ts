import type { Box, Point } from "./geom.ts";

/** A side of a node box. */
export type Side = "north" | "east" | "south" | "west";

/**
 * A plug of a node: a place where edges go into the node.
 * A plug with `at` is fixed. The router does not move it. A plug without `at` is free: the router places it.
 */
export interface Port {
  readonly id: string;
  /** This point is the fixed place of the plug, relative to the top-left corner of the node box. */
  readonly at?: Point;
  /** This side is where a free plug goes. Without it, the router picks the side. */
  readonly side?: Side;
}

/** A node: a box that routes must not go through. */
export interface Node {
  readonly id: string;
  readonly box: Box;
  readonly ports?: readonly Port[];
}

/** One end of an edge: a node, and optionally one plug of that node. */
export interface End {
  readonly node: string;
  readonly port?: string;
}

/** An edge between two nodes. `data` is free for the grouping rules. */
export interface Edge {
  readonly id: string;
  readonly source: End;
  readonly target: End;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** The input of a router. */
export interface Graph {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}

/** The route of one edge: a polyline from the source plug to the target plug, in absolute coordinates. */
export interface Route {
  readonly edge: string;
  readonly points: readonly Point[];
}

/**
 * One zoom level of a result. Each shown item is a node or a group of nodes.
 * Each link joins two shown items and carries the count of the edges that it stands for.
 */
export interface Level {
  readonly depth: number;
  readonly items: readonly LevelItem[];
  readonly links: readonly LevelLink[];
}

/** A shown item of a level: one node, or a group that stands for its nodes. */
export interface LevelItem {
  readonly id: string;
  readonly box: Box;
  readonly nodes: readonly string[];
}

/** A link of a level: the edges between two shown items, drawn as one path. */
export interface LevelLink {
  readonly source: string;
  readonly target: string;
  readonly count: number;
  readonly points: readonly Point[];
}

/** The output of a router. `levels` is present when the router makes zoom levels. */
export interface Result {
  readonly routes: readonly Route[];
  readonly levels?: readonly Level[];
}

/** A router: a strategy with a name. The same input must give the same result. */
export interface Router {
  readonly name: string;
  route(graph: Graph): Result;
}

/** This function gives a map from the id of each node to the node. */
export function nodeIndex(g: Graph): Map<string, Node> {
  const m = new Map<string, Node>();
  for (const n of g.nodes) m.set(n.id, n);
  return m;
}

/** This function gives the absolute place of a fixed plug, or `undefined` for a free plug or no plug. */
export function fixedPortPoint(node: Node, end: End): Point | undefined {
  if (end.port === undefined) return undefined;
  const p = node.ports?.find((q) => q.id === end.port);
  if (p?.at === undefined) return undefined;
  return { x: node.box.x + p.at.x, y: node.box.y + p.at.y };
}
