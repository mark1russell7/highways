import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, polylineLength, type Point } from "../../geom.ts";
import { firstRoutes } from "../base.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { snapPlan, type SnapLine, type SnapMember } from "../snap.ts";
import { edgePlugs } from "../stretches.ts";

/** The characteristic points of the territories: the plugs, the bends of the first routes, or both. */
export type TerritoryPoints = "plugs" | "bends" | "both";

/** The values of `TerritoryPoints`. */
export const TERRITORY_POINTS: readonly TerritoryPoints[] = Object.freeze(["plugs", "bends", "both"]);

/** The options of the highway strategy `territories` (HWY-033 of the note on highways). */
export interface TerritoryOptions {
  /** The radius of a group of points, in units of the board. The default is 4. */
  readonly radius: number;
  /** A flow between two cells becomes a highway when this number of edges or more cross it. The default is 2. */
  readonly minSize: number;
  /** The characteristic points. The default is `both`. */
  readonly points: TerritoryPoints;
}

/** The default options of the strategy `territories`. */
export const TERRITORY_DEFAULTS: Readonly<TerritoryOptions> = Object.freeze({ radius: 4, minSize: 2, points: "both" });

/**
 * This function puts points into groups of the radius `r` (Andrienko and Andrienko 2011). Each point joins the group with the nearest centre within `r`.
 * Else it starts a new group. The centre of a group is the mean of its points. A second pass puts each point into the group of its nearest centre.
 * The result is the centres of the groups that keep points.
 */
export function pointGroups(points: readonly Point[], r: number): Point[] {
  const sums: { x: number; y: number; n: number }[] = [];
  const centre = (g: { x: number; y: number; n: number }): Point => ({ x: g.x / g.n, y: g.y / g.n });
  for (const p of points) {
    let best = -1;
    let bestD = Infinity;
    sums.forEach((g, i) => {
      const d = dist(p, centre(g));
      if (d < bestD) [best, bestD] = [i, d];
    });
    if (best >= 0 && bestD <= r) {
      const g = sums[best]!;
      g.x += p.x;
      g.y += p.y;
      g.n++;
    } else sums.push({ x: p.x, y: p.y, n: 1 });
  }
  const first = sums.map(centre);
  const again = first.map(() => ({ x: 0, y: 0, n: 0 }));
  for (const p of points) {
    const i = nearestCentre(first, p);
    again[i]!.x += p.x;
    again[i]!.y += p.y;
    again[i]!.n++;
  }
  return again.filter((g) => g.n > 0).map(centre);
}

/** This function gives the index of the centre nearest to `p`. The first of two equal centres wins. */
export function nearestCentre(centres: readonly Point[], p: Point): number {
  let best = -1;
  let bestD = Infinity;
  centres.forEach((c, i) => {
    const d = dist(p, c);
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** One crossing of a route from the cell `from` into the cell `to`, at the share `at` of the length of the route. */
export interface CellStep {
  readonly from: number;
  readonly to: number;
  readonly at: number;
}

/**
 * This function gives the crossings of the cells of a polyline. The cells are the Voronoi cells of the centres.
 * It samples the polyline at the spacing `step`, and gives each change of the nearest centre.
 */
export function cellSteps(line: readonly Point[], centres: readonly Point[], step: number): CellStep[] {
  const total = polylineLength(line);
  if (line.length < 2 || centres.length === 0 || total <= 0) return [];
  const out: CellStep[] = [];
  let cell = nearestCentre(centres, line[0]!);
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = dist(a, b);
    const n = Math.max(1, Math.ceil(len / Math.max(1e-6, step)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const c = nearestCentre(centres, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      if (c !== cell) {
        out.push({ from: cell, to: c, at: (walked + len * t) / total });
        cell = c;
      }
    }
    walked += len;
  }
  return out;
}

/**
 * This function gives the highways of the territories of the flows (HWY-033, Andrienko and Andrienko 2011).
 * The characteristic points form groups of the radius `radius`. The centres of the groups make Voronoi cells.
 * Each first route becomes a list of crossings between neighbour cells.
 *
 * A pair of cells with `minSize` crossings or more is a line from centre to centre. The edges that cross it snap to it. The centres of the cells are the interchanges.
 */
export function territoryPlan(input: HighwayInput, o: Readonly<TerritoryOptions>): HighwayPlan {
  const graph = input.graph;
  const unit = boardUnit(graph);
  const r = Math.max(0.5, o.radius) * unit;
  const routes = firstRoutes(input);
  const plugs = edgePlugs(graph);
  const points: Point[] = [];
  for (const { edge, ps, pt } of plugs) {
    if (o.points !== "bends") points.push(ps.point, pt.point);
    if (o.points !== "plugs") {
      const route = routes.get(edge.id) ?? [];
      for (let i = 1; i < route.length - 1; i++) points.push(route[i]!);
    }
  }
  if (points.length === 0) return { highways: [] };
  const centres = pointGroups(points, r);
  // The crossings of each pair of cells, in the order of the edges.
  const flows = new Map<string, { a: number; b: number; members: SnapMember[] }>();
  for (const { edge, ps, pt } of plugs) {
    const route = routes.get(edge.id) ?? [ps.point, pt.point];
    const seen = new Set<string>();
    for (const s of cellSteps(route, centres, r / 4)) {
      const [a, b] = s.from < s.to ? [s.from, s.to] : [s.to, s.from];
      const key = `${a}:${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const flow = flows.get(key) ?? { a, b, members: [] };
      flow.members.push({ edge: edge.id, from: centres[s.from]!, to: centres[s.to]!, at: s.at });
      flows.set(key, flow);
    }
  }
  const min = Math.max(2, Math.round(o.minSize));
  const lines: SnapLine[] = [...flows.values()]
    .filter((f) => f.members.length >= min)
    .sort((p, q) => p.a - q.a || p.b - q.b)
    .map((f) => ({ key: `t${f.a}-${f.b}`, a: centres[f.a]!, b: centres[f.b]!, members: f.members }));
  return snapPlan(input, lines, { minSize: min });
}
