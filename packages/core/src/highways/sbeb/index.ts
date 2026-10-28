import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, type Point } from "../../geom.ts";
import { byCollection } from "../../routers/trunks.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { firstRoutes } from "../base.ts";
import type { EdgeGroup } from "../grouped.ts";
import type { DensityGrid, DensitySource } from "../kdeeb/index.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { QUICKBUNDLES_DEFAULTS, quickBundles, resample } from "../quickbundles/index.ts";
import { edgePlugs } from "../stretches.ts";
import { outOfBoxes, tracePlan } from "../trace.ts";

/** The clusterer that gives the groups of edges: QuickBundles (HWY-026) with its defaults, or the collection of each edge. */
export type SkeletonGroups = "quickbundles" | "keys";

/** The values of `SkeletonGroups`. */
export const SKELETON_GROUPS: readonly SkeletonGroups[] = Object.freeze(["quickbundles", "keys"]);

/** The point that each sample point moves toward: the nearest point of the skeleton of its group, or of the mean polyline of its group. */
export type SkeletonTarget = "skeleton" | "mean";

/** The values of `SkeletonTarget`. */
export const SKELETON_TARGETS: readonly SkeletonTarget[] = Object.freeze(["skeleton", "mean"]);

/** The options of the highway strategy `sbeb` (HWY-009 of the notes). */
export interface SbebOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The clusterer of the groups. The default is `quickbundles`. */
  readonly group: SkeletonGroups;
  /** The first lines of the edges: their straight lines, or their first routes. The default is `lines`. */
  readonly source: DensitySource;
  /** The radius of the shape of a group, as a multiple of `boardUnit`. The default is 1.5. */
  readonly radius: number;
  /** The share of the distance to the target that a point moves in one step, from 0 to 1. The default is 0.5. */
  readonly attraction: number;
  /** The number of steps. The default is 4. */
  readonly steps: number;
  /** The share of the Laplacian smoothing of each polyline after each step, from 0 to 1. The default is 0.5. */
  readonly smoothing: number;
  /** The target of the points. The default is `skeleton`. */
  readonly target: SkeletonTarget;
  /** The side of a cell of the image of the shape, in units of the board. A large shape gets larger cells, up to 256 cells on a side. The default is 4. */
  readonly cell: number;
  /** The side of the grid that the points of the edges snap to after the steps, in units of the board. The default is 8. */
  readonly snap: number;
  /** A group with this number of edges or more moves, and a highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `sbeb`. */
export const SBEB_DEFAULTS: Readonly<Required<Omit<SbebOptions, "margin" | "k">>> = Object.freeze({
  group: "quickbundles",
  source: "lines",
  radius: 1.5,
  attraction: 0.5,
  steps: 4,
  smoothing: 0.5,
  target: "skeleton",
  cell: 4,
  snap: 8,
  minSize: 2,
});

/** This function gives the group of each edge: the clusters of QuickBundles, or the collection of the edge. An edge without a collection has no group with `keys`. */
export function skeletonGroups(input: HighwayInput, group: SkeletonGroups): Map<string, EdgeGroup> {
  if (group === "quickbundles") return quickBundles(input, QUICKBUNDLES_DEFAULTS);
  const out = new Map<string, EdgeGroup>();
  for (const e of input.graph.edges) {
    const key = byCollection(e);
    if (key !== undefined) out.set(e.id, { key, flip: false });
  }
  return out;
}

/** This function gives the first line of each edge, from the point at `margin` out of its source plug to the point at `margin` out of its target plug. */
export function firstLines(input: HighwayInput, finder: WayFinder, source: DensitySource, spacing: number): Map<string, Point[]> {
  const routes = source === "routes" ? firstRoutes(input) : undefined;
  const out = new Map<string, Point[]>();
  for (const { edge, ps, pt } of edgePlugs(input.graph)) {
    const a = finder.out(ps);
    const b = finder.out(pt);
    const route = routes?.get(edge.id);
    const base = route && route.length > 2 ? [a, ...route.slice(1, -1), b] : [a, b];
    let len = 0;
    for (let i = 1; i < base.length; i++) len += dist(base[i - 1]!, base[i]!);
    out.set(edge.id, resample(base, Math.max(2, Math.min(129, Math.ceil(len / Math.max(1e-3, spacing)) + 1))));
  }
  return out;
}

/** The image of the shape of a group and its skeleton. */
export interface ShapeSkeleton {
  readonly grid: DensityGrid;
  /** The distance of each cell to the nearest cell outside the shape, in cells. A cell outside the shape has 0. */
  readonly depth: Float64Array;
  /** The value is 1 for each cell of the skeleton. */
  readonly skeleton: Uint8Array;
}

/** This function gives the distance from the point `p` to the segment from `a` to `b`. */
function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
}

/** The steps to the 8 neighbours of a cell, as pairs of opposite steps: along x, along y and along the two diagonals. */
const PAIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/**
 * This function gives the shape of a group and its skeleton (its medial axis). The shape is the union of the disks of radius `radius` along the lines, minus the boxes.
 * The depth is a chamfer distance transform with the steps 1 and √2. A cell is on the skeleton when its depth is half of `radius` or more,
 * and when it is a ridge of the depth along one of the four pairs of opposite neighbours: not lower than the two, and higher than one of them.
 */
export function shapeSkeleton(lines: readonly (readonly Point[])[], finder: WayFinder, radius: number, cell: number): ShapeSkeleton {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of lines)
    for (const p of l) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  const pad = radius + 2 * Math.max(1e-3, cell);
  const c = Math.max(1e-3, cell, (x1 - x0 + 2 * pad) / 256, (y1 - y0 + 2 * pad) / 256);
  const grid: DensityGrid = { cell: c, x0: x0 - pad, y0: y0 - pad, w: Math.max(1, Math.ceil((x1 - x0 + 2 * pad) / c)), h: Math.max(1, Math.ceil((y1 - y0 + 2 * pad) / c)) };
  const { w, h } = grid;
  const inside = new Uint8Array(w * h);
  const mid = (x: number, y: number): Point => ({ x: grid.x0 + (x + 0.5) * c, y: grid.y0 + (y + 0.5) * c });
  for (const l of lines)
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1]!;
      const b = l[i]!;
      const gx0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius - grid.x0) / c));
      const gx1 = Math.min(w - 1, Math.floor((Math.max(a.x, b.x) + radius - grid.x0) / c));
      const gy0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - radius - grid.y0) / c));
      const gy1 = Math.min(h - 1, Math.floor((Math.max(a.y, b.y) + radius - grid.y0) / c));
      for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) if (!inside[y * w + x] && segDist(mid(x, y), a, b) <= radius) inside[y * w + x] = 1;
    }
  const boxPad = finder.margin / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside[y * w + x] && finder.obstacles.inside(mid(x, y), boxPad)) inside[y * w + x] = 0;
  // The chamfer distance transform: one pass forward and one pass backward.
  const depth = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) depth[i] = inside[i] ? Infinity : 0;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : depth[y * w + x]!);
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      depth[i] = Math.min(depth[i]!, at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + D, at(x + 1, y - 1) + D);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!inside[i]) continue;
      depth[i] = Math.min(depth[i]!, at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + D, at(x - 1, y + 1) + D);
    }
  const skeleton = new Uint8Array(w * h);
  const least = Math.max(1, (0.5 * radius) / c);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = depth[y * w + x]!;
      if (v < least) continue;
      for (const [dx, dy] of PAIRS) {
        const p = at(x + dx, y + dy);
        const q = at(x - dx, y - dy);
        if (v >= p && v >= q && (v > p || v > q)) {
          skeleton[y * w + x] = 1;
          break;
        }
      }
    }
  return { grid, depth, skeleton };
}

/** This function gives the middle of the skeleton cell nearest to `p`, within `reach` in units of the board, or `undefined`. */
export function nearestSkeleton(s: ShapeSkeleton, p: Point, reach: number): Point | undefined {
  const { grid: g, skeleton } = s;
  const cx = Math.floor((p.x - g.x0) / g.cell);
  const cy = Math.floor((p.y - g.y0) / g.cell);
  const r = Math.ceil(reach / g.cell);
  let best: Point | undefined;
  let bestD = Infinity;
  for (let y = Math.max(0, cy - r); y <= Math.min(g.h - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(g.w - 1, cx + r); x++) {
      if (!skeleton[y * g.w + x]) continue;
      const q = { x: g.x0 + (x + 0.5) * g.cell, y: g.y0 + (y + 0.5) * g.cell };
      const d = dist(p, q);
      if (d < bestD && d <= reach) [best, bestD] = [q, d];
    }
  return best;
}

/** This function gives the mean polyline of lines in one direction, with `k` points. */
export function meanLine(lines: readonly (readonly Point[])[], k: number): Point[] {
  const n = Math.max(2, Math.round(k));
  const sum = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  for (const l of lines)
    resample(l, n).forEach((p, i) => {
      sum[i]!.x += p.x;
      sum[i]!.y += p.y;
    });
  return sum.map((p) => ({ x: p.x / Math.max(1, lines.length), y: p.y / Math.max(1, lines.length) }));
}

/** This function gives the point of a polyline nearest to `p`. */
export function nearestOnLine(line: readonly Point[], p: Point): Point {
  let best = line[0]!;
  let bestD = dist(p, best);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const q = { x: a.x + u * dx, y: a.y + u * dy };
    const d = dist(p, q);
    if (d < bestD) [best, bestD] = [q, d];
  }
  return best;
}

/** This function gives the groups with `min` edges or more, each as its list of edges, in the order of the first edge of each group. */
export function bigGroups(groups: ReadonlyMap<string, EdgeGroup>, min: number): { key: string; edges: { edge: string; flip: boolean }[] }[] {
  const byKey = new Map<string, { edge: string; flip: boolean }[]>();
  for (const [edge, g] of groups) {
    const list = byKey.get(g.key);
    if (list) list.push({ edge, flip: g.flip });
    else byKey.set(g.key, [{ edge, flip: g.flip }]);
  }
  return [...byKey]
    .filter(([, list]) => list.length >= Math.max(2, min))
    .map(([key, edges]) => ({ key, edges }));
}

/**
 * This function gives the polylines of the skeleton-based edge bundling (SBEB, Ersoy, Hurter, Paulovich, Cantareiro and Telea 2011). The ends of each polyline stay.
 * In each step, each group of `minSize` edges or more draws its shape, and each inner point moves the share `attraction` toward its target.
 * The share falls to 0 at the distance `2 radius`. A Laplacian smoothing keeps each polyline smooth, and a point in a box moves out of it.
 * The edges outside such a group do not move.
 */
export function sbebLines(input: HighwayInput, finder: WayFinder, o: Readonly<SbebOptions>): Map<string, Point[]> {
  const radius = Math.max(1e-3, o.radius * boardUnit(input.graph));
  const lines = firstLines(input, finder, o.source, Math.max(4, 2 * o.cell));
  const groups = bigGroups(skeletonGroups(input, o.group), o.minSize).map((g) => ({ ...g, edges: g.edges.filter((m) => lines.has(m.edge)) }));
  const pad = finder.margin / 2;
  const a = Math.max(0, Math.min(1, o.attraction));
  const smooth = Math.max(0, Math.min(1, o.smoothing));
  for (let step = 0; step < Math.max(0, Math.round(o.steps)); step++) {
    for (const g of groups) {
      if (g.edges.length < 2) continue;
      const own = g.edges.map((m) => lines.get(m.edge)!);
      const target: (p: Point) => Point | undefined =
        o.target === "mean"
          ? ((mean) => (p: Point) => nearestOnLine(mean, p))(meanLine(g.edges.map((m, i) => (m.flip ? [...own[i]!].reverse() : own[i]!)), 33))
          : ((s) => (p: Point) => nearestSkeleton(s, p, 2 * radius))(shapeSkeleton(own, finder, radius, o.cell));
      g.edges.forEach((m, i) => {
        const l = own[i]!;
        const moved = l.map((p, j) => {
          if (j === 0 || j === l.length - 1) return p;
          const s = target(p);
          if (!s) return p;
          const k = a * Math.max(0, 1 - dist(p, s) / (2 * radius));
          return { x: p.x + k * (s.x - p.x), y: p.y + k * (s.y - p.y) };
        });
        const smoothed = moved.map((p, j) => {
          if (j === 0 || j === moved.length - 1 || smooth === 0) return p;
          const u = moved[j - 1]!;
          const v = moved[j + 1]!;
          return { x: (1 - smooth) * p.x + (smooth * (u.x + v.x)) / 2, y: (1 - smooth) * p.y + (smooth * (u.y + v.y)) / 2 };
        });
        lines.set(
          m.edge,
          smoothed.map((p, j) => (j === 0 || j === smoothed.length - 1 ? p : outOfBoxes(finder.obstacles, p, pad))),
        );
      });
    }
  }
  return lines;
}

/**
 * This function gives the highways of the skeleton-based edge bundling (HWY-009). The points of `sbebLines` snap to a grid of side `snap`.
 * The ways go through the corner graph, and each stretch that `minSize` ways share is a highway.
 */
export function sbebPlan(input: HighwayInput, o: Readonly<SbebOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const lines = sbebLines(input, finder, o);
  const waypoints = new Map([...lines].map(([edge, l]) => [edge, l.slice(1, -1)] as const));
  return tracePlan(input, finder, waypoints, { snap: o.snap, minSize: o.minSize, key: "sbeb" });
}
