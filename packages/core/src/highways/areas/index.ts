import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, type Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { DensitySource } from "../kdeeb/index.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { bigGroups, firstLines, nearestOnLine, shapeSkeleton, skeletonGroups, type ShapeSkeleton, type SkeletonGroups } from "../sbeb/index.ts";
import { snapPlan, type SnapLine, type SnapMember } from "../snap.ts";

/** The rule of the half width of an area: the spread of the edges of the group, or the number of its lanes. */
export type AreaWidth = "spread" | "count";

/** The values of `AreaWidth`. */
export const AREA_WIDTHS: readonly AreaWidth[] = Object.freeze(["spread", "count"]);

/** The options of the highway strategy `areas` (HWY-010 of the notes). */
export interface AreaOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The clusterer of the groups. The default is `quickbundles`. */
  readonly group: SkeletonGroups;
  /** The lines of the edges that make the shape: their straight lines, or their first routes. The default is `lines`. */
  readonly source: DensitySource;
  /** The radius of the shape of a group, as a multiple of `boardUnit`. The default is 1.5. */
  readonly radius: number;
  /** The rule of the half width of the area. The default is `spread`. */
  readonly width: AreaWidth;
  /** The width of one lane for the rule `count`, in units of the board. The default is 4. */
  readonly laneWidth: number;
  /** The side of a cell of the image of the shape, in units of the board. The default is 4. */
  readonly cell: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `areas`. */
export const AREA_DEFAULTS: Readonly<Required<Omit<AreaOptions, "margin" | "k">>> = Object.freeze({
  group: "quickbundles",
  source: "lines",
  radius: 1.5,
  width: "spread",
  laneWidth: 4,
  cell: 4,
  minSize: 2,
});

/**
 * This function gives the longest path of the largest part of a skeleton, as the middles of its cells. The neighbours of a cell are its 8 neighbours.
 * The function finds the cell farthest from a first cell, then the cell farthest from that cell. A skeleton without cells gives an empty list.
 */
export function skeletonPath(s: ShapeSkeleton): Point[] {
  const { grid: g, skeleton } = s;
  const n = g.w * g.h;
  const part = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const neighbours = (i: number): number[] => {
    const x = i % g.w;
    const y = (i - x) / g.w;
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const u = x + dx;
        const v = y + dy;
        if (u >= 0 && v >= 0 && u < g.w && v < g.h && skeleton[v * g.w + u]) out.push(v * g.w + u);
      }
    return out;
  };
  for (let i = 0; i < n; i++) {
    if (!skeleton[i] || part[i]! >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    part[i] = id;
    while (stack.length > 0) {
      const c = stack.pop()!;
      size++;
      for (const j of neighbours(c))
        if (part[j]! < 0) {
          part[j] = id;
          stack.push(j);
        }
    }
    sizes.push(size);
  }
  if (sizes.length === 0) return [];
  const big = sizes.indexOf(Math.max(...sizes));
  const bfs = (from: number): { far: number; prev: Int32Array } => {
    const prev = new Int32Array(n).fill(-2);
    prev[from] = -1;
    const queue = [from];
    let far = from;
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q]!;
      far = c;
      for (const j of neighbours(c))
        if (prev[j] === -2) {
          prev[j] = c;
          queue.push(j);
        }
    }
    return { far, prev };
  };
  let first = -1;
  for (let i = 0; i < n && first < 0; i++) if (part[i] === big) first = i;
  const a = bfs(first).far;
  const { far: b, prev } = bfs(a);
  const path: Point[] = [];
  for (let c = b; c >= 0; c = prev[c]!) {
    const x = c % g.w;
    const y = (c - x) / g.w;
    path.push({ x: g.x0 + (x + 0.5) * g.cell, y: g.y0 + (y + 0.5) * g.cell });
  }
  return path;
}

/** This function gives the value at the share `q` of the sorted list, with a linear mix between two values. An empty list gives 0. */
function quantileOf(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const at = Math.max(0, Math.min(s.length - 1, q * (s.length - 1)));
  const i = Math.floor(at);
  const u = at - i;
  return i + 1 < s.length ? s[i]! * (1 - u) + s[i + 1]! * u : s[i]!;
}

/**
 * This function gives the highways of the image-based edge bundles (HWY-010, Telea and Ersoy 2010). Each group of edges is one area with one spine.
 * The spine goes through the corner graph between the two ends of the longest path of the skeleton of the shape of the group.
 * The area is the skeleton path with a half width: the 90th percentile of the distances of the points of the group to the path (`spread`),
 * or the number of lanes times half of `laneWidth` (`count`). The half width is at least the margin.
 * An edge joins the spine where its line goes into the area first, and it leaves the spine where its line comes out of the area last.
 */
export function areaPlan(input: HighwayInput, o: Readonly<AreaOptions>): HighwayPlan {
  const way: WayOptions = { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) };
  const finder = new WayFinder(input.graph.nodes, way);
  const radius = Math.max(1e-3, o.radius * boardUnit(input.graph));
  const lines = firstLines(input, finder, o.source, Math.max(4, 2 * o.cell));
  const snapLines: SnapLine[] = [];
  for (const g of bigGroups(skeletonGroups(input, o.group), o.minSize)) {
    const own = g.edges.filter((m) => lines.has(m.edge));
    if (own.length < Math.max(2, o.minSize)) continue;
    const path = skeletonPath(shapeSkeleton(own.map((m) => lines.get(m.edge)!), finder, radius, o.cell));
    if (path.length < 2 || dist(path[0]!, path[path.length - 1]!) <= finder.margin) continue;
    const spread = own.flatMap((m) => lines.get(m.edge)!.map((p) => dist(p, nearestOnLine(path, p))));
    const half = Math.max(finder.margin, o.width === "count" ? (own.length * o.laneWidth) / 2 : quantileOf(spread, 0.9));
    const members: SnapMember[] = [];
    for (const m of own) {
      const l = lines.get(m.edge)!;
      let first = -1;
      let last = -1;
      l.forEach((p, i) => {
        if (dist(p, nearestOnLine(path, p)) > half) return;
        if (first < 0) first = i;
        last = i;
      });
      if (first < 0 || last <= first) continue;
      members.push({ edge: m.edge, from: l[first]!, to: l[last]!, at: first / Math.max(1, l.length - 1) });
    }
    snapLines.push({ key: g.key, a: path[0]!, b: path[path.length - 1]!, members });
  }
  return snapPlan(input, snapLines, { ...way, minSize: o.minSize });
}
