import { boardUnit } from "../../bench/measures/routes.ts";
import { polylineLength, type Point } from "../../geom.ts";
import { firstRoutes } from "../base.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { mdf, resample, type BundleLine, type BundleOrder } from "../quickbundles/index.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `nested` (HWY-052 of the note on highways). */
export interface NestedOptions {
  /** The scale of the closest level, in units of the board. An edge joins a cluster when its distance to the centroid is this value or less. The default is 3. */
  readonly theta: number;
  /** The scale of each level is this value times the scale of the next closer level. The default is 2. */
  readonly ratio: number;
  /** The number of levels. The default is 3. */
  readonly levels: number;
  /** The level of the plan. Level 0 is the closest level, and level `levels - 1` is the far level. The default is 0. */
  readonly level: number;
  /** The number of points of each line after the resampling. The default is 12. */
  readonly points: number;
  /** The line of each edge. The default is `routes`. */
  readonly line: BundleLine;
  /** The order of the edges. The default is `input`. */
  readonly order: BundleOrder;
  /** A cluster with this number of edges or more gets highways. The default is 2. */
  readonly minSize: number;
  /** The spine of each cluster. The default is `shared`. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `nested`. */
export const NESTED_DEFAULTS: Readonly<NestedOptions> = Object.freeze({
  theta: 3,
  ratio: 2,
  levels: 3,
  level: 0,
  points: 12,
  line: "routes",
  order: "input",
  minSize: 2,
  spine: "shared",
});

interface Line {
  readonly edge: string;
  readonly line: readonly Point[];
}

/**
 * This function puts lines in clusters in one pass, as QuickBundles does. Each line joins the cluster with the nearest centroid when the distance is `limit` or less.
 * It gives the index of the cluster of each line, and `flip` when the line goes against the centroid.
 */
function clusterLines(lines: readonly Line[], limit: number): { cluster: number; flip: boolean }[] {
  const clusters: { sum: { x: number; y: number }[]; n: number; centroid: Point[] }[] = [];
  return lines.map(({ line }) => {
    let best = -1;
    let bestD = Infinity;
    let bestFlip = false;
    clusters.forEach((c, ci) => {
      const m = mdf(line, c.centroid);
      if (m.d < bestD) [best, bestD, bestFlip] = [ci, m.d, m.flip];
    });
    if (best < 0 || bestD > limit) {
      clusters.push({ sum: line.map((p) => ({ ...p })), n: 1, centroid: [...line] });
      return { cluster: clusters.length - 1, flip: false };
    }
    const c = clusters[best]!;
    const oriented = bestFlip ? [...line].reverse() : line;
    oriented.forEach((p, i) => {
      c.sum[i]!.x += p.x;
      c.sum[i]!.y += p.y;
    });
    c.n++;
    c.centroid = c.sum.map((p) => ({ x: p.x / c.n, y: p.y / c.n }));
    return { cluster: best, flip: bestFlip };
  });
}

/**
 * This function gives the groups of edges of each level, from the closest level (index 0) to the far level.
 * The far level puts all the edges in clusters at the scale `theta × ratio^(levels - 1)`.
 * Each closer level puts the edges of each cluster of the level above in clusters, at its own scale. Thus each group of a level is in one group of the level above.
 */
export function nestedGroups(input: HighwayInput, o: Readonly<NestedOptions>): Map<string, EdgeGroup>[] {
  const graph = input.graph;
  const unit = boardUnit(graph);
  const levels = Math.max(1, Math.round(o.levels));
  const k = Math.max(2, Math.round(o.points));
  const routes = o.line === "routes" ? firstRoutes(input) : undefined;
  const lines: Line[] = edgePlugs(graph).map(({ edge, ps, pt }) => ({ edge: edge.id, line: resample(routes?.get(edge.id) ?? [ps.point, pt.point], k) }));
  if (o.order === "length") lines.sort((a, b) => polylineLength(b.line) - polylineLength(a.line) || (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
  const out: Map<string, EdgeGroup>[] = [];
  // Each part is a list of lines with one key of the level above. The far level has one part with all the lines.
  let parts: { key: string; lines: Line[] }[] = [{ key: "n", lines }];
  for (let d = levels - 1; d >= 0; d--) {
    const limit = o.theta * o.ratio ** d * unit;
    const groups = new Map<string, EdgeGroup>();
    const next: { key: string; lines: Line[] }[] = [];
    for (const part of parts) {
      const found = clusterLines(part.lines, limit);
      const children = new Map<number, Line[]>();
      found.forEach(({ cluster, flip }, i) => {
        const key = `${part.key}.${cluster}`;
        groups.set(part.lines[i]!.edge, { key, flip });
        const list = children.get(cluster);
        if (list) list.push(part.lines[i]!);
        else children.set(cluster, [part.lines[i]!]);
      });
      for (const [cluster, list] of children) next.push({ key: `${part.key}.${cluster}`, lines: list });
    }
    out.unshift(groups);
    parts = next;
  }
  return out;
}

/**
 * This function gives the number of groups of the closer level `fine` with edges in two groups or more of the level `coarse`.
 * An edge that is not in `coarse` does not count. The groups of `nestedGroups` give 0.
 */
export function nestingViolations(coarse: ReadonlyMap<string, EdgeGroup>, fine: ReadonlyMap<string, EdgeGroup>): number {
  const parents = new Map<string, Set<string>>();
  for (const [edge, g] of fine) {
    const up = coarse.get(edge);
    if (!up) continue;
    const set = parents.get(g.key);
    if (set) set.add(up.key);
    else parents.set(g.key, new Set([up.key]));
  }
  let n = 0;
  for (const set of parents.values()) if (set.size > 1) n++;
  return n;
}

/**
 * This function gives the highways of one level of the nested clusters (HWY-052). The level is `o.level`, with 0 as the closest level.
 * The clusters of that level with `minSize` edges or more get highways, as in the strategy `quickbundles`.
 */
export function nestedPlan(input: HighwayInput, o: Readonly<NestedOptions>): HighwayPlan {
  const levels = nestedGroups(input, o);
  const level = Math.max(0, Math.min(levels.length - 1, Math.round(o.level)));
  return groupedPlan(input, levels[level]!, { spine: o.spine, minSize: o.minSize });
}
