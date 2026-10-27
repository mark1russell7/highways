import { center, dist, type Point } from "../../geom.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";

/** The options of the highway strategy `wspd` (HWY-018 of the note on highways). */
export interface WspdOptions {
  /** The separation `s` of the pairs: the gap between two sets is at least `s` times the radius of the larger set. The default is 2. */
  readonly separation: number;
  /** A pair with this number of edges or more gets a highway. The default is 3. */
  readonly minSize: number;
  /** The spine of each pair. The default is `trunk`. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `wspd`. */
export const WSPD_DEFAULTS: Readonly<WspdOptions> = Object.freeze({ separation: 2, minSize: 3, spine: "trunk" });

/** A cell of the split tree: the points at the places `lo` to `hi - 1` of the order, with their bounding circle. */
export interface SplitCell {
  readonly id: number;
  readonly lo: number;
  readonly hi: number;
  readonly c: Point;
  readonly r: number;
  readonly kids?: readonly [SplitCell, SplitCell];
}

/**
 * The split tree of a set of points and its well-separated pairs (Callahan and Kosaraju 1995).
 * Each cell splits at the middle of the longer side of its bounding box. A cell of equal points is a leaf.
 */
export class SplitTree {
  readonly root: SplitCell;
  /** The place of each point in the order of the tree. */
  readonly #at: Int32Array;
  #count = 0;

  /** This constructor builds the tree of the points. */
  constructor(points: readonly Point[]) {
    const order = points.map((_, i) => i);
    this.#at = new Int32Array(points.length);
    this.root = this.#build(points, order, 0, points.length);
    order.forEach((p, i) => (this.#at[p] = i));
  }

  #build(points: readonly Point[], order: number[], lo: number, hi: number): SplitCell {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = lo; i < hi; i++) {
      const p = points[order[i]!]!;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    const id = this.#count++;
    const c = center({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    const r = Math.hypot(x1 - x0, y1 - y0) / 2;
    if (hi - lo <= 1 || r <= 1e-9) return { id, lo, hi, c, r };
    const byX = x1 - x0 >= y1 - y0;
    const cut = byX ? (x0 + x1) / 2 : (y0 + y1) / 2;
    const part = order.slice(lo, hi);
    const left = part.filter((i) => (byX ? points[i]!.x : points[i]!.y) <= cut);
    const right = part.filter((i) => (byX ? points[i]!.x : points[i]!.y) > cut);
    [...left, ...right].forEach((p, k) => (order[lo + k] = p));
    const mid = lo + left.length;
    return { id, lo, hi, c, r, kids: [this.#build(points, order, lo, mid), this.#build(points, order, mid, hi)] };
  }

  /** This method tells if the cell holds the point `i`. */
  holds(cell: SplitCell, i: number): boolean {
    const at = this.#at[i]!;
    return at >= cell.lo && at < cell.hi;
  }

  /**
   * This method gives the well-separated pair that holds the pair of points `u` and `v`, with the cell of `u` first.
   * Each pair of two different points is in one pair of the decomposition. Two equal points give `undefined`.
   */
  pairOf(u: number, v: number, s: number): [SplitCell, SplitCell] | undefined {
    let cell = this.root;
    while (cell.kids) {
      const next = cell.kids.find((k) => this.holds(k, u) && this.holds(k, v));
      if (!next) break;
      cell = next;
    }
    if (!cell.kids) return undefined;
    let a = cell.kids.find((k) => this.holds(k, u))!;
    let b = cell.kids.find((k) => this.holds(k, v))!;
    for (;;) {
      const r = Math.max(a.r, b.r);
      if (dist(a.c, b.c) - 2 * r >= s * r) return [a, b];
      if (a.r >= b.r && a.kids) a = a.kids.find((k) => this.holds(k, u))!;
      else if (b.kids) b = b.kids.find((k) => this.holds(k, v))!;
      else if (a.kids) a = a.kids.find((k) => this.holds(k, u))!;
      else return [a, b];
    }
  }
}

/**
 * This function gives the groups of the edges by the well-separated pair of their two nodes (HWY-018).
 * The points are the centers of the boxes. The edges of one pair, in either direction, are one group.
 */
export function wspdGroups(input: HighwayInput, o: Readonly<WspdOptions>): Map<string, EdgeGroup> {
  const nodes = input.graph.nodes;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const tree = new SplitTree(nodes.map((n) => center(n.box)));
  const groups = new Map<string, EdgeGroup>();
  for (const e of input.graph.edges) {
    const u = index.get(e.source.node);
    const v = index.get(e.target.node);
    if (u === undefined || v === undefined || u === v) continue;
    const pair = tree.pairOf(u, v, o.separation);
    if (!pair) continue;
    const [a, b] = pair;
    groups.set(e.id, a.id < b.id ? { key: `w${a.id}:${b.id}`, flip: false } : { key: `w${b.id}:${a.id}`, flip: true });
  }
  return groups;
}

/**
 * This function gives the highways of clustered edge routing with the WSPD (HWY-018, after Bouts and Speckmann 2015).
 * The well-separated pairs split all the pairs of nodes. The edges of one pair with `minSize` edges or more get one highway from one set to the other.
 */
export function wspdPlan(input: HighwayInput, o: Readonly<WspdOptions>): HighwayPlan {
  return groupedPlan(input, wspdGroups(input, o), { spine: o.spine, minSize: o.minSize });
}
