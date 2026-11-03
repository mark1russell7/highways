import { describe, expect, it } from "vitest";
import { rng } from "./fixtures.ts";
import { dist, type Point } from "./geom.ts";
import type { Node } from "./model.ts";
import { CornerGraph, Obstacles, type CornerGraphOptions, type Terminal } from "./visibility.ts";
import { WORK } from "./work.ts";

/** This function makes a board of `count` random boxes in a square of side `side`. A second group far away makes the corner buckets sparse. */
function board(seed: number, count: number, side: number, far = 0): Node[] {
  const random = rng(seed);
  const nodes: Node[] = [];
  for (let i = 0; i < count; i++) {
    const dx = far > 0 && i % 2 === 1 ? far : 0;
    nodes.push({ id: `n${i}`, box: { x: dx + random() * side, y: random() * side, w: 20 + random() * 60, h: 20 + random() * 60 } });
  }
  return nodes;
}

/** This function gives a random point near the boxes. When `obstacles` is given, the point is out of each box, made larger by `pad`. */
function pointOf(random: () => number, nodes: readonly Node[], obstacles?: Obstacles, pad = 0): Point {
  for (;;) {
    const n = nodes[Math.floor(random() * nodes.length)]!;
    const p = { x: n.box.x - 40 + random() * (n.box.w + 80), y: n.box.y - 40 + random() * (n.box.h + 80) };
    if (!obstacles?.inside(p, pad)) return p;
  }
}

/** This function gives the connected part of each corner, from the public links of the graph. */
function partsOf(graph: CornerGraph): Int32Array {
  const part = new Int32Array(graph.points.length).fill(-1);
  let count = 0;
  for (let i = 0; i < part.length; i++) {
    if (part[i] !== -1) continue;
    const stack = [i];
    part[i] = count;
    while (stack.length > 0) for (const j of graph.neighbours(stack.pop()!)) if (part[j] === -1) (part[j] = count), stack.push(j);
    count++;
  }
  return part;
}

/**
 * This function is the reference search: the A* search of version 0.10.0, with a heap that keeps a second entry when a cost goes down.
 * It gives the path, the start and goal indices, the cost and the work, or `skip` when an end sees no corner with the clearance.
 */
function referenceSearch(
  graph: CornerGraph,
  part: Int32Array,
  from: readonly Terminal[],
  to: readonly Terminal[],
  count: number,
  cost?: (i: number, j: number, d: number) => number,
  floor = 1,
): { points: Point[]; from: number; to: number; cost: number; settled: number } | undefined | "skip" {
  const points = graph.points;
  const goal = new Map<number, number>();
  const goalOf = new Map<number, number>();
  for (let k = 0; k < to.length; k++) {
    const ends = graph.nearestVisible(to[k]!.point, count);
    if (ends.length === 0) return "skip";
    for (const j of ends) {
      const tail = dist(points[j]!, to[k]!.point) + to[k]!.cost;
      const now = goal.get(j);
      if (now === undefined || tail < now) {
        goal.set(j, tail);
        goalOf.set(j, k);
      }
    }
  }
  const starts = from.map((a) => graph.nearestVisible(a.point, count));
  if (starts.some((s) => s.length === 0)) return "skip";
  const goals = new Set([...goal.keys()].map((j) => part[j]!));
  if (!starts.some((s) => s.some((j) => goals.has(part[j]!)))) return undefined;
  const G = new Map<number, number>();
  const parentOf = new Map<number, number>();
  const closed = new Set<number>();
  const heap: [number, number][] = [];
  const better = (a: [number, number], b: [number, number]): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const pop = (): [number, number] => {
    let m = 0;
    for (let i = 1; i < heap.length; i++) if (better(heap[i]!, heap[m]!)) m = i;
    return heap.splice(m, 1)[0]!;
  };
  const estimate = (p: Point): number => floor * Math.min(...to.map((b) => dist(p, b.point)));
  const relax = (j: number, g: number, parent: number): void => {
    if (closed.has(j)) return;
    if (G.has(j) && G.get(j)! <= g) return;
    G.set(j, g);
    parentOf.set(j, parent);
    heap.push([g + estimate(points[j]!), j]);
  };
  from.forEach((a, i) => {
    for (const j of starts[i]!) relax(j, a.cost + dist(a.point, points[j]!), -1 - i);
  });
  let best = Infinity;
  let bestEnd = -1;
  let settled = 0;
  while (heap.length > 0) {
    let top = heap[0]!;
    for (const e of heap) if (better(e, top)) top = e;
    if (top[0] >= best) break;
    const i = pop()[1];
    if (closed.has(i)) continue;
    closed.add(i);
    const adj = graph.neighbours(i);
    settled += 1 + adj.length;
    const gi = G.get(i)!;
    const tail = goal.get(i);
    if (tail !== undefined && gi + tail < best) {
      best = gi + tail;
      bestEnd = i;
    }
    for (const j of adj) {
      if (closed.has(j)) continue;
      const d = dist(points[i]!, points[j]!);
      relax(j, gi + (cost ? cost(i, j, d) : d), i);
    }
  }
  if (bestEnd < 0) return undefined;
  const k = goalOf.get(bestEnd)!;
  const out: Point[] = [to[k]!.point];
  for (let i = bestEnd; ; i = parentOf.get(i)!) {
    out.push(points[i]!);
    if (parentOf.get(i)! < 0) {
      const f = -1 - parentOf.get(i)!;
      out.push(from[f]!.point);
      return { points: out.reverse(), from: f, to: k, cost: best, settled };
    }
  }
}

/** The boards of the test: the seed, the number of boxes, the side of the square, the offset of the far group and the options of the graph. */
const BOARDS: readonly [number, number, number, number, CornerGraphOptions][] = [
  [1, 30, 600, 0, { margin: 5, k: 8, cones: true }],
  [2, 60, 900, 0, { margin: 20, k: 8 }],
  [3, 40, 500, 0, { margin: 10, k: 4, cones: true, lattice: 0 }],
  [4, 24, 400, 2_000_000, { margin: 8, k: 6, lattice: 0 }],
];

describe("the search of the corner graph (SEARCH-SPEED)", () => {
  for (const [seed, count, side, far, options] of BOARDS) {
    const nodes = board(seed, count, side, far);
    const obstacles = new Obstacles(nodes, 180);
    const graph = new CornerGraph(nodes, obstacles, options);
    const part = partsOf(graph);
    const pad = options.margin / 2;

    it(`gives the paths and the work of the reference search on board ${seed}`, () => {
      const random = rng(100 + seed);
      const cost = (i: number, j: number, d: number): number => d * (1 + ((i * 7 + j * 13) % 5) / 4);
      let compared = 0;
      for (let q = 0; q < 60; q++) {
        const a = pointOf(random, nodes);
        const b = pointOf(random, nodes);
        if (obstacles.clear(a, b, pad)) continue;
        const withCost = q % 2 === 1;
        const ref = withCost
          ? referenceSearch(graph, part, [{ point: a, cost: 0 }], [{ point: b, cost: 0 }], 2 * options.k, cost, 1)
          : referenceSearch(graph, part, [{ point: a, cost: 0 }], [{ point: b, cost: 0 }], 2 * options.k);
        if (ref === "skip") continue;
        const before = WORK.corner;
        const got = withCost ? graph.path(a, b, cost, 1) : graph.path(a, b);
        expect(got).toEqual(ref?.points);
        expect(WORK.corner - before).toBe(ref?.settled ?? 0);
        compared++;
      }
      expect(compared).toBeGreaterThan(10);
    });

    it(`gives the paths among several points of the reference search on board ${seed}`, () => {
      const random = rng(200 + seed);
      let compared = 0;
      for (let q = 0; q < 30; q++) {
        const from = [0, 1, 2].map((): Terminal => ({ point: pointOf(random, nodes, obstacles, pad), cost: random() * 50 }));
        const to = [0, 1].map((): Terminal => ({ point: pointOf(random, nodes, obstacles, pad), cost: random() * 50 }));
        const ref = referenceSearch(graph, part, from, to, options.k);
        if (ref === "skip") continue;
        const before = WORK.corner;
        const got = graph.pathAmong(from, to);
        expect(WORK.corner - before).toBe(ref?.settled ?? 0);
        // A straight line can replace the found path, so the test compares the found path only when the method kept it.
        if (got !== undefined && got.points.length > 2) expect(got).toEqual({ points: ref!.points, from: ref!.from, to: ref!.to, cost: ref!.cost });
        compared++;
      }
      expect(compared).toBeGreaterThan(5);
    });

    it(`gives the visible corners nearest first on board ${seed}`, () => {
      const random = rng(300 + seed);
      let size = 0;
      for (const n of nodes) size += (n.box.w + n.box.h) / 2;
      const cell = Math.max(1, size / nodes.length + 2 * options.margin);
      for (let q = 0; q < 40; q++) {
        const p = pointOf(random, nodes);
        const order = graph.points
          .map((c, j) => ({ j, d: dist(p, c) }))
          .filter((e) => e.d <= 8 * cell)
          .sort((u, v) => u.d - v.d || u.j - v.j);
        const want = order.filter((e) => obstacles.clear(p, graph.points[e.j]!, pad)).slice(0, options.k).map((e) => e.j);
        expect(graph.nearestVisible(p, options.k)).toEqual(want);
      }
    });
  }
});
