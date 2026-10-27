import type { Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The options of the highway strategy `road-classes` (HWY-034 with EDA-050 of the notes). */
export interface RoadClassOptions extends Pick<WayOptions, "margin" | "k"> {
  /** A link is a highway link when its use is at this quantile of the use of the links, or higher. The default is 0.9. */
  readonly quantile: number;
  /** A highway link has this number of edges or more on it, and a highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
  /** The second pass gives each highway link this discount, as a share of its length. The default is 0.5. */
  readonly discount: number;
}

/** The default options of the strategy `road-classes`. */
export const ROAD_CLASS_DEFAULTS: Readonly<Required<Omit<RoadClassOptions, "margin" | "k">>> = Object.freeze({ quantile: 0.9, minSize: 2, discount: 0.5 });

/** This function gives the quantile `q` of a list of numbers, with the nearest rank. An empty list gives `Infinity`. */
function rank(values: readonly number[], q: number): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
}

/**
 * This function gives the highways of the road classes (HWY-034, EDA-050). It counts how many first ways use each link of the corner graph.
 * The links with a use at the quantile `quantile` or higher, and at least `minSize`, are the highway links.
 * They are the main roads of a road map.
 * A second pass routes each edge again, with the discount on the highway links, so more edges join them.
 * Each stretch of highway links that `minSize` ways or more share after the second pass is one highway.
 */
export function roadClassPlan(input: HighwayInput, o: Readonly<RoadClassOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const id = new Map<Point, number>();
  corners.points.forEach((p, i) => id.set(p, i));
  const M = corners.points.length;
  const link = (i: number, j: number): number => (i < j ? i * M + j : j * M + i);
  const plugs = edgePlugs(input.graph);
  const ends = plugs.map(({ ps, pt }) => [finder.out(ps), finder.out(pt)] as const);
  // The first pass: the use of each link between two corners.
  const use = new Map<number, number>();
  for (const [a, b] of ends) {
    const way = corners.path(a, b);
    if (!way) continue;
    const own = new Set<number>();
    for (let i = 1; i < way.length; i++) {
      const p = id.get(way[i - 1]!);
      const q = id.get(way[i]!);
      if (p !== undefined && q !== undefined) own.add(link(p, q));
    }
    for (const l of own) use.set(l, (use.get(l) ?? 0) + 1);
  }
  const floor = Math.max(2, o.minSize, rank([...use.values()], o.quantile));
  const highway = new Set<number>();
  for (const [l, n] of use) if (n >= floor) highway.add(l);
  if (highway.size === 0) return { highways: [] };
  // The second pass: the highway links cost less, so the edges near them join them.
  const share = Math.min(1, Math.max(0.05, 1 - o.discount));
  const cost = (i: number, j: number, d: number): number => (highway.has(link(i, j)) ? d * share : d);
  const ways: KeyedWay[] = [];
  plugs.forEach(({ edge }, n) => {
    const [a, b] = ends[n]!;
    const way = corners.path(a, b, cost, share);
    if (way) ways.push({ edge: edge.id, key: "road", points: way });
  });
  const onHighway = (a: Point, b: Point): boolean => {
    const p = id.get(a);
    const q = id.get(b);
    return p !== undefined && q !== undefined && highway.has(link(p, q));
  };
  return sharedStretches(ways, { minSize: o.minSize, link: onHighway, pull: (p) => corners.pull(p) });
}
