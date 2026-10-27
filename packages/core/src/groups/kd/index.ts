import { center, type Box, type Point } from "../../geom.ts";
import type { Graph, Node } from "../../model.ts";
import type { Section } from "../../sections.ts";

/** The place of the line of a split of the rule `kd`. */
export type KdLine = "median" | "middle" | "slide";

/** The axis of each split of the rule `kd`. */
export type KdAxis = "longer" | "alternate";

/** The options of the grouping rule `kd` (S3 of GRP-R). */
export interface KdOptions {
  /** A section with more nodes splits. The default is 8, as for the quadtree. */
  readonly cap?: number;
  /** The tree stops at this depth. The default is 16. */
  readonly maxDepth?: number;
  /**
   * This value sets the place of the line in the cell. The value `median` puts half of the nodes on each side. The value `middle` cuts the cell in half,
   * and an empty half makes the cell shrink to the other half. The value `slide` cuts the cell in half, and a line with an empty side slides to the nearest node.
   * The default is `slide`.
   */
  readonly line?: KdLine;
  /** The number of children of a section: 2 or 4. With 4, a section splits two times on one level. The default is 4. */
  readonly fanout?: number;
  /** The value `longer` cuts across the longer side of the cell. The value `alternate` cuts across x, then y, then x again. The default is `longer`. */
  readonly axis?: KdAxis;
}

/** The default values of `KdOptions`. */
export const KD_DEFAULTS: Readonly<Required<KdOptions>> = Object.freeze({ cap: 8, maxDepth: 16, line: "slide", fanout: 4, axis: "longer" });

/** One child of a split: the digit of its id, its cell and the indices of its nodes, in the order of the graph. */
export interface SplitPart {
  readonly digit: number;
  readonly cell: Box;
  readonly list: readonly number[];
}

/** A split rule gives the children of a section, or `undefined` when the section cannot split. */
export type SplitRule = (list: readonly number[], cell: Box, depth: number) => readonly SplitPart[] | undefined;

/** This function gives the bounding box of the boxes of the nodes. */
export function nodeBounds(nodes: readonly Node[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  return nodes.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
}

/**
 * This function makes a tree of sections with a split rule. The root cell is the bounding box of the nodes.
 * A section with more than `cap` nodes, above `maxDepth`, gets the children of the rule. A child without nodes does not become a section.
 * The id of a child is the id of its parent and the digit of the child.
 */
export function growSections(nodes: readonly Node[], cap: number, maxDepth: number, rule: SplitRule): Section {
  const limit = Math.max(1, cap);
  const make = (id: string, depth: number, cell: Box, list: readonly number[]): Section => {
    if (list.length > limit && depth < maxDepth) {
      const parts = (rule(list, cell, depth) ?? []).filter((p) => p.list.length > 0);
      if (parts.length > 1) return { id, depth, cell, nodes: list, children: parts.map((p) => make(`${id}${p.digit}`, depth + 1, p.cell, p.list)) };
    }
    return { id, depth, cell, nodes: list, children: [] };
  };
  return make(
    "s",
    0,
    nodeBounds(nodes),
    nodes.map((_, i) => i),
  );
}

/** This function gives the coordinate of a point on an axis: 0 is x, and 1 is y. */
export const coord = (p: Point, axis: 0 | 1): number => (axis === 0 ? p.x : p.y);

/** This function gives the two halves of a cell, cut across the axis at the coordinate `at`. */
export function halves(cell: Box, axis: 0 | 1, at: number): [Box, Box] {
  if (axis === 0) {
    const w = Math.min(cell.w, Math.max(0, at - cell.x));
    return [
      { x: cell.x, y: cell.y, w, h: cell.h },
      { x: cell.x + w, y: cell.y, w: cell.w - w, h: cell.h },
    ];
  }
  const h = Math.min(cell.h, Math.max(0, at - cell.y));
  return [
    { x: cell.x, y: cell.y, w: cell.w, h },
    { x: cell.x, y: cell.y + h, w: cell.w, h: cell.h - h },
  ];
}

/** This function puts each node of the list on its side of a split: `low` tells if a node goes to the first part. Each part keeps the order of the graph. */
export function sides(list: readonly number[], low: (i: number) => boolean): [number[], number[]] {
  const a: number[] = [];
  const b: number[] = [];
  for (const i of list) (low(i) ? a : b).push(i);
  return [a, b];
}

/** This function gives the nodes of the list in the order of their centers on the axis. Two nodes at one coordinate keep the order of the graph. */
export function sortOn(list: readonly number[], centers: readonly Point[], axis: 0 | 1): number[] {
  return [...list].sort((i, j) => coord(centers[i]!, axis) - coord(centers[j]!, axis) || i - j);
}

/** The most times that the rule `middle` shrinks a cell to one half without a split. The quadtree has the same limit (`collapse`). */
const SHRINK = 32;

/** This function splits the list in two on one axis with the line rule. It gives `undefined` when no line of the rule has a node on each side. */
function lineSplit(list: readonly number[], cell: Box, centers: readonly Point[], axis: 0 | 1, line: KdLine): [SplitPart, SplitPart] | undefined {
  const c = (i: number): number => coord(centers[i]!, axis);
  const part = (cells: [Box, Box], [a, b]: [number[], number[]]): [SplitPart, SplitPart] | undefined =>
    a.length > 0 && b.length > 0
      ? [
          { digit: 0, cell: cells[0], list: a },
          { digit: 1, cell: cells[1], list: b },
        ]
      : undefined;
  const lo = axis === 0 ? cell.x : cell.y;
  const size = axis === 0 ? cell.w : cell.h;
  if (line === "median") {
    const order = sortOn(list, centers, axis);
    const k = Math.floor(order.length / 2);
    const rank = new Map(order.map((i, r) => [i, r]));
    const at = (c(order[k - 1]!) + c(order[k]!)) / 2;
    return part(
      halves(cell, axis, at),
      sides(list, (i) => rank.get(i)! < k),
    );
  }
  if (line === "slide") {
    const mid = lo + size / 2;
    let [a, b] = sides(list, (i) => c(i) < mid);
    let at = mid;
    if (a.length === 0) {
      // Each center is at the middle or past it. The line slides to the nearest center, and the nodes at that coordinate go to the first part.
      at = list.reduce((m, i) => Math.min(m, c(i)), Infinity);
      [a, b] = sides(list, (i) => c(i) <= at);
    } else if (b.length === 0) {
      at = list.reduce((m, i) => Math.max(m, c(i)), -Infinity);
      [a, b] = sides(list, (i) => c(i) < at);
    }
    return part(halves(cell, axis, at), [a, b]);
  }
  // The rule `middle`: an empty half makes the cell shrink to the other half, up to `SHRINK` times.
  let box = cell;
  for (let n = 0; n < SHRINK; n++) {
    const blo = axis === 0 ? box.x : box.y;
    const bsize = axis === 0 ? box.w : box.h;
    if (!(bsize > 0)) return undefined;
    const mid = blo + bsize / 2;
    const split = sides(list, (i) => c(i) < mid);
    const cells = halves(box, axis, mid);
    if (split[0].length > 0 && split[1].length > 0) return part(cells, split);
    box = split[0].length > 0 ? cells[0] : cells[1];
  }
  return undefined;
}

/** This function gives the axes of one binary split, in the order to try: the axis of the rule first, then the other axis. */
function axesOf(cell: Box, axis: KdAxis, step: number): [0 | 1, 0 | 1] {
  const first: 0 | 1 = axis === "longer" ? (cell.w >= cell.h ? 0 : 1) : step % 2 === 0 ? 0 : 1;
  return first === 0 ? [0, 1] : [1, 0];
}

/** This function splits the list in two with the line rule. When no line on the first axis has a node on each side, it tries the other axis. */
function binarySplit(list: readonly number[], cell: Box, centers: readonly Point[], o: Readonly<Required<KdOptions>>, step: number): [SplitPart, SplitPart] | undefined {
  for (const axis of axesOf(cell, o.axis, step)) {
    const split = lineSplit(list, cell, centers, axis, o.line);
    if (split) return split;
  }
  return undefined;
}

/**
 * This function makes a split rule of fan-out 4 from a binary split. The binary split cuts the section in two. Then it cuts each half with 2 nodes or more.
 * The digit of a quarter is 2 times the digit of its half plus its own digit. A half that does not split keeps the digit of its first quarter.
 */
export function twoSteps(binary: (list: readonly number[], cell: Box, step: number) => readonly SplitPart[] | undefined, fanout: number): SplitRule {
  return (list, cell, depth) => {
    if (fanout < 4) return binary(list, cell, depth);
    const first = binary(list, cell, 2 * depth);
    if (!first) return undefined;
    return first.flatMap((half) => {
      const second = half.list.length >= 2 ? binary(half.list, half.cell, 2 * depth + 1) : undefined;
      return second ? second.map((q) => ({ ...q, digit: 2 * half.digit + q.digit })) : [{ ...half, digit: 2 * half.digit }];
    });
  };
}

/**
 * This function gives the tree of sections of the grouping rule `kd`: a k-d tree of the plane (S3 of GRP-R).
 * A section with more than `cap` nodes splits in two with a line across one axis. With the fan-out 4, each half splits again on the same level.
 * The cells nest and do not overlap. The line `median` gives halves of equal size.
 */
export function kdGroups(graph: Graph, options: KdOptions = {}): Section {
  const o: Required<KdOptions> = { ...KD_DEFAULTS, ...options };
  const centers = graph.nodes.map((n) => center(n.box));
  const fanout = o.fanout >= 4 ? 4 : 2;
  const binary = (list: readonly number[], cell: Box, step: number): readonly SplitPart[] | undefined => binarySplit(list, cell, centers, o, step);
  return growSections(graph.nodes, o.cap, o.maxDepth, twoSteps(binary, fanout));
}
