import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, polylineLength, type Point } from "../../geom.ts";
import { firstRoutes } from "../base.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The line of each edge that QuickBundles compares: its first route, or the straight line between its plugs. */
export type BundleLine = "routes" | "lines";

/** The order of the edges in the one pass: the order of the graph, or the longest line first. */
export type BundleOrder = "input" | "length";

/** The options of the highway strategy `quickbundles` (HWY-026 of the note on highways). */
export interface QuickBundlesOptions {
  /** An edge joins a cluster when its distance to the centroid is this value or less, in units of the board. The default is 3. */
  readonly theta: number;
  /** The number of points of each line after the resampling. The default is 12. */
  readonly points: number;
  /** The line of each edge. The default is `routes`. */
  readonly line: BundleLine;
  /** The order of the edges. The default is `input`, so an added edge does not change the clusters before it. */
  readonly order: BundleOrder;
  /** A cluster with this number of edges or more gets highways. The default is 2. */
  readonly minSize: number;
  /** The spine of each cluster. The default is `shared`. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `quickbundles`. */
export const QUICKBUNDLES_DEFAULTS: Readonly<QuickBundlesOptions> = Object.freeze({ theta: 3, points: 12, line: "routes", order: "input", minSize: 2, spine: "shared" });

/** This function gives `k` points at equal steps of length along a polyline, from its first point to its last point. */
export function resample(line: readonly Point[], k: number): Point[] {
  const n = Math.max(2, Math.round(k));
  if (line.length === 0) throw new Error("The polyline has no point.");
  if (line.length === 1) return Array.from({ length: n }, () => line[0]!);
  const at: number[] = [0];
  for (let i = 1; i < line.length; i++) at.push(at[i - 1]! + dist(line[i - 1]!, line[i]!));
  const total = at[at.length - 1]!;
  const out: Point[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (total * i) / (n - 1);
    while (j < line.length - 1 && at[j]! < s) j++;
    const a = line[j - 1]!;
    const b = line[j]!;
    const len = at[j]! - at[j - 1]!;
    const u = len > 0 ? Math.max(0, Math.min(1, (s - at[j - 1]!) / len)) : 0;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}

/**
 * This function gives the MDF distance of two lines with the same number of points: the mean distance of their points,
 * in the same direction or in the opposite direction, whichever is smaller. `flip` is `true` when the opposite direction is smaller.
 */
export function mdf(p: readonly Point[], q: readonly Point[]): { d: number; flip: boolean } {
  const n = p.length;
  let direct = 0;
  let back = 0;
  for (let i = 0; i < n; i++) {
    direct += dist(p[i]!, q[i]!);
    back += dist(p[i]!, q[n - 1 - i]!);
  }
  return back < direct ? { d: back / n, flip: true } : { d: direct / n, flip: false };
}

/**
 * This function gives the clusters of QuickBundles (Garyfallidis 2012) as groups of edges.
 * In one pass, each edge joins the cluster with the nearest centroid when the MDF distance is `theta` units or less. Else it starts a cluster.
 * The centroid is the running mean of the lines of the cluster, each in the direction of the centroid.
 */
export function quickBundles(input: HighwayInput, o: Readonly<QuickBundlesOptions>): Map<string, EdgeGroup> {
  const graph = input.graph;
  const limit = o.theta * boardUnit(graph);
  const k = Math.max(2, Math.round(o.points));
  const routes = o.line === "routes" ? firstRoutes(input) : undefined;
  const lines = edgePlugs(graph).map(({ edge, ps, pt }) => ({ edge: edge.id, line: resample(routes?.get(edge.id) ?? [ps.point, pt.point], k) }));
  if (o.order === "length") lines.sort((a, b) => polylineLength(b.line) - polylineLength(a.line) || (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
  const clusters: { sum: { x: number; y: number }[]; n: number; centroid: Point[] }[] = [];
  const groups = new Map<string, EdgeGroup>();
  for (const { edge, line } of lines) {
    let best = -1;
    let bestD = Infinity;
    let bestFlip = false;
    clusters.forEach((c, ci) => {
      const m = mdf(line, c.centroid);
      if (m.d < bestD) [best, bestD, bestFlip] = [ci, m.d, m.flip];
    });
    if (best < 0 || bestD > limit) {
      clusters.push({ sum: line.map((p) => ({ ...p })), n: 1, centroid: line });
      groups.set(edge, { key: `q${clusters.length - 1}`, flip: false });
      continue;
    }
    const c = clusters[best]!;
    const oriented = bestFlip ? [...line].reverse() : line;
    oriented.forEach((p, i) => {
      c.sum[i]!.x += p.x;
      c.sum[i]!.y += p.y;
    });
    c.n++;
    c.centroid = c.sum.map((p) => ({ x: p.x / c.n, y: p.y / c.n }));
    groups.set(edge, { key: `q${best}`, flip: bestFlip });
  }
  return groups;
}

/**
 * This function gives the highways of QuickBundles (HWY-026). The clusters of `quickBundles` with `minSize` edges or more get highways.
 * With the spine `shared`, the edges of each cluster share their ways through the corner graph. With `trunk`, each cluster gets one trunk.
 */
export function quickBundlesPlan(input: HighwayInput, o: Readonly<QuickBundlesOptions>): HighwayPlan {
  return groupedPlan(input, quickBundles(input, o), { spine: o.spine, minSize: o.minSize });
}
