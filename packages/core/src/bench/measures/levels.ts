import { center, dist } from "../../geom.ts";
import type { Graph, Level } from "../../model.ts";
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
