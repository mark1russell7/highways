import { center, type Box, type Point } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import type { Section } from "../../sections.ts";
import { coord, growSections, halves, sides, sortOn, type SplitPart } from "../kd/index.ts";

/** The cost of a line of the rule `cut`, from the cut `c` and the parts `A` and `B` of the split. */
export type CutObjective = "ratio" | "normalized" | "sparsest";

/** The options of the grouping rule `cut` (M1 of GRP-R, the guillotine cut). */
export interface CutOptions {
  /** A section with more nodes splits. The default is 8, as for the quadtree. */
  readonly cap?: number;
  /** The tree stops at this depth. The default is 16. */
  readonly maxDepth?: number;
  /** The number of children of a section: 2 or 4. With 4, a section splits two times on one level. The default is 4. */
  readonly fanout?: number;
  /** The smallest share of the nodes in each part of a split (`β`), from 0.05 to 0.5. The default is 0.25. */
  readonly balance?: number;
  /**
   * The cost of a line. The value `ratio` is `c / min(|A|, |B|)`. The value `normalized` is `c / vol(A) + c / vol(B)`, with `vol` the sum of the degrees
   * inside the section. The value `sparsest` is `c / (|A| · |B|)`. The default is `ratio`.
   */
  readonly objective?: CutObjective;
  /**
   * The cost of a line grows by the factor `1 + pull · d`. The value `d` is the distance of the line from the middle of the cell, as a share of the side.
   * A large value prefers the middle line, as the quadtree does. The default is 0.5.
   */
  readonly pull?: number;
  /**
   * With `true`, each section also tests the split of the quadtree, and keeps the split that cuts fewer edges.
   * Thus no section cuts more edges than the quadtree split of its cell. With the fan-out 2, the test uses each midline of the cell. The default is `true`.
   */
  readonly guard?: boolean;
}

/** The default values of `CutOptions`. */
export const CUT_DEFAULTS: Readonly<Required<CutOptions>> = Object.freeze({ cap: 8, maxDepth: 16, fanout: 4, balance: 0.25, objective: "ratio", pull: 0.5, guard: true });

/** A split with the number of edges between its parts. */
interface CutSplit {
  readonly parts: readonly SplitPart[];
  readonly cut: number;
}

/** The most times that the guard shrinks a cell to one quarter without a split, as `buildSections` does. */
const SHRINK = 32;

/**
 * This function gives the tree of sections of the grouping rule `cut`: a guillotine cut that reads the edges (M1 of GRP-R).
 * A section with more than `cap` nodes splits in two along the line with the lowest cost, on either axis. A line goes between two centers.
 * Each part of a split holds at least the share `balance` of the nodes. With the fan-out 4, each half splits again on the same level.
 *
 * The cells nest and do not overlap. The option `guard` keeps the split of the quadtree when that split cuts fewer edges.
 */
export function cutGroups(graph: Graph, options: CutOptions = {}): Section {
  const o: Required<CutOptions> = { ...CUT_DEFAULTS, ...options };
  const fanout = o.fanout >= 4 ? 4 : 2;
  const balance = Math.min(0.5, Math.max(0, o.balance));
  const pull = Math.max(0, o.pull);
  const nodes = graph.nodes;
  const n = nodes.length;
  const centers: Point[] = nodes.map((v) => center(v.box));
  const cx = Float64Array.from(centers, (c) => c.x);
  const cy = Float64Array.from(centers, (c) => c.y);
  const index = new Map(nodes.map((v, i) => [v.id, i]));
  const adj: number[][] = nodes.map(() => []);
  for (const e of graph.edges) {
    const a = index.get(e.source.node);
    const b = index.get(e.target.node);
    if (a === undefined || b === undefined || a === b) continue;
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  const mark = new Int32Array(n);
  const rank = new Int32Array(n);
  const degree = new Float64Array(n);
  const owner = new Int32Array(n);
  let token = 0;
  // The orders of the nodes of a part on each axis, by the list of the part. A split hands the orders of a section down to its parts, so only the root sorts.
  const orders = new WeakMap<readonly number[], readonly [number[], number[]]>();
  const ordersOf = (list: readonly number[]): readonly [number[], number[]] => {
    let both = orders.get(list);
    if (!both) {
      both = [sortOn(list, centers, 0), sortOn(list, centers, 1)];
      orders.set(list, both);
    }
    return both;
  };
  const handDown = (list: readonly number[], parts: readonly SplitPart[]): void => {
    parts.forEach((p, k) => {
      for (const i of p.list) owner[i] = k;
    });
    const [ox, oy] = ordersOf(list);
    const xs: number[][] = parts.map(() => []);
    const ys: number[][] = parts.map(() => []);
    for (const i of ox) xs[owner[i]!]!.push(i);
    for (const i of oy) ys[owner[i]!]!.push(i);
    parts.forEach((p, k) => orders.set(p.list, [xs[k]!, ys[k]!]));
  };

  /** This function gives the edges with both ends in the list, as a flat list of index pairs. It keeps the pairs of the last list for the guard. */
  let lastList: readonly number[] | undefined;
  let lastPairs: number[] = [];
  const insideEdges = (list: readonly number[]): number[] => {
    if (list === lastList) return lastPairs;
    token++;
    for (const i of list) mark[i] = token;
    const out: number[] = [];
    for (const i of list) for (const j of adj[i]!) if (j > i && mark[j] === token) out.push(i, j);
    lastList = list;
    lastPairs = out;
    return out;
  };

  /** This function gives the number of edges of the list between two parts: `part` gives the part of a node. */
  const cutOf = (list: readonly number[], part: (i: number) => number): number => {
    const pairs = insideEdges(list);
    let cut = 0;
    for (let p = 0; p < pairs.length; p += 2) if (part(pairs[p]!) !== part(pairs[p + 1]!)) cut++;
    return cut;
  };

  /** This function gives the cost of a line. Its inputs are the cut `c`, and the sizes `a`, `b` and the volumes `va`, `vb` of the parts. */
  const objective = (c: number, a: number, b: number, va: number, vb: number): number => {
    if (o.objective === "sparsest") return c / (a * b);
    if (o.objective === "normalized") return (va > 0 ? c / va : 0) + (vb > 0 ? c / vb : 0);
    return c / Math.min(a, b);
  };

  /**
   * This function splits the list in two along the line with the lowest cost. It tests each line between two centers on each axis.
   * When no line keeps the share `balance` in each part, it takes the line with the largest smaller part.
   */
  const guillotine = (list: readonly number[], cell: Box): CutSplit | undefined => {
    const len = list.length;
    if (len < 2) return undefined;
    const pairs = insideEdges(list);
    for (const i of list) degree[i] = 0;
    for (const i of pairs) degree[i]!++;
    let total = 0;
    for (const i of list) total += degree[i]!;
    const minPart = Math.max(1, Math.ceil(balance * len - 1e-9));
    // The best line, and the most even line for a list where no line keeps the balance. An axis of -1 is no line.
    let bestAxis = -1;
    let bestT = 0;
    let bestAt = 0;
    let bestCut = 0;
    let bestCost = Infinity;
    let bestShare = Infinity;
    let fbAxis = -1;
    let fbT = 0;
    let fbAt = 0;
    let fbCut = 0;
    let fbSmall = 0;
    let fbShare = Infinity;
    const both = ordersOf(list);
    for (const axis of [0, 1] as const) {
      const order = both[axis];
      const at0 = axis === 0 ? cx : cy;
      for (let r = 0; r < len; r++) rank[order[r]!] = r;
      const diff = new Int32Array(len + 1);
      for (let p = 0; p < pairs.length; p += 2) {
        const ra = rank[pairs[p]!]!;
        const rb = rank[pairs[p + 1]!]!;
        if (ra < rb) {
          diff[ra + 1]!++;
          diff[rb + 1]!--;
        } else {
          diff[rb + 1]!++;
          diff[ra + 1]!--;
        }
      }
      const side = axis === 0 ? cell.w : cell.h;
      const mid = (axis === 0 ? cell.x : cell.y) + side / 2;
      let cut = 0;
      let va = 0;
      let before = at0[order[0]!]!;
      for (let t = 1; t < len; t++) {
        cut += diff[t]!;
        va += degree[order[t - 1]!]!;
        const after = at0[order[t]!]!;
        const prev = before;
        before = after;
        // A line goes between two centers, so two nodes at one coordinate stay in one part.
        if (!(after > prev)) continue;
        const at = (prev + after) / 2;
        const share = side > 0 ? Math.abs(at - mid) / side : 0;
        const small = t < len - t ? t : len - t;
        if (small < minPart) {
          if (small > fbSmall || (small === fbSmall && share < fbShare)) {
            fbAxis = axis;
            fbT = t;
            fbAt = at;
            fbCut = cut;
            fbSmall = small;
            fbShare = share;
          }
          continue;
        }
        const cost = objective(cut, t, len - t, va, total - va) * (1 + pull * share);
        if (cost < bestCost - 1e-12 || (Math.abs(cost - bestCost) <= 1e-12 && share < bestShare)) {
          bestAxis = axis;
          bestT = t;
          bestAt = at;
          bestCut = cut;
          bestCost = cost;
          bestShare = share;
        }
      }
    }
    const found = bestAxis >= 0;
    const axis = (found ? bestAxis : fbAxis) as 0 | 1 | -1;
    if (axis < 0) return undefined;
    const t = found ? bestT : fbT;
    const order = both[axis as 0 | 1];
    token++;
    for (let r = 0; r < t; r++) mark[order[r]!] = token;
    const [a, b] = sides(list, (i) => mark[i] === token);
    const cells = halves(cell, axis as 0 | 1, found ? bestAt : fbAt);
    const parts: SplitPart[] = [
      { digit: 0, cell: cells[0], list: a },
      { digit: 1, cell: cells[1], list: b },
    ];
    handDown(list, parts);
    return { parts, cut: found ? bestCut : fbCut };
  };

  /** This function gives the guillotine split of a section. With the fan-out 2, it is one cut. With the fan-out 4, it also cuts each half. */
  const split = (list: readonly number[], cell: Box): CutSplit | undefined => {
    const first = guillotine(list, cell);
    if (!first || fanout < 4) return first;
    let cut = first.cut;
    const parts = first.parts.flatMap((half) => {
      const second = guillotine(half.list, half.cell);
      if (!second) return [{ ...half, digit: 2 * half.digit }];
      cut += second.cut;
      return second.parts.map((q) => ({ ...q, digit: 2 * half.digit + q.digit }));
    });
    return { parts, cut };
  };

  /**
   * This function gives the split of the quadtree at the cell, as `buildSections` makes it: four quarters at the middle of the cell.
   * When the nodes are all in one quarter, the cell shrinks to that quarter. With the fan-out 2, it gives the midline of the cell with the lower cut.
   */
  const quadSplit = (list: readonly number[], cell: Box): CutSplit | undefined => {
    if (fanout < 4) {
      let out: CutSplit | undefined;
      for (const axis of [0, 1] as const) {
        const lo = axis === 0 ? cell.x : cell.y;
        const mid = lo + (axis === 0 ? cell.w : cell.h) / 2;
        const [a, b] = sides(list, (i) => coord(centers[i]!, axis) < mid);
        if (a.length === 0 || b.length === 0) continue;
        const cut = cutOf(list, (i) => (coord(centers[i]!, axis) < mid ? 0 : 1));
        const cells = halves(cell, axis, mid);
        if (!out || cut < out.cut)
          out = {
            parts: [
              { digit: 0, cell: cells[0], list: a },
              { digit: 1, cell: cells[1], list: b },
            ],
            cut,
          };
      }
      if (out) handDown(list, out.parts);
      return out;
    }
    let box = cell;
    for (let s = 0; s < SHRINK; s++) {
      const mx = box.x + box.w / 2;
      const my = box.y + box.h / 2;
      const quarterOf = (i: number): number => (centers[i]!.x < mx ? 0 : 1) + (centers[i]!.y < my ? 0 : 2);
      const lists: number[][] = [[], [], [], []];
      for (const i of list) lists[quarterOf(i)]!.push(i);
      const quarter = (q: number): Box => ({ x: q % 2 === 0 ? box.x : mx, y: q < 2 ? box.y : my, w: box.w / 2, h: box.h / 2 });
      const full = lists.map((l, q) => ({ digit: q, cell: quarter(q), list: l })).filter((p) => p.list.length > 0);
      if (full.length > 1) {
        handDown(list, full);
        return { parts: full, cut: cutOf(list, quarterOf) };
      }
      box = full[0]?.cell ?? box;
    }
    return undefined;
  };

  return growSections(nodes, o.cap, o.maxDepth, (list, cell) => {
    const cut = split(list, cell);
    if (!o.guard) return cut?.parts;
    const quad = quadSplit(list, cell);
    return quad && (!cut || quad.cut < cut.cut) ? quad.parts : cut?.parts;
  });
}
