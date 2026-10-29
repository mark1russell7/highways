import { dist, polylineLength, type Point } from "../../geom.ts";
import { WayFinder } from "../../ways.ts";
import { firstRoutes } from "../base.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";
import { rootOf } from "../knee/root.ts";

/** The rule that splits the targets of a tip in two: by count, by weight, or at the widest gap of the angles. */
export type BronchialSplit = "count" | "weight" | "gap";

/** The values of `BronchialSplit`. */
export const BRONCHIAL_SPLITS: readonly BronchialSplit[] = Object.freeze(["count", "weight", "gap"]);

/** The options of the highway strategy `bronchial` (NAT-019 of the nature notes). */
export interface BronchialOptions {
  /**
   * The rule of the split. With `count`, each half gets half of the targets. With `weight`, the two halves get near-equal sums of the distances from the tip.
   * With `gap`, the cut goes at the widest gap between the angles of the targets. The default is `count`.
   */
  readonly split: BronchialSplit;
  /** The share of the distance to the center of the targets that a branch grows, from 0.3 to 0.7. The default is 0.5. */
  readonly share: number;
  /** A set with this number of targets or fewer stops the splits, from 1 to 3. Each of its targets gets its own way from the tip. The default is 1. */
  readonly smallest: number;
  /** An edge rides the tree only when its path in the tree is this many times its first route or less. The default is 1.5. */
  readonly detour: number;
  /** A stretch of a tree with fewer edges than this number is not a highway. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `bronchial`. */
export const BRONCHIAL_DEFAULTS: Readonly<BronchialOptions> = Object.freeze({ split: "count", share: 0.5, smallest: 1, detour: 1.5, minSize: 2 });

/**
 * This function gives the diamond angle of the direction `(dx, dy)`: a value from 0 to 4 that grows with the angle, with no trigonometry.
 * The value 0 is the direction of the positive x axis.
 */
export function diamondAngle(dx: number, dy: number): number {
  const s = Math.abs(dx) + Math.abs(dy);
  if (s <= 1e-12) return 0;
  if (dy >= 0) return dx >= 0 ? dy / s : 1 - dx / s;
  return dx < 0 ? 2 - dy / s : 3 + dx / s;
}

/**
 * This function splits the targets of a tip in two halves (NAT-019). The targets go in the order of their angles around the tip.
 * The order starts after the widest gap of the angles, so each half is a sector. The rule of `split` then cuts the order in two.
 */
export function splitTargets(tip: Point, targets: readonly Point[], ids: readonly number[], split: BronchialSplit): [number[], number[]] {
  const sorted = [...ids].sort((a, b) => diamondAngle(targets[a]!.x - tip.x, targets[a]!.y - tip.y) - diamondAngle(targets[b]!.x - tip.x, targets[b]!.y - tip.y) || a - b);
  const angle = (i: number): number => diamondAngle(targets[sorted[i]!]!.x - tip.x, targets[sorted[i]!]!.y - tip.y);
  const n = sorted.length;
  // The gap after each target, to the next target around the circle.
  const gaps = sorted.map((_, i) => (i === n - 1 ? angle(0) + 4 - angle(i) : angle(i + 1) - angle(i)));
  let widest = 0;
  for (let i = 1; i < n; i++) if (gaps[i]! > gaps[widest]! + 1e-12) widest = i;
  const order = [...sorted.slice(widest + 1), ...sorted.slice(0, widest + 1)];
  let cut = Math.floor(n / 2);
  if (split === "weight") {
    const w = order.map((i) => dist(tip, targets[i]!));
    const total = w.reduce((s, x) => s + x, 0);
    let run = 0;
    let best = Infinity;
    for (let c = 1; c < n; c++) {
      run += w[c - 1]!;
      const off = Math.abs(2 * run - total);
      if (off < best - 1e-9) [best, cut] = [off, c];
    }
  } else if (split === "gap") {
    let best = -Infinity;
    const at = (k: number): number => diamondAngle(targets[order[k]!]!.x - tip.x, targets[order[k]!]!.y - tip.y);
    for (let c = 1; c < n; c++) {
      const g = (at(c) - at(c - 1) + 4) % 4;
      if (g > best + 1e-12) [best, cut] = [g, c];
    }
  }
  return [order.slice(0, cut), order.slice(cut)];
}

/**
 * This function gives the highways of the bronchial trees (NAT-019, after Kitaoka and others, 1999). The edges from one source node get one tree. Its root is the out point of the plug nearest the center of the targets.
 * From the tip, the tree grows a share of the way to the center of its targets, then splits the targets in two and grows a branch for each half.
 * A branch that hits a box grows half as far, or not at all. A small set of targets gets its own ways from the tip, through the corner graph.
 * Each edge takes its path in the tree when that path is short enough, and the stretches that two edges or more share become highways.
 */
export function bronchialPlan(input: HighwayInput, o: Readonly<BronchialOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes);
  const pad = finder.margin / 2;
  const first = firstRoutes(input);
  const groups = new Map<string, { edge: string; key: string; s: Point; t: Point; base: number }[]>();
  for (const p of edgePlugs(input.graph)) {
    const s = finder.out(p.ps);
    const t = finder.out(p.pt);
    const route = first.get(p.edge.id);
    const group = p.edge.source.node;
    const list = groups.get(group) ?? [];
    list.push({ edge: p.edge.id, key: p.edge.source.node, s, t, base: route ? polylineLength(route) : dist(s, t) });
    groups.set(group, list);
  }
  const share = Math.min(0.7, Math.max(0.3, o.share));
  const smallest = Math.min(3, Math.max(1, Math.floor(o.smallest)));
  const ways: KeyedWay[] = [];
  for (const group of [...groups.keys()].sort()) {
    const list = groups.get(group)!;
    if (list.length < 2) continue;
    const goals = list.map((e) => e.t);
    const { root, leads } = rootOf(finder, list.map((e) => e.s), goals);
    const paths: (Point[] | undefined)[] = list.map(() => undefined);
    const grow = (trunk: readonly Point[], ids: readonly number[]): void => {
      const tip = trunk[trunk.length - 1]!;
      if (ids.length <= smallest) {
        for (const i of ids) {
          const way = finder.corners.path(tip, goals[i]!);
          if (way) paths[i] = [...trunk, ...finder.corners.pull(way).slice(1)];
        }
        return;
      }
      const c = { x: ids.reduce((s, i) => s + goals[i]!.x, 0) / ids.length, y: ids.reduce((s, i) => s + goals[i]!.y, 0) / ids.length };
      let next = trunk;
      for (let f = share; f > share / 8; f /= 2) {
        const p = { x: tip.x + f * (c.x - tip.x), y: tip.y + f * (c.y - tip.y) };
        if (dist(p, tip) <= 1e-6) break;
        if (!finder.obstacles.inside(p, pad) && finder.obstacles.clearPath([tip, p], pad)) {
          next = [...trunk, p];
          break;
        }
      }
      const [a, b] = splitTargets(next[next.length - 1]!, goals, ids, o.split);
      grow(next, a);
      grow(next, b);
    };
    grow([root], list.map((_, i) => i));
    list.forEach((e, i) => {
      const tail = paths[i];
      const lead = leads[i];
      if (!tail || !lead) return;
      const points = [...lead, ...tail.slice(1)];
      if (points.length < 2 || polylineLength(points) > o.detour * e.base) return;
      ways.push({ edge: e.edge, key: e.key, points });
    });
  }
  return sharedStretches(ways, { minSize: Math.max(2, Math.floor(o.minSize)) });
}
