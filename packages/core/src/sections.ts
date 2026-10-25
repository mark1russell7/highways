import { center, type Box } from "./geom.ts";
import type { Node } from "./model.ts";

/** A section of the plane: a cell of a quadtree, with the nodes whose centers are in it. */
export interface Section {
  /** The path from the root: "s", then one digit from 0 to 3 for each step down. */
  readonly id: string;
  readonly depth: number;
  readonly cell: Box;
  /** The indices of the nodes, in the order of the graph. */
  readonly nodes: readonly number[];
  readonly children: readonly Section[];
}

/** The options of the tree of sections. */
export interface SectionOptions {
  /** A section with more nodes splits. The default is 8. */
  readonly cap?: number;
  /** The tree stops at this depth. The default is 16. */
  readonly maxDepth?: number;
}

/**
 * This function makes the tree of sections of the nodes. A cell with more than `cap` nodes splits in four.
 * When the nodes of a cell are all in one quarter, the cell becomes that quarter and does not make a level.
 */
export function buildSections(nodes: readonly Node[], options: SectionOptions = {}): Section {
  const cap = Math.max(1, options.cap ?? 8);
  const maxDepth = options.maxDepth ?? 16;
  const centers = nodes.map((n) => center(n.box));
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
  const root: Box = nodes.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 };
  const make = (id: string, depth: number, cell: Box, list: readonly number[]): Section => {
    let box = cell;
    for (let guard = 0; list.length > cap && depth < maxDepth && guard < 32; guard++) {
      const mx = box.x + box.w / 2;
      const my = box.y + box.h / 2;
      const parts: number[][] = [[], [], [], []];
      for (const i of list) parts[(centers[i]!.x < mx ? 0 : 1) + (centers[i]!.y < my ? 0 : 2)]!.push(i);
      const quarter = (q: number): Box => ({
        x: q % 2 === 0 ? box.x : mx,
        y: q < 2 ? box.y : my,
        w: box.w / 2,
        h: box.h / 2,
      });
      const full = parts.map((p, q) => [p, q] as const).filter(([p]) => p.length > 0);
      if (full.length === 1) {
        box = quarter(full[0]![1]);
        continue;
      }
      const children = full.map(([p, q]) => make(`${id}${q}`, depth + 1, quarter(q), p));
      return { id, depth, cell: box, nodes: list, children };
    }
    return { id, depth, cell: box, nodes: list, children: [] };
  };
  return make("s", 0, root, nodes.map((_, i) => i));
}

/** This function gives the sections of the tree, parents before children. */
export function allSections(root: Section): Section[] {
  const out: Section[] = [];
  const walk = (s: Section): void => {
    out.push(s);
    for (const c of s.children) walk(c);
  };
  walk(root);
  return out;
}

/** This function gives the depth of the deepest section. */
export function treeDepth(root: Section): number {
  return root.children.reduce((d, c) => Math.max(d, treeDepth(c)), root.depth);
}
