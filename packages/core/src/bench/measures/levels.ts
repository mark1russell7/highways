import { center, dist, pointBoxDistance, polylineLength, type Box, type Point } from "../../geom.ts";
import type { Graph, Level, Route } from "../../model.ts";
import { kendallTau } from "./stats.ts";

/** This function gives the levels in the order of their depth, from the far view to the near view. */
function byDepth(levels: readonly Level[]): Level[] {
  return [...levels].sort((a, b) => a.depth - b.depth);
}

/** This function gives a map from the id of each node to the index of its item in the level. */
function itemIndex(level: Level): Map<string, number> {
  const m = new Map<string, number>();
  level.items.forEach((item, i) => {
    for (const n of item.nodes) m.set(n, i);
  });
  return m;
}

/**
 * This function counts the faults of the nesting of the levels (Z6 of MEAS0, the proposed rule `level-nesting`).
 * It counts the items of each level whose nodes are in more than one item of the level before it. Lower is better, and 0 is correct.
 * The cost is linear.
 */
export function nestingFaults(levels: readonly Level[]): number {
  const list = byDepth(levels);
  let faults = 0;
  for (let d = 1; d < list.length; d++) {
    const coarse = itemIndex(list[d - 1]!);
    for (const item of list[d]!.items) {
      const parents = new Set<number | undefined>(item.nodes.map((n) => coarse.get(n)));
      if (parents.size > 1) faults++;
    }
  }
  return faults;
}

/**
 * This function measures the position stability of the levels (Z7 of MEAS0).
 * `ps = mean_(v,d) dist(center(item_d(v)), center(item_(d+1)(v))) / size(item_d(v))`, with `size` the longer side of the box.
 * The value has no unit, and lower is better. A result with one level gives 0. The cost is linear.
 */
export function positionStability(levels: readonly Level[]): number {
  const list = byDepth(levels);
  let sum = 0;
  let n = 0;
  for (let d = 0; d + 1 < list.length; d++) {
    const a = list[d]!;
    const fine = itemIndex(list[d + 1]!);
    const items = list[d + 1]!.items;
    for (const item of a.items) {
      const size = Math.max(item.box.w, item.box.h);
      if (size <= 0) continue;
      const c = center(item.box);
      for (const v of item.nodes) {
        const j = fine.get(v);
        if (j === undefined) continue;
        sum += dist(c, center(items[j]!.box)) / size;
        n++;
      }
    }
  }
  return n ? sum / n : 0;
}

/**
 * This function measures the order stability of the levels with groups (Z8 of MEAS0).
 * For each level, `τ_x` and `τ_y` are the Kendall tau between the item centers and the centroids of their nodes on each axis.
 * The value is the mean of `(τ_x + τ_y) / 2` over the levels with groups and two items or more. The scale is -1 to 1, and higher is better.
 * A result without such a level gives 1. The cost is `n log n`, with a sample above 1500 items.
 */
export function orderStability(graph: Graph, levels: readonly Level[]): number {
  const centers = new Map(graph.nodes.map((n) => [n.id, center(n.box)] as const));
  let sum = 0;
  let n = 0;
  for (const level of levels) {
    if (level.items.length < 2 || !level.items.some((i) => i.nodes.length > 1)) continue;
    const ix: number[] = [];
    const iy: number[] = [];
    const nx: number[] = [];
    const ny: number[] = [];
    for (const item of level.items) {
      let x = 0;
      let y = 0;
      let k = 0;
      for (const v of item.nodes) {
        const c = centers.get(v);
        if (!c) continue;
        x += c.x;
        y += c.y;
        k++;
      }
      if (k === 0) continue;
      const c = center(item.box);
      ix.push(c.x);
      iy.push(c.y);
      nx.push(x / k);
      ny.push(y / k);
    }
    sum += (kendallTau(ix, nx, level.depth + 1) + kendallTau(iy, ny, level.depth + 1)) / 2;
    n++;
  }
  return n ? sum / n : 1;
}

/** This function gives the points of a polyline at most `step` apart: each vertex, and evenly spaced points on each longer segment. */
function samplePolyline(p: readonly Point[], step: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < p.length; i++) {
    const b = p[i]!;
    if (i > 0) {
      const a = p[i - 1]!;
      const n = Math.ceil(dist(a, b) / step);
      for (let k = 1; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    out.push(b);
  }
  return out;
}

/** This function gives the Hausdorff distance between two sets of points. Both sets have one point or more. */
function hausdorff(a: readonly Point[], b: readonly Point[]): number {
  const directed = (p: readonly Point[], q: readonly Point[]): number => {
    let worst = 0;
    for (const x of p) {
      let best = Number.POSITIVE_INFINITY;
      for (const y of q) best = Math.min(best, dist(x, y));
      worst = Math.max(worst, best);
    }
    return worst;
  };
  return Math.max(directed(a, b), directed(b, a));
}

/** The number of points of the sample of one polyline for the link agreement, at most. */
const AGREEMENT_SAMPLES = 64;

/**
 * This function gives the link agreement of the levels with groups (Z9 of MEAS0).
 * `la = mean over links of hausdorff(link, routes of its edges outside the two items) / u`, with `u` the argument `unit`.
 * The edges of a link are the edges between a node of one item and a node of the other item, in either direction.
 *
 * The function samples each polyline at points `u / 4` apart, with at most 64 points for each polyline. It keeps the points outside the boxes of the two items.
 * A link without such points on both sides does not count. It gives `undefined` when no link counts.
 * The value has no unit, and lower is better. The cost is quadratic in the points of each link.
 */
export function linkAgreement(graph: Graph, levels: readonly Level[], routes: readonly Route[], unit: number): number | undefined {
  const u = unit > 0 ? unit : 1;
  const endsOf = new Map(graph.edges.map((e) => [e.id, [e.source.node, e.target.node] as const]));
  const sample = (p: readonly Point[], boxes: readonly Box[]): Point[] => {
    const step = Math.max(u / 4, polylineLength(p) / AGREEMENT_SAMPLES);
    return samplePolyline(p, step).filter((q) => boxes.every((b) => pointBoxDistance(q, b) > 0));
  };
  let sum = 0;
  let n = 0;
  for (const level of levels) {
    if (!level.items.some((i) => i.nodes.length > 1)) continue;
    const itemOf = itemIndex(level);
    const indexOf = new Map(level.items.map((it, i) => [it.id, i] as const));
    // The edges between each pair of items, by the key of the pair.
    const between = new Map<string, Route[]>();
    for (const r of routes) {
      const ends = endsOf.get(r.edge);
      if (!ends) continue;
      const i = itemOf.get(ends[0]);
      const j = itemOf.get(ends[1]);
      if (i === undefined || j === undefined || i === j) continue;
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      const list = between.get(key);
      if (list) list.push(r);
      else between.set(key, [r]);
    }
    for (const link of level.links) {
      const i = indexOf.get(link.source);
      const j = indexOf.get(link.target);
      if (i === undefined || j === undefined || i === j) continue;
      const mine = between.get(i < j ? `${i},${j}` : `${j},${i}`);
      if (!mine) continue;
      const boxes = [level.items[i]!.box, level.items[j]!.box];
      const a = sample(link.points, boxes);
      const b = mine.flatMap((r) => sample(r.points, boxes));
      if (a.length === 0 || b.length === 0) continue;
      sum += hausdorff(a, b) / u;
      n++;
    }
  }
  return n > 0 ? sum / n : undefined;
}
