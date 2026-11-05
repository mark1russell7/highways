/**
 * The highway strategy `current-corridors` (NAT-037): corridors from current flow, after Newman (2005) and Brandes and Fleischer (2005).
 * Each edge sends one unit of current through the corner graph, as through a network of resistors. The links with the most current become corridors.
 */
import { quantile } from "@mark1russell7/rigor-statistics";
import { rng } from "../../fixtures.ts";
import { dist, type Point } from "../../geom.ts";
import type { CornerGraph } from "../../visibility.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { discountedCorridorPlan } from "../approval/index.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `current-corridors` (NAT-037). */
export interface CurrentCorridorOptions extends Pick<WayOptions, "margin" | "k"> {
  /** A link with current at this quantile of the links with current or more is a corridor, from 0.5 to 0.95. The default is 0.8. */
  readonly q: number;
  /** The second pass gives each corridor link this discount, as a share of its length, from 0.3 to 0.8. The default is 0.5. */
  readonly discount: number;
  /** A board with more edges than this number uses this number of seeded solves, from 8 to 32. The default is 16. */
  readonly sketch: number;
  /** The seed of the signs of the seeded solves. The default is 1. */
  readonly seed: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `current-corridors`. */
export const CURRENT_CORRIDOR_DEFAULTS: Readonly<Required<Omit<CurrentCorridorOptions, "margin" | "k">>> = Object.freeze({ q: 0.8, discount: 0.5, sketch: 16, seed: 1, minSize: 2 });

/** The largest number of steps of one solve. */
const SOLVE_STEPS = 200;

/** A solve stops when the size of its rest falls to this share of the size of its right side. */
const SOLVE_TOLERANCE = 1e-5;

/** The small conductance from each corner to the ground. A corner graph can have parts with no link between them, and this term keeps each solve defined. */
const GROUND = 1e-6;

/** The links of a corner graph, each one time, with `a < b`, and their conductances: 1 over their lengths. */
interface Network {
  readonly a: Int32Array;
  readonly b: Int32Array;
  readonly c: Float64Array;
  readonly diagonal: Float64Array;
}

/** This function gives the network of the corner graph. */
function networkOf(corners: CornerGraph): Network {
  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  const n = corners.points.length;
  const diagonal = new Float64Array(n).fill(GROUND);
  for (let i = 0; i < n; i++) {
    for (const j of corners.neighbours(i)) {
      if (j <= i) continue;
      const g = 1 / Math.max(1e-9, dist(corners.points[i]!, corners.points[j]!));
      a.push(i);
      b.push(j);
      c.push(g);
      diagonal[i] = diagonal[i]! + g;
      diagonal[j] = diagonal[j]! + g;
    }
  }
  return { a: Int32Array.from(a), b: Int32Array.from(b), c: Float64Array.from(c), diagonal };
}

/** This function gives the conjugate gradient solve of `(L + GROUND) p = rhs`, with the diagonal as its preconditioner. */
function solve(net: Network, rhs: Float64Array): Float64Array {
  const n = rhs.length;
  const times = (v: Float64Array, out: Float64Array): void => {
    for (let i = 0; i < n; i++) out[i] = GROUND * v[i]!;
    for (let l = 0; l < net.a.length; l++) {
      const i = net.a[l]!;
      const j = net.b[l]!;
      const flow = net.c[l]! * (v[i]! - v[j]!);
      out[i] = out[i]! + flow;
      out[j] = out[j]! - flow;
    }
  };
  const p = new Float64Array(n);
  const rest = Float64Array.from(rhs);
  const z = new Float64Array(n);
  const hit = new Float64Array(n);
  let rz = 0;
  let size = 0;
  for (let i = 0; i < n; i++) {
    z[i] = rest[i]! / net.diagonal[i]!;
    rz += rest[i]! * z[i]!;
    size += rest[i]! * rest[i]!;
  }
  const stop = SOLVE_TOLERANCE * SOLVE_TOLERANCE * size;
  const d = Float64Array.from(z);
  for (let step = 0; step < SOLVE_STEPS && size > stop; step++) {
    times(d, hit);
    let dHit = 0;
    for (let i = 0; i < n; i++) dHit += d[i]! * hit[i]!;
    if (dHit <= 0) break;
    const alpha = rz / dHit;
    let nextRz = 0;
    size = 0;
    for (let i = 0; i < n; i++) {
      p[i] = p[i]! + alpha * d[i]!;
      rest[i] = rest[i]! - alpha * hit[i]!;
      z[i] = rest[i]! / net.diagonal[i]!;
      nextRz += rest[i]! * z[i]!;
      size += rest[i]! * rest[i]!;
    }
    const beta = nextRz / rz;
    rz = nextRz;
    for (let i = 0; i < n; i++) d[i] = z[i]! + beta * d[i]!;
  }
  return p;
}

/**
 * This function gives the current of each link of the corner graph, for one way for each pair of points. The pairs with a clear line send no current.
 * With `sketch` pairs or fewer, one solve for each pair gives `I = Σ_e |c (p_i - p_j)|` (NAT-037).
 * With more pairs, `sketch` solves with seeded signs give the size `sqrt(mean_s (c (p_i - p_j))²)`. This value estimates the root of the sum of squares over the pairs.
 * The result has one value for each key `i × M + j` with `i < j`, and a link with no current is not in the map.
 */
export function linkCurrents(corners: CornerGraph, pairs: readonly (readonly [Point, Point])[], o: Readonly<Pick<CurrentCorridorOptions, "sketch" | "seed">>): Map<number, number> {
  const M = corners.points.length;
  const out = new Map<number, number>();
  if (pairs.length === 0 || M === 0) return out;
  const net = networkOf(corners);
  const poles = pairs.map(([a, b]) => [corners.nearest(a), corners.nearest(b)] as const).filter(([i, j]) => i >= 0 && j >= 0 && i !== j);
  const total = new Float64Array(net.a.length);
  const sketch = Math.max(1, Math.floor(o.sketch));
  const exact = poles.length <= sketch;
  const random = rng(o.seed);
  const solves = exact ? poles.length : sketch;
  for (let s = 0; s < solves; s++) {
    const rhs = new Float64Array(M);
    if (exact) {
      const [i, j] = poles[s]!;
      rhs[i] = 1;
      rhs[j] = -1;
    } else {
      for (const [i, j] of poles) {
        const sign = random() < 0.5 ? -1 : 1;
        rhs[i] = rhs[i]! + sign;
        rhs[j] = rhs[j]! - sign;
      }
    }
    const p = solve(net, rhs);
    for (let l = 0; l < total.length; l++) {
      const flow = net.c[l]! * (p[net.a[l]!]! - p[net.b[l]!]!);
      total[l] = total[l]! + (exact ? Math.abs(flow) : flow * flow);
    }
  }
  for (let l = 0; l < total.length; l++) {
    const v = exact ? total[l]! : Math.sqrt(total[l]! / solves);
    if (v > 1e-12) out.set(net.a[l]! * M + net.b[l]!, v);
  }
  return out;
}

/** This function gives the links with current at the `q` quantile of the links with current, or more. */
export function corridorLinks(currents: ReadonlyMap<number, number>, q: number): Set<number> {
  if (currents.size === 0) return new Set();
  const limit = quantile([...currents.values()], q, "higher");
  return new Set([...currents].filter(([, v]) => v >= limit).map(([k]) => k));
}

/**
 * This function gives the highways of the corridors of NAT-037. The edges send their current, and the links at the `q` quantile or more become corridors.
 * The edges route again with the discount on the corridors, as in `approval`. Each stretch on the corridors with `minSize` edges or more is a highway.
 */
export function currentCorridorPlan(input: HighwayInput, o: Readonly<CurrentCorridorOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const plugs = edgePlugs(input.graph);
  const pairs: (readonly [Point, Point])[] = [];
  for (const { ps, pt } of plugs) {
    const a = finder.out(ps);
    const b = finder.out(pt);
    if (!finder.obstacles.clear(a, b, finder.margin)) pairs.push([a, b]);
  }
  const picked = corridorLinks(linkCurrents(finder.corners, pairs, o), o.q);
  return picked.size === 0 ? { highways: [] } : discountedCorridorPlan(finder, plugs, picked, o);
}
