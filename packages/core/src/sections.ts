import { center, type Box } from "./geom.ts";
import type { LevelItem, Node } from "./model.ts";

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
  /** A cell shrinks to one quarter at most this many times without a split. Then it stops. The default is 32. */
  readonly collapse?: number;
}

/** The default values of `SectionOptions`. */
export const SECTION_DEFAULTS: Readonly<Required<SectionOptions>> = Object.freeze({ cap: 8, maxDepth: 16, collapse: 32 });

/**
 * This function makes the tree of sections of the nodes. A cell with more than `cap` nodes splits in four.
 * When the nodes of a cell are all in one quarter, the cell becomes that quarter and does not make a level.
 */
export function buildSections(nodes: readonly Node[], options: SectionOptions = {}): Section {
  const cap = Math.max(1, options.cap ?? SECTION_DEFAULTS.cap);
  const maxDepth = options.maxDepth ?? SECTION_DEFAULTS.maxDepth;
  const collapse = options.collapse ?? SECTION_DEFAULTS.collapse;
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
    for (let guard = 0; list.length > cap && depth < maxDepth && guard < collapse; guard++) {
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

/**
 * This function examines a tree of sections from a grouping rule. It throws an error when the tree is not valid for `count` nodes.
 * In a valid tree, each node is in exactly one leaf. The children of a section split its nodes, and a child is one level deeper than its parent.
 */
export function checkSections(root: Section, count: number): void {
  const seen = new Array<number>(count).fill(0);
  const ids = new Set<string>();
  const fail = (s: Section, what: string): never => {
    throw new Error(`The tree of sections is not valid at the section "${s.id}": ${what}.`);
  };
  if (root.depth !== 0) fail(root, "the root has a depth that is not 0");
  if (root.nodes.length !== count) fail(root, `the root has ${root.nodes.length} nodes, and the graph has ${count}`);
  const walk = (s: Section): void => {
    if (ids.has(s.id)) fail(s, "two sections have this id");
    ids.add(s.id);
    if (s.children.length === 0) {
      for (const i of s.nodes) {
        if (!Number.isInteger(i) || i < 0 || i >= count) fail(s, `the node index ${i} is not in the graph`);
        seen[i]!++;
      }
      return;
    }
    let total = 0;
    const own = new Set(s.nodes);
    for (const c of s.children) {
      if (c.depth !== s.depth + 1) fail(c, "a child is not one level deeper than its parent");
      for (const i of c.nodes) if (!own.has(i)) fail(c, `the node index ${i} is not in the parent`);
      total += c.nodes.length;
      walk(c);
    }
    if (total !== s.nodes.length) fail(s, "the children do not split the nodes of the section");
  };
  walk(root);
  const lost = seen.findIndex((n) => n !== 1);
  if (lost >= 0) fail(root, `the node index ${lost} is in ${seen[lost]} leaves, not in one`);
}

/** The items of one zoom level of a tree of sections, and the item of each node. */
export interface LevelCut {
  /** The items of the level: a section of the depth of the level, or one node of a leaf above that depth. */
  readonly items: LevelItem[];
  /** The index in `items` of the item of each node, in the order of the nodes. */
  readonly owner: readonly number[];
}

/**
 * This function gives the items of the zoom level at `depth`. A section of that depth is one item, with the bounding box of its nodes.
 * A node of a leaf above that depth is an item alone. The items come in the order of the walk of the tree, parents before children.
 * A depth past the depth of the deepest section gives each node alone.
 */
export function levelCut(nodes: readonly Pick<Node, "id" | "box">[], root: Section, depth: number): LevelCut {
  const items: LevelItem[] = [];
  const owner: number[] = [];
  const boxOf = (list: readonly number[]): Box => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const i of list) {
      const b = nodes[i]!.box;
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const visit = (s: Section): void => {
    if (s.depth >= depth) {
      for (const i of s.nodes) owner[i] = items.length;
      items.push({ id: s.id, box: boxOf(s.nodes), nodes: s.nodes.map((i) => nodes[i]!.id) });
    } else if (s.children.length > 0) for (const c of s.children) visit(c);
    else
      for (const i of s.nodes) {
        const n = nodes[i]!;
        owner[i] = items.length;
        items.push({ id: n.id, box: n.box, nodes: [n.id] });
      }
  };
  if (nodes.length > 0) visit(root);
  return { items, owner };
}
