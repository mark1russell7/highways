import { dist, inflate, pointSegmentDistance, polylineLength, segmentHitsBox, type Box, type Point } from "../geom.ts";
import { Grid } from "../grid.ts";
import type { Graph, Level, Result } from "../model.ts";
import { TOLERANCE } from "./properties.ts";

/**
 * The faults of a set of links: the routes of the edges, or the links of one zoom level.
 * Each value counts links, except `worstDetour`. Lower is better for each value.
 */
export interface LinkFaults {
  /** The number of links that the measure examined. */
  readonly links: number;
  /**
   * The number of links that go through the inside of a box that is not one of their two ends.
   * A segment goes through a box when a part of it longer than `TOLERANCE` is inside the box made smaller by `TOLERANCE`.
   */
  readonly through: number;
  /**
   * The number of links that go out and back. The distance from a point of the link to its last point grows after the nearest approach.
   * A link goes out and back when this growth is more than `BACKTRACK_SHARE` of the distance between its ends, and more than `BACKTRACK_MIN` units.
   */
  readonly backtrack: number;
  /** The largest ratio of the length of a link to the distance between its ends. Links with ends nearer than 1 unit do not count. */
  readonly worstDetour: number;
  /**
   * The number of links with a point outside the bounding box of all the boxes, made larger by `slack`.
   * Both ends of a link are always in that bounding box, so such a link goes around the outer edge of the board.
   */
  readonly outside: number;
}

/** The faults of the links of one zoom level. */
export interface LevelFaults extends LinkFaults {
  readonly depth: number;
  /** The number of items of the level. */
  readonly items: number;
  /** The number of items that hold more than one node. */
  readonly groups: number;
  /** The number of pairs of items whose boxes overlap by more than `TOLERANCE` on each axis. */
  readonly overlaps: number;
}

/** The options of the link measures. */
export interface LinkFaultOptions {
  /** A link that goes farther than this distance outside the bounding box of all the boxes counts in `outside`. The default is 24. */
  readonly slack?: number;
}

/** A link goes out and back when its distance to its target grows by more than this share of the distance between its ends. */
export const BACKTRACK_SHARE = 0.25;
/** A link goes out and back only when its distance to its target grows by more than this number of units. */
export const BACKTRACK_MIN = 40;
/** The default `slack` of `LinkFaultOptions`. */
export const OUTSIDE_SLACK = 24;

/** A link from one box to another box, as `measureLinks` sees it. */
export interface MeasuredLink {
  readonly source: string;
  readonly target: string;
  readonly points: readonly Point[];
}

/**
 * This function gives the largest growth of the distance to the last point of a polyline.
 * The growth at a vertex is its distance to the last point, less the nearest approach of the polyline before that vertex.
 */
export function backtrackOf(p: readonly Point[]): number {
  if (p.length < 3) return 0;
  const end = p[p.length - 1]!;
  let near = dist(p[0]!, end);
  let worst = 0;
  for (let i = 1; i < p.length; i++) {
    worst = Math.max(worst, dist(p[i]!, end) - near);
    near = Math.min(near, pointSegmentDistance(end, p[i - 1]!, p[i]!));
  }
  return worst;
}

/** This function tells if the polyline `p` goes out and back: `backtrackOf(p)` is more than `BACKTRACK_MIN` and more than `BACKTRACK_SHARE` of the span. */
export function goesOutAndBack(p: readonly Point[]): boolean {
  if (p.length < 3) return false;
  const span = dist(p[0]!, p[p.length - 1]!);
  return backtrackOf(p) > Math.max(BACKTRACK_MIN, BACKTRACK_SHARE * span);
}

/**
 * This function measures the faults of links between boxes. The map `boxes` gives the box of each end.
 * The bounding box of `outside` is the bounding box of all the boxes of the map.
 */
export function measureLinks(boxes: ReadonlyMap<string, Box>, links: readonly MeasuredLink[], options: LinkFaultOptions = {}): LinkFaults {
  const slack = options.slack ?? OUTSIDE_SLACK;
  let size = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes.values()) {
    size += Math.max(b.w, b.h);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  // Large items cover many buckets of a small grid, so the buckets grow with the items.
  const grid = new Grid<string>(Math.max(180, (2 * size) / Math.max(1, boxes.size)));
  for (const [id, b] of boxes) grid.add(id, b);
  let through = 0;
  let backtrack = 0;
  let worstDetour = 0;
  let outside = 0;
  for (const l of links) {
    const p = l.points;
    if (p.length === 0) continue;
    let hit = false;
    for (let i = 1; i < p.length && !hit; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      grid.querySegment(a, b, 0, (id) => {
        if (!hit && id !== l.source && id !== l.target && segmentHitsBox(a, b, inflate(boxes.get(id)!, -TOLERANCE), TOLERANCE)) hit = true;
      });
    }
    if (hit) through++;
    if (goesOutAndBack(p)) backtrack++;
    const span = dist(p[0]!, p[p.length - 1]!);
    if (span > 1) worstDetour = Math.max(worstDetour, polylineLength(p) / span);
    if (p.some((q) => q.x < x0 - slack || q.x > x1 + slack || q.y < y0 - slack || q.y > y1 + slack)) outside++;
  }
  return { links: links.length, through, backtrack, worstDetour, outside };
}

/** This function measures the faults of the routes of a result. The ends of a route are the nodes of its edge. */
export function measureRouteFaults(graph: Graph, result: Result, options: LinkFaultOptions = {}): LinkFaults {
  const boxes = new Map(graph.nodes.map((n) => [n.id, n.box]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const links: MeasuredLink[] = [];
  for (const r of result.routes) {
    const e = edges.get(r.edge);
    if (e) links.push({ source: e.source.node, target: e.target.node, points: r.points });
  }
  return measureLinks(boxes, links, options);
}

/** This function counts the pairs of boxes that overlap by more than `TOLERANCE` on each axis. */
export function countOverlaps(boxes: readonly Box[]): number {
  let size = 0;
  for (const b of boxes) size += Math.max(b.w, b.h);
  const grid = new Grid<number>(Math.max(180, (2 * size) / Math.max(1, boxes.length)));
  boxes.forEach((b, i) => grid.add(i, b));
  let n = 0;
  boxes.forEach((a, i) => {
    grid.query(a, (j) => {
      const b = boxes[j]!;
      if (j > i && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > TOLERANCE && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > TOLERANCE) n++;
    });
  });
  return n;
}

/** This function measures the faults of the links of one zoom level. The items of the level are the boxes. */
export function measureLevel(level: Level, options: LinkFaultOptions = {}): LevelFaults {
  const boxes = new Map(level.items.map((i) => [i.id, i.box]));
  return {
    depth: level.depth,
    items: level.items.length,
    groups: level.items.filter((i) => i.nodes.length > 1).length,
    overlaps: countOverlaps(level.items.map((i) => i.box)),
    ...measureLinks(boxes, level.links, options),
  };
}

/**
 * This function measures the faults of each zoom level of a result that has groups: the levels of the far view.
 * A level of single nodes only is the near view. Its links are routes, and `measureRouteFaults` measures them.
 */
export function measureLevelFaults(result: Result, options: LinkFaultOptions = {}): LevelFaults[] {
  return (result.levels ?? []).filter((l) => l.items.some((i) => i.nodes.length > 1)).map((l) => measureLevel(l, options));
}

/** This function adds the faults of several levels: it sums the counts and keeps the largest `worstDetour`. */
export function sumFaults(list: readonly LinkFaults[]): LinkFaults {
  return list.reduce<LinkFaults>(
    (s, f) => ({
      links: s.links + f.links,
      through: s.through + f.through,
      backtrack: s.backtrack + f.backtrack,
      worstDetour: Math.max(s.worstDetour, f.worstDetour),
      outside: s.outside + f.outside,
    }),
    { links: 0, through: 0, backtrack: 0, worstDetour: 0, outside: 0 },
  );
}
