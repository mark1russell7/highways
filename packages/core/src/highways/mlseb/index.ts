import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, type Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { firstRoutes } from "../base.ts";
import type { DensitySource } from "../kdeeb/index.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { resample } from "../quickbundles/index.ts";
import { edgePlugs } from "../stretches.ts";
import { outOfBoxes, tracePlan } from "../trace.ts";

/** The local fit of the moving least squares: a line, or a parabola in the frame of the line. */
export type MlsFit = "line" | "parabola";

/** The values of `MlsFit`. */
export const MLS_FITS: readonly MlsFit[] = Object.freeze(["line", "parabola"]);

/** The options of the highway strategy `mlseb` (HWY-008 of the notes). */
export interface MlsebOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The first lines of the edges: their straight lines, or their first routes. The default is `lines`. */
  readonly source: DensitySource;
  /** The radius of the fit at the first step, as a multiple of `boardUnit`: the median short side of the boxes. The default is 2. */
  readonly radius: number;
  /** Each step multiplies the radius by this value. The default is 0.8. */
  readonly decay: number;
  /** The number of steps. The default is 6. */
  readonly steps: number;
  /** The local fit. The default is `line`. */
  readonly fit: MlsFit;
  /** The weight of the angle, from 0 to 1. With 1, a sample at a right angle to the point has no weight. The default is 1. */
  readonly angleWeight: number;
  /** The spacing of the sample points of each edge, in units of the board. The default is 8. */
  readonly spacing: number;
  /** The side of the grid that the points of the edges snap to after the steps, in units of the board. The default is 8. */
  readonly snap: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `mlseb`. */
export const MLSEB_DEFAULTS: Readonly<Required<Omit<MlsebOptions, "margin" | "k">>> = Object.freeze({
  source: "lines",
  radius: 2,
  decay: 0.8,
  steps: 6,
  fit: "line",
  angleWeight: 1,
  spacing: 8,
  snap: 8,
  minSize: 2,
});

/** One sample point of an edge, with the unit tangent of its edge there. */
interface Sample {
  readonly p: Point;
  readonly tx: number;
  readonly ty: number;
}

/** This function gives the unit tangent of a polyline at its point `i`, from the point before it to the point after it. */
function tangent(line: readonly Point[], i: number): { tx: number; ty: number } {
  const a = line[Math.max(0, i - 1)]!;
  const b = line[Math.min(line.length - 1, i + 1)]!;
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return l > 1e-12 ? { tx: (b.x - a.x) / l, ty: (b.y - a.y) / l } : { tx: 1, ty: 0 };
}

/**
 * This function gives the point of the moving least squares fit at the point `p`. The weight of a sample `q` is `exp(-|q-p|^2 / r^2)`.
 * The angle term multiplies it by `1 - a + a |cos|`, with `cos` the cosine of the angle between the two tangents.
 * The fit `line` gives the projection of `p` on the weighted line of the samples. The fit `parabola` fits `s = c0 + c1 t + c2 t^2` in the frame of that line.
 * Without weight, the function gives `p`.
 */
export function mlsPoint(p: Point, t: { tx: number; ty: number }, near: readonly Sample[], r: number, angleWeight: number, fit: MlsFit): Point {
  const a = Math.max(0, Math.min(1, angleWeight));
  const ws: number[] = [];
  let sw = 0;
  let cx = 0;
  let cy = 0;
  for (const s of near) {
    const d2 = (s.p.x - p.x) ** 2 + (s.p.y - p.y) ** 2;
    const w = Math.exp(-d2 / (r * r)) * (1 - a + a * Math.abs(s.tx * t.tx + s.ty * t.ty));
    ws.push(w);
    sw += w;
    cx += w * s.p.x;
    cy += w * s.p.y;
  }
  if (sw <= 1e-12) return p;
  cx /= sw;
  cy /= sw;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  near.forEach((s, i) => {
    const w = ws[i]!;
    sxx += w * (s.p.x - cx) ** 2;
    syy += w * (s.p.y - cy) ** 2;
    sxy += w * (s.p.x - cx) * (s.p.y - cy);
  });
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const tp = (p.x - cx) * ux + (p.y - cy) * uy;
  if (fit === "line") return { x: cx + tp * ux, y: cy + tp * uy };
  // The parabola: the normal equations of the weighted least squares in the frame (u, n), with n = (-uy, ux).
  const m = [0, 0, 0, 0, 0];
  const v = [0, 0, 0];
  near.forEach((s, i) => {
    const w = ws[i]!;
    const tq = (s.p.x - cx) * ux + (s.p.y - cy) * uy;
    const sq = -(s.p.x - cx) * uy + (s.p.y - cy) * ux;
    let pw = w;
    for (let k = 0; k < 5; k++) {
      m[k] = m[k]! + pw;
      if (k < 3) v[k] = v[k]! + pw * sq;
      pw *= tq;
    }
  });
  const A = [
    [m[0]!, m[1]!, m[2]!],
    [m[1]!, m[2]!, m[3]!],
    [m[2]!, m[3]!, m[4]!],
  ];
  const c = solve3(A, v);
  if (!c) return { x: cx + tp * ux, y: cy + tp * uy };
  const sp = c[0]! + c[1]! * tp + c[2]! * tp * tp;
  return { x: cx + tp * ux - sp * uy, y: cy + tp * uy + sp * ux };
}

/** This function solves a system of three linear equations by Cramer's rule. A system without one solution gives `undefined`. */
function solve3(A: readonly (readonly number[])[], b: readonly number[]): number[] | undefined {
  const det = (m: readonly (readonly number[])[]): number =>
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const d = det(A);
  const scale = Math.abs(A[0]![0]!) * Math.abs(A[1]![1]!) * Math.abs(A[2]![2]!);
  if (!Number.isFinite(d) || Math.abs(d) <= 1e-12 * Math.max(1, scale)) return undefined;
  return [0, 1, 2].map((k) => det(A.map((row, i) => row.map((x, j) => (j === k ? b[i]! : x)))) / d);
}

/**
 * This function gives the polylines of the moving least squares bundling (MLSEB, Wu, Zeng, Zhu and Yu 2017). The ends of each polyline stay.
 * In each step, each inner point moves to the local fit of the samples of all edges within the radius. Then the radius shrinks by `decay`.
 * A move is at most the radius. A point in a box moves out of it.
 */
export function mlsebLines(input: HighwayInput, finder: WayFinder, o: Readonly<MlsebOptions>): Map<string, Point[]> {
  const plugs = edgePlugs(input.graph);
  const out = new Map<string, Point[]>();
  if (plugs.length === 0) return out;
  const routes = o.source === "routes" ? firstRoutes(input) : undefined;
  const spacing = Math.max(1e-3, o.spacing);
  let lines: Point[][] = plugs.map(({ edge, ps, pt }) => {
    const a = finder.out(ps);
    const b = finder.out(pt);
    const route = routes?.get(edge.id);
    const base = route && route.length > 2 ? [a, ...route.slice(1, -1), b] : [a, b];
    let len = 0;
    for (let i = 1; i < base.length; i++) len += dist(base[i - 1]!, base[i]!);
    return resample(base, Math.max(2, Math.min(129, Math.ceil(len / spacing) + 1)));
  });
  const pad = finder.margin / 2;
  let r = Math.max(1e-3, o.radius * boardUnit(input.graph));
  for (let step = 0; step < Math.max(0, Math.round(o.steps)); step++) {
    // The grid of the samples, with cells of side `r`. A sample within `2 r` is in the 5 by 5 cells around a point.
    const grid = new Map<string, Sample[]>();
    const cellOf = (p: Point): [number, number] => [Math.floor(p.x / r), Math.floor(p.y / r)];
    for (const l of lines)
      l.forEach((p, i) => {
        const [gx, gy] = cellOf(p);
        const k = `${gx},${gy}`;
        const s = { p, ...tangent(l, i) };
        const list = grid.get(k);
        if (list) list.push(s);
        else grid.set(k, [s]);
      });
    const reach = 2 * r;
    lines = lines.map((l) =>
      l.map((p, i) => {
        if (i === 0 || i === l.length - 1) return p;
        const [gx, gy] = cellOf(p);
        const near: Sample[] = [];
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) for (const s of grid.get(`${gx + dx},${gy + dy}`) ?? []) if (dist(s.p, p) <= reach) near.push(s);
        let q = mlsPoint(p, tangent(l, i), near, r, o.angleWeight, o.fit);
        const d = dist(p, q);
        if (d > r) q = { x: p.x + ((q.x - p.x) * r) / d, y: p.y + ((q.y - p.y) * r) / d };
        return outOfBoxes(finder.obstacles, q, pad);
      }),
    );
    r *= Math.max(0, Math.min(1, o.decay));
    if (r <= 1e-3) break;
  }
  plugs.forEach(({ edge }, e) => out.set(edge.id, lines[e]!));
  return out;
}

/**
 * This function gives the highways of the moving least squares bundling (HWY-008). The points of `mlsebLines` snap to a grid of side `snap`.
 * The ways go through the corner graph, and each stretch that `minSize` ways share is a highway.
 */
export function mlsebPlan(input: HighwayInput, o: Readonly<MlsebOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const lines = mlsebLines(input, finder, o);
  const waypoints = new Map([...lines].map(([edge, l]) => [edge, l.slice(1, -1)] as const));
  return tracePlan(input, finder, waypoints, { snap: o.snap, minSize: o.minSize, key: "mlseb" });
}
