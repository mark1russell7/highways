import { boardUnit } from "../../bench/measures/routes.ts";
import type { Point } from "../../geom.ts";
import { firstRoutes } from "../base.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { mdf, resample, type BundleLine } from "../quickbundles/index.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `scale-space` (HWY-053 of the note on highways). */
export interface ScaleSpaceOptions {
  /** The first scale, in units of the board. The default is 1.5. */
  readonly theta: number;
  /** The scale of each next scale is this value times the scale before it. The default is the root of 2. */
  readonly ratio: number;
  /** The number of scales. The default is 8. */
  readonly scales: number;
  /** The scale of the plan, from 0 (the first scale). With the defaults, the scale 2 is 3 units, as in the level 0 of `nested`. The default is 2. */
  readonly level: number;
  /** A cluster gets highways only when its persistence `ln(σ_death / σ_birth)` is this value or more. The default is 0.6: two steps of the root of 2. */
  readonly p0: number;
  /** The number of points of each line after the resampling. The default is 12. */
  readonly points: number;
  /** The line of each edge. The default is `routes`. */
  readonly line: BundleLine;
  /** A cluster with this number of edges or more gets highways. The default is 2. */
  readonly minSize: number;
  /** The spine of each cluster. The default is `shared`. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `scale-space`. */
export const SCALE_SPACE_DEFAULTS: Readonly<ScaleSpaceOptions> = Object.freeze({
  theta: 1.5,
  ratio: Math.SQRT2,
  scales: 8,
  level: 2,
  p0: 0.6,
  points: 12,
  line: "routes",
  minSize: 2,
  spine: "shared",
});

/** One cluster of one scale: its edges (as indices), and the scales of its birth and its death. */
export interface ScaleCluster {
  readonly members: readonly number[];
  /** The first scale of the cluster. A cluster of the first scale has the birth 0. */
  readonly birth: number;
  /** The first scale where the cluster joins a larger one. A cluster that lives past the last scale has the death `scales`. */
  readonly death: number;
}

/**
 * This function gives the clusters of the single linkage of `n` items at each scale. The distance `d(i, j)` of each pair is in `pairs`.
 * At the scale `s`, two items with a distance of `limits[s]` or less are in one cluster. Thus each cluster of a scale is in one cluster of each larger scale.
 * The result has the clusters of each scale with 2 items or more, with their birth and their death.
 */
export function scaleClusters(n: number, pairs: readonly { i: number; j: number; d: number }[], limits: readonly number[]): ScaleCluster[][] {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const sorted = [...pairs].sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  // The member sets of each scale, as sorted keys.
  const levels: number[][][] = [];
  let next = 0;
  for (const limit of limits) {
    for (; next < sorted.length && sorted[next]!.d <= limit; next++) {
      const a = find(sorted[next]!.i);
      const b = find(sorted[next]!.j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
    const sets = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const list = sets.get(r);
      if (list) list.push(i);
      else sets.set(r, [i]);
    }
    levels.push([...sets.values()].filter((s) => s.length >= 2));
  }
  const keyOf = (s: readonly number[]): string => s.join(",");
  const keys = levels.map((sets) => new Set(sets.map(keyOf)));
  return levels.map((sets, s) =>
    sets.map((members) => {
      const key = keyOf(members);
      let birth = s;
      while (birth > 0 && keys[birth - 1]!.has(key)) birth--;
      let death = s + 1;
      while (death < levels.length && keys[death]!.has(key)) death++;
      return { members, birth, death };
    }),
  );
}

/**
 * This function gives the groups of the edges at the scale `level` that persist (HWY-053). The scale `s` is `theta × ratio^s` units of the board.
 * A cluster of the level gets a group when its persistence `(death - birth) × ln(ratio)` is `p0` or more. Each edge of a group gets `flip` against the first edge of the group.
 */
export function scaleSpaceGroups(input: HighwayInput, o: Readonly<ScaleSpaceOptions>): Map<string, EdgeGroup> {
  const graph = input.graph;
  const unit = boardUnit(graph);
  const scales = Math.max(1, Math.round(o.scales));
  const ratio = Math.max(1.01, o.ratio);
  const limits = Array.from({ length: scales }, (_, s) => o.theta * ratio ** s * unit);
  const k = Math.max(2, Math.round(o.points));
  const routes = o.line === "routes" ? firstRoutes(input) : undefined;
  const lines: { edge: string; line: Point[] }[] = edgePlugs(graph).map(({ edge, ps, pt }) => ({ edge: edge.id, line: resample(routes?.get(edge.id) ?? [ps.point, pt.point], k) }));
  const top = limits[limits.length - 1]!;
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const d = mdf(lines[i]!.line, lines[j]!.line).d;
      if (d <= top) pairs.push({ i, j, d });
    }
  const level = Math.max(0, Math.min(scales - 1, Math.round(o.level)));
  const clusters = scaleClusters(lines.length, pairs, limits)[level]!;
  const groups = new Map<string, EdgeGroup>();
  clusters.forEach((c, ci) => {
    if ((c.death - c.birth) * Math.log(ratio) < o.p0 - 1e-9) return;
    const lead = lines[c.members[0]!]!.line;
    for (const i of c.members) groups.set(lines[i]!.edge, { key: `s${level}.${ci}`, flip: mdf(lines[i]!.line, lead).flip });
  });
  return groups;
}

/**
 * This function gives the highways of one scale of the scale space with persistence (HWY-053). Only the clusters that live over `p0` of the log scale get highways.
 * A short-lived cluster is noise, so a zoom level shows only the stable structure.
 */
export function scaleSpacePlan(input: HighwayInput, o: Readonly<ScaleSpaceOptions>): HighwayPlan {
  return groupedPlan(input, scaleSpaceGroups(input, o), { spine: o.spine, minSize: Math.max(2, Math.round(o.minSize)) });
}
