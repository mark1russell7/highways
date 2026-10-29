import { dist, polylineLength, type Point } from "../../geom.ts";
import { balancedFan, fanPath, type Fan } from "../../routers/fan.ts";
import { WayFinder } from "../../ways.ts";
import { firstRoutes } from "../base.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";
import { rootOf } from "./root.ts";

/** The rule that picks one tree on the front: the knee of the chord, or the least weighted sum. */
export type KneeRule = "chord" | "weights";

/** The values of `KneeRule`. */
export const KNEE_RULES: readonly KneeRule[] = Object.freeze(["chord", "weights"]);

/** The options of the highway strategy `knee` (NAT-018 of the nature notes, on the trees of NAT-017). */
export interface KneeOptions {
  /** The number of points of the sweep of the balancing factor, from 5 to 21. The default is 11. */
  readonly sweep: number;
  /** The rule that picks one tree on the front. The default is `chord`. */
  readonly rule: KneeRule;
  /** The weight of the ink in the rule `weights`, from 0 to 1. The rest of the weight goes to the path length. The default is 0.5. */
  readonly ink: number;
  /** An edge rides the tree only when its path in the tree is this many times its first route or less. The default is 1.5. */
  readonly detour: number;
  /** A stretch of a tree with fewer edges than this number is not a highway. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `knee`. */
export const KNEE_DEFAULTS: Readonly<KneeOptions> = Object.freeze({ sweep: 11, rule: "chord", ink: 0.5, detour: 1.5, minSize: 2 });

/** One tree of the sweep: its balancing factor, its ink `L`, the sum of its path lengths `S`, and the tree. */
export interface KneeTree {
  readonly bf: number;
  readonly ink: number;
  readonly paths: number;
  readonly fan: Fan;
}

/** This function gives the ink of a fan: the sum of the lengths of its links. */
function fanInk(fan: Fan): number {
  let sum = 0;
  for (const p of fan.points) if (p.parent >= 0) sum += dist(p.point, fan.points[p.parent]!.point);
  return sum;
}

/**
 * This function adds a stub point at `stub` from the end of the last link of a way. The tree of NAT-017 joins a new branch only at an open point or on a link to one.
 * The last point of a way is not open, so without the stub no branch joins the last link.
 */
function withStub(way: Point[], stub: number): Point[] {
  if (way.length < 2) return way;
  const a = way[way.length - 2]!;
  const b = way[way.length - 1]!;
  const d = dist(a, b);
  if (d <= 2 * stub) return way;
  return [...way.slice(0, -1), { x: b.x + ((a.x - b.x) * stub) / d, y: b.y + ((a.y - b.y) * stub) / d }, b];
}

/**
 * This function gives the index of the tree that the rule picks on the front of the trees (NAT-018).
 * The front holds the trees that no other tree beats on the ink and on the path lengths. The two values go to the range from 0 to 1.
 * With `chord`, the pick is the tree of the front farthest from the line between the two ends of the front.
 * With `weights`, the pick is the tree with the least `ink × L + (1 - ink) × S`. A tie goes to the earlier tree.
 */
export function kneeOf(trees: readonly Pick<KneeTree, "ink" | "paths">[], rule: KneeRule, ink: number): number {
  if (trees.length === 0) return -1;
  const front = trees.map((_, i) => i).filter((i) => !trees.some((q, j) => j !== i && q.ink <= trees[i]!.ink && q.paths <= trees[i]!.paths && (q.ink < trees[i]!.ink || q.paths < trees[i]!.paths)));
  const lo = { x: Math.min(...front.map((i) => trees[i]!.ink)), y: Math.min(...front.map((i) => trees[i]!.paths)) };
  const hi = { x: Math.max(...front.map((i) => trees[i]!.ink)), y: Math.max(...front.map((i) => trees[i]!.paths)) };
  const norm = (i: number): Point => ({
    x: hi.x - lo.x > 1e-9 ? (trees[i]!.ink - lo.x) / (hi.x - lo.x) : 0,
    y: hi.y - lo.y > 1e-9 ? (trees[i]!.paths - lo.y) / (hi.y - lo.y) : 0,
  });
  let best = front[0]!;
  let score = rule === "chord" ? -Infinity : Infinity;
  if (rule === "weights") {
    const w = Math.min(1, Math.max(0, ink));
    for (const i of front) {
      const p = norm(i);
      const s = w * p.x + (1 - w) * p.y;
      if (s < score - 1e-12) [best, score] = [i, s];
    }
    return best;
  }
  // The ends of the front: the tree with the least ink, and the tree with the least path lengths.
  const a = front.reduce((u, i) => (trees[i]!.ink < trees[u]!.ink || (trees[i]!.ink === trees[u]!.ink && trees[i]!.paths < trees[u]!.paths) ? i : u));
  const b = front.reduce((u, i) => (trees[i]!.paths < trees[u]!.paths || (trees[i]!.paths === trees[u]!.paths && trees[i]!.ink < trees[u]!.ink) ? i : u));
  const A = norm(a);
  const B = norm(b);
  const len = dist(A, B);
  if (len <= 1e-12) return a;
  for (const i of front) {
    const p = norm(i);
    const s = Math.abs((B.x - A.x) * (A.y - p.y) - (A.x - p.x) * (B.y - A.y)) / len;
    if (s > score + 1e-12) [best, score] = [i, s];
  }
  return best;
}

/**
 * This function gives the highways of the knee trees (NAT-018). The edges from one source node get one tree. Its root is the out point of the plug nearest the center of the targets.
 * A sweep of the balancing factor of NAT-017 gives trees from the least ink to the most direct paths.
 * The tree at the knee of the front of ink and path lengths is the pick. Each edge takes its path in the tree, when that path is short enough.
 * The stretches of the tree that two edges or more share become highways.
 */
export function kneePlan(input: HighwayInput, o: Readonly<KneeOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes);
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
  const sweep = Math.min(21, Math.max(2, Math.floor(o.sweep)));
  const ways: KeyedWay[] = [];
  for (const group of [...groups.keys()].sort()) {
    const list = groups.get(group)!;
    if (list.length < 2) continue;
    const goals = list.map((e) => e.t);
    const { root, leads } = rootOf(finder, list.map((e) => e.s), goals);
    const lost = new Set<number>();
    const branch = (from: Point, t: number): Point[] => {
      const way = finder.corners.path(from, goals[t]!);
      if (way) return withStub(finder.corners.pull(way), finder.margin);
      lost.add(t);
      return [from, goals[t]!];
    };
    // The sweep: the cost `a L + (1 - a) S` for `a` from `1 / sweep` to 1, as the balancing factor `bf = (1 - a) / a`.
    const trees: KneeTree[] = [];
    for (let k = 0; k < sweep; k++) {
      const a = (k + 1) / sweep;
      const bf = (1 - a) / a;
      const fan = balancedFan(root, goals, bf, branch);
      let paths = 0;
      for (const leaf of fan.leaf) paths += fan.points[leaf]!.pl;
      trees.push({ bf, ink: fanInk(fan), paths, fan });
    }
    const pick = trees[kneeOf(trees, o.rule, o.ink)]!;
    list.forEach((e, t) => {
      const lead = leads[t];
      if (lost.has(t) || !lead) return;
      const points = [...lead, ...fanPath(pick.fan, pick.fan.leaf[t]!).slice(1)];
      if (points.length < 2 || polylineLength(points) > o.detour * e.base) return;
      ways.push({ edge: e.edge, key: e.key, points });
    });
  }
  return sharedStretches(ways, { minSize: Math.max(2, Math.floor(o.minSize)) });
}
