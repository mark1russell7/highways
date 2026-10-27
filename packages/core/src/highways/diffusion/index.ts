import type { Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The options of the highway strategy `diffusion` (HWY-020 of the note on highways). */
export interface DiffusionOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The share of the density that each step of the diffusion takes from the links next to a link. The default is 0.25. */
  readonly a: number;
  /** The number of steps of the diffusion. The default is 3. */
  readonly steps: number;
  /** The weight of the density in the cost of a link. The default is 1. */
  readonly lambda: number;
  /** The power of the discount of a dense link. The default is 1. */
  readonly gamma: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `diffusion`. */
export const DIFFUSION_DEFAULTS: Readonly<Required<Omit<DiffusionOptions, "margin" | "k">>> = Object.freeze({ a: 0.25, steps: 3, lambda: 1, gamma: 1, minSize: 2 });

/**
 * This function gives the density of the edges on the links of the corner graph after the diffusion, as a share of the largest density.
 * The density of a link starts as the number of first ways on it. Each step mixes it with the mean density of the links that share a corner with it:
 * `rho_{k+1}(l) = (1 - a) rho_k(l) + a mean(rho_k(l'))`. The key of a link is `i * M + j` for the corners `i < j` of a graph of `M` corners.
 */
export function linkDensity(neighbours: (i: number) => readonly number[], corners: number, use: ReadonlyMap<number, number>, a: number, steps: number): Map<number, number> {
  const M = corners;
  const links: number[] = [];
  for (let i = 0; i < M; i++) for (const j of neighbours(i)) if (j > i) links.push(i * M + j);
  let rho = new Map<number, number>(links.map((l) => [l, use.get(l) ?? 0]));
  const share = Math.max(0, Math.min(1, a));
  for (let s = 0; s < Math.round(steps); s++) {
    // The sum of the densities and the number of the links at each corner.
    const sum = new Float64Array(M);
    const deg = new Int32Array(M);
    for (const [l, v] of rho) {
      const i = Math.floor(l / M);
      const j = l % M;
      sum[i] = sum[i]! + v;
      sum[j] = sum[j]! + v;
      deg[i] = deg[i]! + 1;
      deg[j] = deg[j]! + 1;
    }
    const next = new Map<number, number>();
    for (const [l, v] of rho) {
      const i = Math.floor(l / M);
      const j = l % M;
      const n = deg[i]! + deg[j]! - 2;
      const mean = n > 0 ? (sum[i]! + sum[j]! - 2 * v) / n : v;
      next.set(l, (1 - share) * v + share * mean);
    }
    rho = next;
  }
  let max = 0;
  for (const v of rho.values()) max = Math.max(max, v);
  if (max > 0) for (const [l, v] of rho) rho.set(l, v / max);
  return rho;
}

/**
 * This function gives the highways of the route-aware bundling on the corner graph (HWY-020).
 * The first ways of the edges give the density of each link. A diffusion along the graph smooths it.
 * Then each edge takes a shortest way where a dense link costs less: `cost(l) = len(l) / (1 + lambda rho(l))^gamma`, with `rho` from 0 to 1.
 * Each stretch that `minSize` ways or more share after the second pass is one highway. The highways stay on the links of the corner graph.
 */
export function diffusionPlan(input: HighwayInput, o: Readonly<DiffusionOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const id = new Map<Point, number>();
  corners.points.forEach((p, i) => id.set(p, i));
  const M = corners.points.length;
  const link = (i: number, j: number): number => (i < j ? i * M + j : j * M + i);
  const plugs = edgePlugs(input.graph);
  const ends = plugs.map(({ ps, pt }) => [finder.out(ps), finder.out(pt)] as const);
  // The first pass: the number of first ways on each link.
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
  const rho = linkDensity((i) => corners.neighbours(i), M, use, o.a, o.steps);
  const lambda = Math.max(0, o.lambda);
  const gamma = Math.max(0, o.gamma);
  const floor = 1 / Math.pow(1 + lambda, gamma);
  const cost = (i: number, j: number, d: number): number => d / Math.pow(1 + lambda * (rho.get(link(i, j)) ?? 0), gamma);
  // The second pass: the dense links cost less, so the ways come together on them.
  const ways: KeyedWay[] = [];
  plugs.forEach(({ edge }, n) => {
    const [a, b] = ends[n]!;
    const way = corners.path(a, b, cost, floor);
    if (way) ways.push({ edge: edge.id, key: "diffusion", points: way });
  });
  return sharedStretches(ways, { minSize: o.minSize, pull: (p) => corners.pull(p) });
}
