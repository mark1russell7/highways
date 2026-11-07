/**
 * This probe tells if each route of THROUGH-FLOOR with no way in the corner graph has a way in the free space (NO-WAY-FREE).
 * The search is exact for boxes with sides on the axes. It uses the grid of all the box sides and the midlines between them.
 * Each box that is not an end is an obstacle. The obstacle is the open inside of the box, grown by `d`.
 * The probe reads three values of `d`:
 * - `-TOLERANCE`: the rule of the counter `through`. A route along a seam of two boxes that touch does not count.
 * - `0`: the exact boxes. A path can go along a side that two boxes share.
 * - `1`: a path keeps 1 unit from each box, so it needs a gap between the boxes.
 * The counter `measureRouteFaults` checks each path that the search finds.
 * The argument is the out folder.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { measureRouteFaults } from "../src/bench/links.ts";
import { TOLERANCE } from "../src/bench/properties.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import type { Graph } from "../src/model.ts";

interface FloorRow {
  readonly family: string;
  readonly seed: number;
  readonly router: string;
  readonly edge: string;
  readonly source: string;
  readonly target: string;
}

interface Rect {
  readonly id: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

type Point = { x: number; y: number };

const D = [-TOLERANCE, 0, 1] as const;

/** This function gives the sorted distinct values, with the midline between each two neighbors. */
function lines(values: number[]): number[] {
  const v = [...new Set(values)].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < v.length; i++) {
    out.push(v[i]!);
    if (i + 1 < v.length) out.push((v[i]! + v[i + 1]!) / 2);
  }
  return out;
}

/** The grid of one board and one `d`: for each node and each step, the obstacles whose open inside holds it. */
class FreeGrid {
  readonly xs: number[];
  readonly ys: number[];
  readonly node: string[][];
  readonly right: string[][];
  readonly up: string[][];
  constructor(readonly rects: readonly Rect[]) {
    const minX = Math.min(...rects.map((r) => r.x0)) - 10;
    const maxX = Math.max(...rects.map((r) => r.x1)) + 10;
    const minY = Math.min(...rects.map((r) => r.y0)) - 10;
    const maxY = Math.max(...rects.map((r) => r.y1)) + 10;
    this.xs = lines([minX, maxX, ...rects.flatMap((r) => [r.x0, r.x1])]);
    this.ys = lines([minY, maxY, ...rects.flatMap((r) => [r.y0, r.y1])]);
    const nx = this.xs.length;
    const ny = this.ys.length;
    const cell = (): string[][] => Array.from({ length: nx * ny }, () => []);
    this.node = cell();
    this.right = cell();
    this.up = cell();
    const inside = (r: Rect, x: number, y: number): boolean => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
    for (const r of rects) {
      for (let i = 0; i < nx; i++) {
        const x = this.xs[i]!;
        if (x < r.x0 - 1e-9 || x > r.x1 + 1e-9) continue;
        for (let j = 0; j < ny; j++) {
          const y = this.ys[j]!;
          if (y < r.y0 - 1e-9 || y > r.y1 + 1e-9) continue;
          const k = i * ny + j;
          if (inside(r, x, y)) this.node[k]!.push(r.id);
          if (i + 1 < nx && inside(r, (x + this.xs[i + 1]!) / 2, y)) this.right[k]!.push(r.id);
          if (j + 1 < ny && inside(r, x, (y + this.ys[j + 1]!) / 2)) this.up[k]!.push(r.id);
        }
      }
    }
  }

  /** This method gives a path of grid points from box `s` to box `t`. It gives `undefined` when no path exists. */
  path(s: Rect, t: Rect): Point[] | undefined {
    const ny = this.ys.length;
    const nx = this.xs.length;
    const ok = (ids: readonly string[]): boolean => ids.every((id) => id === s.id || id === t.id);
    const within = (r: Rect, k: number): boolean => {
      const x = this.xs[Math.floor(k / ny)]!;
      const y = this.ys[k % ny]!;
      return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    };
    const from = new Int32Array(nx * ny).fill(-2);
    const queue: number[] = [];
    for (let k = 0; k < nx * ny; k++) {
      if (within(s, k) && ok(this.node[k]!)) {
        from[k] = -1;
        queue.push(k);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q]!;
      if (within(t, k)) {
        const out: Point[] = [];
        for (let c = k; c >= 0; c = from[c]!) out.push({ x: this.xs[Math.floor(c / ny)]!, y: this.ys[c % ny]! });
        return out.reverse();
      }
      const i = Math.floor(k / ny);
      const j = k % ny;
      const steps: [number, readonly string[]][] = [];
      if (i + 1 < nx) steps.push([k + ny, this.right[k]!]);
      if (i > 0) steps.push([k - ny, this.right[k - ny]!]);
      if (j + 1 < ny) steps.push([k + 1, this.up[k]!]);
      if (j > 0) steps.push([k - 1, this.up[k - 1]!]);
      for (const [n, ids] of steps) {
        if (from[n] !== -2 || !ok(ids) || !ok(this.node[n]!)) continue;
        from[n] = k;
        queue.push(n);
      }
    }
    return undefined;
  }
}

/** This function removes the points between two steps on one line. */
function simplify(p: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of p) {
    if (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      if ((a.x === b.x && b.x === q.x) || (a.y === b.y && b.y === q.y)) out.pop();
    }
    out.push(q);
  }
  return out;
}

/** This function gives the gaps between the boxes that face each other across a seam, from the smallest. */
function gaps(graph: Graph): number[] {
  const out: number[] = [];
  const n = graph.nodes;
  for (let a = 0; a < n.length; a++) {
    for (let b = a + 1; b < n.length; b++) {
      const p = n[a]!.box;
      const q = n[b]!.box;
      const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
      const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
      if (oy > 0 && ox <= 0) out.push(-ox);
      else if (ox > 0 && oy <= 0) out.push(-oy);
    }
  }
  return out.sort((x, y) => x - y);
}

/** This function gives the length of a polyline. */
const length = (p: readonly Point[]): number => p.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - p[i]!.x, q.y - p[i]!.y), 0);

/** This function gives the distance between the centers of two boxes. */
const span = (a: Rect, b: Rect): number => Math.hypot((a.x0 + a.x1 - b.x0 - b.x1) / 2, (a.y0 + a.y1 - b.y0 - b.y1) / 2);

const outDir = process.argv[2]!;
const floor = JSON.parse(readFileSync(new URL("./data/through-floor/rows.json", import.meta.url), "utf8")) as FloorRow[];
const cases = floor.filter((r) => r.router === "corners");
const registry = highwaysRegistry();
const rows: Record<string, unknown>[] = [];
const boards: Record<string, unknown>[] = [];
for (const seed of [...new Set(cases.map((c) => c.seed))].sort()) {
  const family = cases.find((c) => c.seed === seed)!.family;
  const graph = registry.generate(family, seed).graph;
  const g = gaps(graph);
  boards.push({ family, seed, boxes: graph.nodes.length, nearestGaps: g.slice(0, 5), facingPairs: g.length, pairsWithGapOver1: g.filter((x) => x > 1).length });
  const grids = D.map(
    (d) =>
      new FreeGrid(graph.nodes.map((n) => ({ id: n.id, x0: n.box.x - d, y0: n.box.y - d, x1: n.box.x + n.box.w + d, y1: n.box.y + n.box.h + d }))),
  );
  const rect = (id: string): Rect => {
    const b = graph.nodes.find((n) => n.id === id)!.box;
    return { id, x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
  };
  for (const c of cases.filter((x) => x.seed === seed)) {
    const row: Record<string, unknown> = { family, seed, edge: c.edge, source: c.source, target: c.target };
    D.forEach((d, i) => {
      const p = grids[i]!.path(rect(c.source), rect(c.target));
      const points = p === undefined ? undefined : simplify(p);
      const through = points === undefined ? undefined : measureRouteFaults(graph, { routes: [{ edge: c.edge, points }] }).through;
      // The stretch is the length of the path over the distance between the centers of the two ends.
      const stretch = points === undefined ? undefined : Math.round((length(points) / span(rect(c.source), rect(c.target))) * 100) / 100;
      row[`d=${d}`] = points === undefined ? { way: false } : { way: true, points: points.length, through, stretch, path: points };
    });
    rows.push(row);
  }
}
const count = (d: number, f: (v: { way: boolean; through?: number }) => boolean): number =>
  rows.filter((r) => f(r[`d=${d}`] as { way: boolean; through?: number })).length;
const stretches = (d: number): number[] =>
  rows
    .map((r) => (r[`d=${d}`] as { stretch?: number }).stretch)
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b);
const summary = {
  probe: "NO-WAY-FREE",
  question: "Is there a way in the free space for each of the 292 routes of corners that cross a box on packed-grid?",
  cases: rows.length,
  boards,
  byD: Object.fromEntries(
    D.map((d) => [
      String(d),
      {
        way: count(d, (v) => v.way),
        noWay: count(d, (v) => !v.way),
        wayThatTheCounterPasses: count(d, (v) => v.way && v.through === 0),
        stretchOfTheWays: ((v) => ({ min: v[0], median: v[Math.floor(v.length / 2)], max: v[v.length - 1] }))(stretches(d)),
      },
    ]),
  ),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "rows.json"), `${JSON.stringify(rows, null, 1)}\n`);
writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
