import { dist, polylineLength, turns, type Point } from "../../geom.ts";
import { rng } from "../../fixtures.ts";
import { Grid } from "../../grid.ts";
import { nodeIndex, type Graph, type Route } from "../../model.ts";
import { nearestSide } from "../../plugs.ts";
import { TOLERANCE } from "../properties.ts";
import { quantile } from "./stats.ts";

/** A drawn segment: a pair of points. */
export type DrawnSegment = readonly [Point, Point];

const key = (p: Point): string => `${Math.round(p.x * 8)},${Math.round(p.y * 8)}`;

/**
 * This function gives the drawn segments of the routes: one segment for each distinct pair of ends.
 * A segment that several routes share is one drawn segment, as in `measureQuality`.
 */
export function drawnSegments(routes: readonly Route[]): DrawnSegment[] {
  const segs: DrawnSegment[] = [];
  const seen = new Set<string>();
  for (const r of routes) {
    const p = r.points;
    for (let i = 1; i < p.length; i++) {
      const ka = key(p[i - 1]!);
      const kb = key(p[i]!);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(k)) continue;
      seen.add(k);
      segs.push([p[i - 1]!, p[i]!]);
    }
  }
  return segs;
}

/** This function gives the key of the drawn segment between two points. Two routes share a segment when they give the same key. */
export function segmentKey(a: Point, b: Point): string | undefined {
  const ka = key(a);
  const kb = key(b);
  if (ka === kb) return undefined;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * This function gives the unit of length of a board: the median of the short sides of the boxes of the nodes.
 * A length divided by the unit has no unit, so boards of different sizes compare. The unit of a board without nodes is 1.
 */
export function boardUnit(graph: Graph): number {
  if (graph.nodes.length === 0) return 1;
  const u = quantile(
    graph.nodes.map((n) => Math.min(n.box.w, n.box.h)),
    0.5,
  );
  return u > 0 ? u : 1;
}

/** The crossings of a set of drawn segments and their angles (R1 and R2 of MEAS0). */
export interface CrossingAngles {
  /** The number of crossings (R1). It is the same value as `crossings` of `measureQuality`. */
  readonly crossings: number;
  /** This value is true when the values come from a sample of the segments. */
  readonly estimated: boolean;
  /** The mean angle of a crossing, divided by 90 degrees (R2). The scale is 0 to 1, and higher is better. A set without crossings gives 1. */
  readonly mean: number;
  /** The smallest angle of a crossing, in degrees from 0 to 90 (R2). Higher is better. A set without crossings gives 90. */
  readonly min: number;
}

const EXACT_CROSSINGS = 20_000;
const SAMPLE = 2_000;

/** This function gives the angle between two segments, in degrees from 0 to 90. */
export function crossingAngle(a: Point, b: Point, c: Point, d: Point): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;
  const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (l === 0) return 0;
  return (Math.acos(Math.min(1, Math.abs(ux * vx + uy * vy) / l)) * 180) / Math.PI;
}

/**
 * This function measures the crossings of a set of segments and their angles (R1 and R2 of MEAS0).
 * It uses the grid and the sample of `countCrossings`. Above 20 000 segments, a seeded sample of 2 000 segments gives an estimate.
 * The cost is `n log n`.
 */
export function crossingAngles(segs: readonly DrawnSegment[]): CrossingAngles {
  if (segs.length < 2) return { crossings: 0, estimated: false, mean: 1, min: 90 };
  const len = segs.reduce((s, [a, b]) => s + dist(a, b), 0) / segs.length;
  const grid = new Grid<number>(Math.max(20, len));
  segs.forEach(([a, b], i) => grid.addSegment(i, a, b));
  const exact = segs.length <= EXACT_CROSSINGS;
  const R = rng(segs.length);
  const pick = exact ? segs.map((_, i) => i) : Array.from({ length: SAMPLE }, () => Math.floor(R() * segs.length));
  let count = 0;
  let sum = 0;
  let min = 90;
  for (const i of pick) {
    const [a, b] = segs[i]!;
    grid.querySegment(a, b, 0, (j) => {
      if (exact && j <= i) return;
      if (j === i) return;
      const [c, d] = segs[j]!;
      if (!segmentsCrossInside(a, b, c, d)) return;
      count++;
      const t = crossingAngle(a, b, c, d);
      sum += t;
      min = Math.min(min, t);
    });
  }
  const crossings = exact ? count : Math.round((count * segs.length) / (2 * pick.length));
  return { crossings, estimated: !exact, mean: count ? sum / count / 90 : 1, min: count ? min : 90 };
}

const orient = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** This test is the test of `segmentsCross`, so the count of `crossingAngles` is the count of `countCrossings`. */
function segmentsCrossInside(a: Point, b: Point, c: Point, d: Point): boolean {
  return orient(c, d, a) * orient(c, d, b) < 0 && orient(a, b, c) * orient(a, b, d) < 0;
}

/** The total turn of the routes (R4 of MEAS0). */
export interface TotalTurn {
  /** The mean over the routes of `T(r) = Σ abs(φ_i) / π`, in half turns. Lower is better. */
  readonly mean: number;
  /** The largest turn at one vertex of a route, in degrees from 0 to 180. Lower is better. */
  readonly max: number;
}

/** This function measures the total turn of the routes (R4 of MEAS0). A path that goes straight on has 0. The cost is linear. */
export function totalTurn(routes: readonly Route[]): TotalTurn {
  let sum = 0;
  let max = 0;
  for (const r of routes) {
    let t = 0;
    for (const phi of turns(r.points)) {
      t += Math.abs(phi);
      max = Math.max(max, Math.abs(phi));
    }
    sum += t / Math.PI;
  }
  return { mean: routes.length ? sum / routes.length : 0, max: (max * 180) / Math.PI };
}

/** The spread of the detour of the routes (R5 of MEAS0). */
export interface DetourSpread {
  /** The median of `δ(e) = L(r_e) / span(e)`. */
  readonly median: number;
  /** The `0.95` quantile of `δ(e)`: the tail of bad routes. */
  readonly q95: number;
  readonly mean: number;
}

/**
 * This function measures the spread of the detour `δ(e) = L(r_e) / span(e)` of the routes (R5 of MEAS0).
 * A route with ends nearer than 1 unit does not count. Each value is 1 or more, and lower is better. The cost is linear.
 */
export function detourSpread(routes: readonly Route[]): DetourSpread {
  const d: number[] = [];
  for (const r of routes) {
    const p = r.points;
    if (p.length < 2) continue;
    const span = dist(p[0]!, p[p.length - 1]!);
    if (span > 1) d.push(polylineLength(p) / span);
  }
  if (d.length === 0) return { median: 1, q95: 1, mean: 1 };
  return { median: quantile(d, 0.5), q95: quantile(d, 0.95), mean: d.reduce((s, x) => s + x, 0) / d.length };
}

/** The spacing of the plugs on the sides of the boxes (R11 of MEAS0). */
export interface PlugSpacing {
  /** The smallest spacing of a side. The scale is 0 to 1, and higher is better. A value of 1 is even spacing. */
  readonly min: number;
  /** The `0.05` quantile of the spacing of the sides. */
  readonly q05: number;
  /** The number of sides with two plugs or more. */
  readonly sides: number;
}

/**
 * This function measures the spacing of the plugs on each side of each box (R11 of MEAS0), the angular resolution of a box.
 * For a side with `k` distinct plugs, `ps = min gap / (side / (k + 1))`, with a limit of 1.
 * Two ends nearer than `TOLERANCE` are one plug, because a bundle shares its plug. An end farther than 1 unit from the side does not count.
 * Without a side with two plugs, each value is 1. The cost is `n log n`.
 */
export function plugSpacing(graph: Graph, routes: readonly Route[]): PlugSpacing {
  const byId = nodeIndex(graph);
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const at = new Map<string, number[]>();
  const add = (nodeId: string, p: Point): void => {
    const n = byId.get(nodeId);
    if (!n) return;
    const b = n.box;
    const side = nearestSide(b, p);
    const off = side === "north" ? Math.abs(p.y - b.y) : side === "south" ? Math.abs(p.y - b.y - b.h) : side === "west" ? Math.abs(p.x - b.x) : Math.abs(p.x - b.x - b.w);
    if (off > 1) return;
    const pos = side === "north" || side === "south" ? p.x - b.x : p.y - b.y;
    const k = `${nodeId}\u0000${side}`;
    const list = at.get(k);
    if (list) list.push(pos);
    else at.set(k, [pos]);
  };
  for (const r of routes) {
    const e = edges.get(r.edge);
    const p = r.points;
    if (!e || p.length < 2) continue;
    add(e.source.node, p[0]!);
    add(e.target.node, p[p.length - 1]!);
  }
  const values: number[] = [];
  for (const [k, list] of at) {
    const node = byId.get(k.slice(0, k.indexOf("\u0000")))!;
    const side = k.slice(k.indexOf("\u0000") + 1);
    const length = side === "north" || side === "south" ? node.box.w : node.box.h;
    list.sort((a, b) => a - b);
    const plugs: number[] = [];
    for (const x of list) if (plugs.length === 0 || x - plugs[plugs.length - 1]! > TOLERANCE) plugs.push(x);
    if (plugs.length < 2 || length <= 0) continue;
    let gap = Infinity;
    for (let i = 1; i < plugs.length; i++) gap = Math.min(gap, plugs[i]! - plugs[i - 1]!);
    values.push(Math.min(1, gap / (length / (plugs.length + 1))));
  }
  if (values.length === 0) return { min: 1, q05: 1, sides: 0 };
  return { min: values.reduce((m, x) => Math.min(m, x), 1), q05: quantile(values, 0.05), sides: values.length };
}
