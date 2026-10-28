import { portPoint } from "@mark1russell7/layout-contract";
import type { Box, Point } from "./geom.ts";

/** A side of a node box. */
export type Side = "north" | "east" | "south" | "west";

/**
 * A plug of a node: a place where edges go into the node.
 * A plug with `at` is fixed. The router does not move it. A plug with `side` and `along` is fixed too.
 * Another plug is free: the router places it.
 */
export interface Port {
  readonly id: string;
  /** This point is the fixed place of the plug, relative to the top-left corner of the node box. */
  readonly at?: Point;
  /** This side is where a free plug goes. Without it, the router picks the side. */
  readonly side?: Side;
  /**
   * This fraction from 0 to 1 fixes the plug on its `side`. The plug is at the side start plus `along` times the side length.
   * The start of `north` and `south` is the left end. The start of `east` and `west` is the top end.
   * A plug with `along` needs a `side` and has no `at`. `resolvePorts` throws a `RangeError` for a bad value.
   */
  readonly along?: number;
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

/** The names of the sides in `@mark1russell7/layout-contract`. */
const CONTRACT_SIDE = { north: "top", east: "right", south: "bottom", west: "left" } as const;

/**
 * This function gives the place of a fixed plug, relative to the top-left corner of the node box, or `undefined` for a free plug.
 * A plug with `at` gives `at`. A plug with `side` and `along` gives the point of `portPoint` of `@mark1russell7/layout-contract`.
 */
export function portOffset(box: Box, port: Port): Point | undefined {
  if (port.at !== undefined) return port.at;
  if (port.side === undefined || port.along === undefined) return undefined;
  return portPoint(box, { id: port.id, side: CONTRACT_SIDE[port.side], along: port.along });
}

/** This function throws a `RangeError` when the `along` of a plug is bad: not finite, outside 0 to 1, without `side` or with `at`. */
export function checkPort(node: Node, port: Port): void {
  if (port.along === undefined) return;
  const at = `The plug "${port.id}" of the node "${node.id}"`;
  if (typeof port.along !== "number" || !Number.isFinite(port.along) || port.along < 0 || port.along > 1)
    throw new RangeError(`${at} has the along value ${String(port.along)}. It must be a finite number from 0 to 1.`);
  if (port.side === undefined) throw new RangeError(`${at} has an along value and no side. A plug with along needs a side.`);
  if (port.at !== undefined) throw new RangeError(`${at} has an along value and an at point. Give one of the two.`);
}

/**
 * This function checks the plugs of a graph, and gives each plug with `side` and `along` a fixed `at`. The plug keeps its `side`.
 * Each router calls it at the start of `route`, so all routers agree. A graph without `along` comes back as the same object.
 * It throws a `RangeError` for a bad `along` (`checkPort`).
 */
export function resolvePorts(graph: Graph): Graph {
  let found = false;
  for (const n of graph.nodes)
    for (const p of n.ports ?? []) {
      checkPort(n, p);
      if (p.along !== undefined) found = true;
    }
  if (!found) return graph;
  const nodes = graph.nodes.map((n): Node => {
    if (!n.ports?.some((p) => p.along !== undefined)) return n;
    const ports = n.ports.map((p): Port => {
      if (p.along === undefined) return p;
      return { id: p.id, side: p.side!, at: portOffset(n.box, p)! };
    });
    return { ...n, ports };
  });
  return { ...graph, nodes };
}

/** This function gives the absolute place of a fixed plug, or `undefined` for a free plug or no plug. A plug with `side` and `along` is fixed. */
export function fixedPortPoint(node: Node, end: End): Point | undefined {
  if (end.port === undefined) return undefined;
  const p = node.ports?.find((q) => q.id === end.port);
  const at = p === undefined ? undefined : portOffset(node.box, p);
  if (at === undefined) return undefined;
  return { x: node.box.x + at.x, y: node.box.y + at.y };
}
