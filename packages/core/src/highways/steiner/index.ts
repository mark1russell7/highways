import { polylineLength, type Point } from "../../geom.ts";
import { byCollection } from "../../routers/trunks.ts";
import { WayFinder } from "../../ways.ts";
import { firstRoutes } from "../base.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The groups of the trees: the edges from one source node, or the edges of one collection. */
export type SteinerGroup = "source" | "key";

/** The values of `SteinerGroup`. */
export const STEINER_GROUPS: readonly SteinerGroup[] = Object.freeze(["source", "key"]);

/** The method of the tree: the iterated 1-Steiner method on the Hanan grid, or the spanning tree of the terminals alone. */
export type SteinerMethod = "one-steiner" | "spanning";

/** The values of `SteinerMethod`. */
export const STEINER_METHODS: readonly SteinerMethod[] = Object.freeze(["one-steiner", "spanning"]);

/** The metric of the tree: rectilinear (two directions) or octilinear (four directions). */
export type SteinerMetric = "rectilinear" | "octilinear";

/** The values of `SteinerMetric`. */
export const STEINER_METRICS: readonly SteinerMetric[] = Object.freeze(["rectilinear", "octilinear"]);

/** The options of the highway strategy `steiner` (HWY-036 of the note on highways, with EDA-015). */
export interface SteinerOptions {
  /** The groups of the trees. The default is `source`. */
  readonly group: SteinerGroup;
  /** The method of the tree. The default is `one-steiner`. */
  readonly method: SteinerMethod;
  /** A group with more terminals than this number gets the spanning tree alone. The default is 12. */
  readonly maxGroup: number;
  /** The metric of the tree. The default is `rectilinear`. */
  readonly metric: SteinerMetric;
  /** An edge rides the tree only when its path in the tree is this many times its first route or less. The default is 1.5. */
  readonly detour: number;
  /** A stretch of a tree with fewer edges than this number is not a highway. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `steiner`. */
export const STEINER_DEFAULTS: Readonly<SteinerOptions> = Object.freeze({ group: "source", method: "one-steiner", maxGroup: 12, metric: "rectilinear", detour: 1.5, minSize: 2 });

/** This function gives the distance of two points in the metric. */
function metricDistance(a: Point, b: Point, metric: SteinerMetric): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return metric === "rectilinear" ? dx + dy : Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/** This function gives the links of the spanning tree of the points (Prim), as pairs of indices, and the sum of their lengths. */
export function spanningTree(points: readonly Point[], metric: SteinerMetric): { links: [number, number][]; cost: number } {
  const n = points.length;
  if (n < 2) return { links: [], cost: 0 };
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  best[0] = 0;
  const links: [number, number][] = [];
  let cost = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i]! < best[u]!)) u = i;
    inTree[u] = 1;
    if (from[u]! >= 0) {
      links.push([from[u]!, u]);
      cost += best[u]!;
    }
    for (let i = 0; i < n; i++) {
      if (inTree[i]) continue;
      const d = metricDistance(points[u]!, points[i]!, metric);
      if (d < best[i]!) {
        best[i] = d;
        from[i] = u;
      }
    }
  }
  return { links, cost };
}

/**
 * This function gives a Steiner tree of the terminals by the iterated 1-Steiner method (Kahng and Robins). The candidates are the points of the Hanan grid.
 * Each round adds the candidate that makes the spanning tree shortest, and drops each added point with two links or fewer.
 * The test `free` removes the candidates in the boxes. The result has the terminals first, then the added points.
 */
export function oneSteiner(terminals: readonly Point[], metric: SteinerMetric, free: (p: Point) => boolean): { points: Point[]; links: [number, number][] } {
  const points = [...terminals];
  const xs = [...new Set(terminals.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(terminals.map((p) => p.y))].sort((a, b) => a - b);
  const taken = new Set(terminals.map((p) => `${p.x},${p.y}`));
  const candidates: Point[] = [];
  for (const x of xs) for (const y of ys) if (!taken.has(`${x},${y}`) && free({ x, y })) candidates.push({ x, y });
  let tree = spanningTree(points, metric);
  for (let round = 0; round < terminals.length; round++) {
    let best = -1;
    let bestCost = tree.cost - 1e-9 * Math.max(1, tree.cost);
    candidates.forEach((c, i) => {
      const cost = spanningTree([...points, c], metric).cost;
      if (cost < bestCost) [best, bestCost] = [i, cost];
    });
    if (best < 0) break;
    points.push(candidates[best]!);
    candidates.splice(best, 1);
    tree = spanningTree(points, metric);
    // An added point with two links or fewer saves nothing, so it leaves the tree.
    for (;;) {
      const degree = new Array<number>(points.length).fill(0);
      for (const [a, b] of tree.links) {
        degree[a] = degree[a]! + 1;
        degree[b] = degree[b]! + 1;
      }
      let drop = -1;
      for (let i = terminals.length; i < points.length; i++) if (degree[i]! <= 2) drop = i;
      if (drop < 0) break;
      points.splice(drop, 1);
      tree = spanningTree(points, metric);
    }
  }
  return { points, links: tree.links };
}

/**
 * This function gives the polyline of one link of the tree. A rectilinear link is an L in clear view, else a path through the corner graph.
 * An octilinear link is a straight piece and a diagonal piece. The same link gives the same points each time.
 */
function linkPath(a: Point, b: Point, metric: SteinerMetric, finder: WayFinder): Point[] {
  const pad = finder.margin / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tries: Point[][] = [];
  if (Math.abs(dx) < 1e-9 || Math.abs(dy) < 1e-9) tries.push([a, b]);
  else if (metric === "rectilinear") tries.push([a, { x: b.x, y: a.y }, b], [a, { x: a.x, y: b.y }, b]);
  else {
    const d = Math.min(Math.abs(dx), Math.abs(dy));
    const diag = { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d };
    const late = { x: b.x - Math.sign(dx) * d, y: b.y - Math.sign(dy) * d };
    tries.push([a, diag, b], [a, late, b]);
  }
  for (const t of tries) if (finder.obstacles.clearPath(t, pad)) return t.filter((p, i) => i === 0 || p.x !== t[i - 1]!.x || p.y !== t[i - 1]!.y);
  const way = finder.corners.path(a, b);
  return way ? finder.corners.pull(way) : [a, b];
}

/**
 * This function gives the highways of obstacle-avoiding Steiner trees (HWY-036 with EDA-015). Each group of edges gets one tree over the points out of its plugs.
 * The links of the tree are rectilinear or octilinear, and they go around the boxes. Each edge takes its path in the tree, when that path is short enough.
 * The stretches of the tree that two edges or more share become highways.
 */
export function steinerPlan(input: HighwayInput, o: Readonly<SteinerOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes);
  const pad = finder.margin / 2;
  const first = firstRoutes(input);
  const groups = new Map<string, { edge: string; s: Point; t: Point; base: number }[]>();
  for (const p of edgePlugs(input.graph)) {
    const key = o.group === "key" ? (byCollection(p.edge) ?? `\u0000${p.edge.source.node}`) : p.edge.source.node;
    const s = finder.out(p.ps);
    const t = finder.out(p.pt);
    const route = first.get(p.edge.id);
    const list = groups.get(key) ?? [];
    list.push({ edge: p.edge.id, s, t, base: route ? polylineLength(route) : metricDistance(s, t, "rectilinear") });
    groups.set(key, list);
  }
  const ways: KeyedWay[] = [];
  for (const key of [...groups.keys()].sort()) {
    const list = groups.get(key)!;
    if (list.length < 2) continue;
    const index = new Map<string, number>();
    const terminals: Point[] = [];
    const at = (p: Point): number => {
      const k = `${p.x},${p.y}`;
      let i = index.get(k);
      if (i === undefined) {
        index.set(k, (i = terminals.length));
        terminals.push(p);
      }
      return i;
    };
    const ends = list.map((e) => [at(e.s), at(e.t)] as const);
    const tree = o.method === "one-steiner" && terminals.length <= o.maxGroup ? oneSteiner(terminals, o.metric, (p) => !finder.obstacles.inside(p, pad)) : { points: terminals, ...spanningTree(terminals, o.metric) };
    const n = tree.points.length;
    const next: { to: number; path: Point[] }[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of tree.links) {
      const path = linkPath(tree.points[a]!, tree.points[b]!, o.metric, finder);
      next[a]!.push({ to: b, path });
      next[b]!.push({ to: a, path: [...path].reverse() });
    }
    list.forEach((e, k) => {
      const [s, t] = ends[k]!;
      // The path in the tree from `s` to `t`, by a search from `s`.
      const back = new Int32Array(n).fill(-2);
      const via: (Point[] | undefined)[] = new Array(n);
      back[s] = -1;
      const queue = [s];
      while (queue.length > 0) {
        const u = queue.shift()!;
        if (u === t) break;
        for (const x of next[u]!) {
          if (back[x.to] !== -2) continue;
          back[x.to] = u;
          via[x.to] = x.path;
          queue.push(x.to);
        }
      }
      if (back[t] === -2 || s === t) return;
      const pieces: Point[][] = [];
      for (let v = t; v !== s; v = back[v]!) pieces.push(via[v]!);
      const points: Point[] = [];
      for (const piece of pieces.reverse()) for (const p of piece) if (points.length === 0 || p.x !== points[points.length - 1]!.x || p.y !== points[points.length - 1]!.y) points.push(p);
      if (polylineLength(points) > o.detour * e.base) return;
      ways.push({ edge: e.edge, key, points });
    });
  }
  return sharedStretches(ways, { minSize: o.minSize });
}
