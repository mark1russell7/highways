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
  /** This data is free for the grouping rules of the nodes. The rule `keys` reads the string `data.group` by default. */
  readonly data?: Readonly<Record<string, unknown>>;
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
  readonly bundles?: readonly Bundle[];
  /** The stretches of way that several routes share, if the router gives them. */
  readonly runs?: readonly SharedRun[];
}

/**
 * A bundle: edges from one node that share one plug and one trunk. Then the edges fan out to their targets.
 * A renderer draws a bundle as one fat edge with a count, or as one lane for each edge.
 */
export interface Bundle {
  readonly id: string;
  /** The key that the grouping rule gave each edge of the bundle. */
  readonly key: string;
  /** The node where the edges share their plug. */
  readonly node: string;
  /** The edges in lane order. Lane 0 turns most to the left of the trunk, in a frame with the y axis down. */
  readonly edges: readonly string[];
  /** The shared start of each route of the bundle, from the plug to the split point. */
  readonly trunk: readonly Point[];
}

/**
 * A stretch of way that several routes share, with the same points. Each route of `edges` has `points` in it,
 * in this order or in the reverse order. A renderer draws a run as one fat line, or as one lane for each edge.
 */
export interface SharedRun {
  readonly id: string;
  /** The key of the grouping rule of the edges. */
  readonly key: string;
  readonly points: readonly Point[];
  /** The edges in lane order. Lane 0 is on the left of the run, from its first point to its last. The y axis points down. */
  readonly edges: readonly string[];
}

/** A grouping rule gives each edge a key. The edges from one plug with one key make a bundle. An edge without a key stays alone. */
export type GroupRule = (edge: Edge) => string | undefined;

/** A router: a strategy with a name. The same input must give the same result. */
export interface Router {
  readonly name: string;
  /** The benchmark skips a fixture with more nodes than this. Without it, the router takes each fixture. */
  readonly maxNodes?: number;
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
