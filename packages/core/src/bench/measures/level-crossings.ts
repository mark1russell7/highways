import { type Box } from "../../geom.ts";
import type { Level, LevelLink, Node } from "../../model.ts";
import { Obstacles } from "../../visibility.ts";
import { boxesOverlap } from "../links.ts";

/** The free regions of a level. Each free cell of the table has a label, and blocked cells have -1. */
export interface FreeSpace {
  /** This function gives the labels of the free cells that touch the box along a side. */
  around(box: Box): ReadonlySet<number>;
}

/**
 * This function gives the free regions of the plane outside `boxes`. The table uses the edges of the boxes as its lines, so the regions are exact.
 * Two boxes that touch close the gap between them, and two boxes that meet only at a corner close it too.
 */
export function freeSpace(boxes: readonly Box[]): FreeSpace {
  const lines = (a: number[]): number[] => [...new Set(a)].sort((p, q) => p - q);
  const edgesX = boxes.flatMap((b) => [b.x, b.x + b.w]);
  const edgesY = boxes.flatMap((b) => [b.y, b.y + b.h]);
  const xs = lines([...edgesX, Math.min(0, ...edgesX) - 1, Math.max(0, ...edgesX) + 1]);
  const ys = lines([...edgesY, Math.min(0, ...edgesY) - 1, Math.max(0, ...edgesY) + 1]);
  const indexX = new Map(xs.map((x, i) => [x, i] as const));
  const indexY = new Map(ys.map((y, i) => [y, i] as const));
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const span = (cols + 1) * (rows + 1);
  const cover = new Int32Array(span);
  for (const b of boxes) {
    const i0 = indexX.get(b.x)!;
    const i1 = indexX.get(b.x + b.w)!;
    const j0 = indexY.get(b.y)!;
    const j1 = indexY.get(b.y + b.h)!;
    cover[j0 * (cols + 1) + i0]!++;
    cover[j0 * (cols + 1) + i1]!--;
    cover[j1 * (cols + 1) + i0]!--;
    cover[j1 * (cols + 1) + i1]!++;
  }
  for (let j = 0; j <= rows; j++) for (let i = 1; i <= cols; i++) cover[j * (cols + 1) + i]! += cover[j * (cols + 1) + i - 1]!;
  for (let i = 0; i <= cols; i++) for (let j = 1; j <= rows; j++) cover[j * (cols + 1) + i]! += cover[(j - 1) * (cols + 1) + i]!;
  const label = new Int32Array(cols * rows).fill(-2);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (cover[j * (cols + 1) + i]! > 0) label[j * cols + i] = -1;
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < label.length; start++) {
    if (label[start] !== -2) continue;
    label[start] = next;
    stack.push(start);
    while (stack.length > 0) {
      const c = stack.pop()!;
      const i = c % cols;
      const near = [i > 0 ? c - 1 : -1, i < cols - 1 ? c + 1 : -1, c >= cols ? c - cols : -1, c + cols < label.length ? c + cols : -1];
      for (const n of near)
        if (n >= 0 && label[n] === -2) {
          label[n] = next;
          stack.push(n);
        }
    }
    next++;
  }
  return {
    around(box: Box): ReadonlySet<number> {
      const out = new Set<number>();
      const i0 = indexX.get(box.x)!;
      const i1 = indexX.get(box.x + box.w)!;
      const j0 = indexY.get(box.y)!;
      const j1 = indexY.get(box.y + box.h)!;
      const add = (i: number, j: number): void => {
        const l = label[j * cols + i]!;
        if (l >= 0) out.add(l);
      };
      for (let j = j0; j < j1; j++) {
        add(i0 - 1, j);
        add(i1, j);
      }
      for (let i = i0; i < i1; i++) {
        add(i, j0 - 1);
        add(i, j1);
      }
      return out;
    },
  };
}

/** One level link that goes through at least one box of an item of its level. */
export interface CrossedLink {
  readonly link: LevelLink;
  /** The items that the link goes through. The two end items do not count. */
  readonly items: readonly string[];
  /** The count of the crossed items with one node. */
  readonly single: number;
  /** The count of the crossed items whose box overlaps a box of an end item. */
  readonly overlapEnd: number;
  /** The way between the end items: `ends-overlap` when their boxes overlap, `clear` when a free region touches both, else `none`. */
  readonly way: "ends-overlap" | "clear" | "none";
  /** This value is true when a free region of the nodes of the board touches a node of each end item. The value is undefined with no `board`. */
  readonly boardWay?: boolean;
}

/** The crossings of one level. */
export interface LevelCrossings {
  readonly links: number;
  /** The crossed links, in the order of the links of the level. */
  readonly crossed: readonly CrossedLink[];
  /** The count of crossed items of each link, in the order of the links of the level. */
  readonly perLink: readonly number[];
  /** The count of the pairs of items of the level whose boxes overlap. */
  readonly overlaps: number;
}

/**
 * This function measures the crossings of a level. It uses `Obstacles.through`, the test of the rule that a link stays out of the boxes.
 * Only a crossed link with the way `clear` is a link that the router could draw with no crossing.
 * With `board`, the function also tests the same way on the nodes of the board. So a way that only the boxes of the level close is visible.
 */
export function levelCrossings(level: Level, board?: readonly Node[]): LevelCrossings {
  const nodes: Node[] = level.items.map((i) => ({ id: i.id, box: i.box }));
  const count = new Map(level.items.map((i) => [i.id, i.nodes.length] as const));
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const boxOf = new Map(board?.map((n) => [n.id, n.box] as const));
  const members = new Map(level.items.map((i) => [i.id, i.nodes] as const));
  let boardFree: FreeSpace | undefined;
  /** This function gives the labels of the free regions around the nodes of an end item. */
  const aroundItem = (id: string, free: FreeSpace): Set<number> => {
    const out = new Set<number>();
    for (const n of members.get(id) ?? []) {
      const box = boxOf.get(n);
      if (box) for (const l of free.around(box)) out.add(l);
    }
    return out;
  };
  let size = 0;
  for (const n of nodes) size += Math.max(n.box.w, n.box.h);
  const obstacles = new Obstacles(nodes, Math.max(180, (2 * size) / Math.max(1, nodes.length)));
  let free: FreeSpace | undefined;
  const crossed: CrossedLink[] = [];
  const perLink = level.links.map((link) => {
    const s = byId.get(link.source);
    const t = byId.get(link.target);
    const hit = new Set<Node>();
    for (let i = 1; i < link.points.length; i++)
      obstacles.through(link.points[i - 1]!, link.points[i]!, (n) => {
        if (n !== s && n !== t) hit.add(n);
      });
    if (hit.size === 0) return 0;
    let single = 0;
    let overlapEnd = 0;
    for (const n of hit) {
      if (count.get(n.id) === 1) single++;
      if ((s && boxesOverlap(s.box, n.box)) || (t && boxesOverlap(t.box, n.box))) overlapEnd++;
    }
    free ??= freeSpace(nodes.map((n) => n.box));
    let way: CrossedLink["way"] = "none";
    if (s && t) {
      if (boxesOverlap(s.box, t.box)) way = "ends-overlap";
      else {
        const near = free.around(s.box);
        for (const l of free.around(t.box)) if (near.has(l)) way = "clear";
      }
    }
    let boardWay: boolean | undefined;
    if (board) {
      boardFree ??= freeSpace(board.map((n) => n.box));
      const near = aroundItem(link.source, boardFree);
      boardWay = [...aroundItem(link.target, boardFree)].some((l) => near.has(l));
    }
    crossed.push({ link, items: [...hit].map((n) => n.id), single, overlapEnd, way, ...(boardWay === undefined ? {} : { boardWay }) });
    return hit.size;
  });
  let overlaps = 0;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (boxesOverlap(nodes[i]!.box, nodes[j]!.box)) overlaps++;
  return { links: level.links.length, crossed, perLink, overlaps };
}
