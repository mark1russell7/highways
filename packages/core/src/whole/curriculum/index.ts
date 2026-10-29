import { checkProperties } from "../../bench/properties.ts";
import { dist, polylineLength, segmentsCross, type Point } from "../../geom.ts";
import type { Graph, Route } from "../../model.ts";
import type { WholeOutput } from "../../strategies/model.ts";
import { runPipeline } from "../pipeline/index.ts";
import type { PortfolioSetting } from "../portfolio/index.ts";

/** One rule of the curriculum: the crossings (R1), the lane separation (R12) or the crossing angle (R2). */
export type CurriculumRule = "R1" | "R12" | "R2";

/** The order in which the curriculum adds its rules. */
export type CurriculumOrder = "R1-R12-R2" | "R12-R1-R2" | "R1-R2-R12";

/** The values of `CurriculumOrder`. */
export const CURRICULUM_ORDERS: readonly CurriculumOrder[] = Object.freeze(["R1-R12-R2", "R12-R1-R2", "R1-R2-R12"]);

/** The options of the whole strategy `curriculum` (RULE-048). */
export interface CurriculumOptions {
  /** The order in which the stages add the rules. The default is `R1-R12-R2`. */
  readonly order: CurriculumOrder;
  /** The number of passes over the edges in each stage, from 1 to 3. The default is 1. */
  readonly passes: number;
  /** The number of settings in the pool of routes, from the start of its list, from 2 to 3. The default is 3. */
  readonly settings: number;
  /** A new route has a detour of at most this value, or of its old route, from 1.5 to 4. The default is 2. */
  readonly detour: number;
}

/** The default options of the strategy `curriculum`. */
export const CURRICULUM_DEFAULTS: Readonly<CurriculumOptions> = Object.freeze({ order: "R1-R12-R2", passes: 1, settings: 3, detour: 2 });

/** Two legs closer than this distance count for the lane separation (R12), as in the screen. */
const NEAR = 4;

/** A route with its bounding box, for the quick test of two routes. */
interface Shape {
  readonly route: Route;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** This function gives the shape of a route. */
function shapeOf(route: Route): Shape {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of route.points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { route, x0, y0, x1, y1 };
}

/** This function gives the distance between the segments `ab` and `cd`, when they do not cross. */
function segmentGap(a: Point, b: Point, c: Point, d: Point): number {
  const at = (p: Point, u: Point, v: Point): number => {
    const dx = v.x - u.x;
    const dy = v.y - u.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / l2)) : 0;
    return Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy);
  };
  return Math.min(at(a, c, d), at(b, c, d), at(c, a, b), at(d, a, b));
}

/**
 * This function gives the costs of the rules between two routes. R1 is the number of crossings.
 * R2 is the sum of `1 - θ / 90` over the crossings. θ is the crossing angle in degrees.
 * R12 is the overlap of the legs of `a` and `b` that are within 5 degrees of parallel. The two legs are nearer than 4 units.
 */
export function pairCosts(a: readonly Point[], b: readonly Point[]): Record<CurriculumRule, number> {
  let r1 = 0;
  let r2 = 0;
  let r12 = 0;
  const sin5 = Math.sin((5 * Math.PI) / 180);
  for (let i = 1; i < a.length; i++) {
    const p = a[i - 1]!;
    const q = a[i]!;
    const ux = q.x - p.x;
    const uy = q.y - p.y;
    const lu = Math.hypot(ux, uy);
    if (lu <= 1e-9) continue;
    for (let j = 1; j < b.length; j++) {
      const r = b[j - 1]!;
      const s = b[j]!;
      const vx = s.x - r.x;
      const vy = s.y - r.y;
      const lv = Math.hypot(vx, vy);
      if (lv <= 1e-9) continue;
      if (segmentsCross(p, q, r, s)) {
        r1++;
        const angle = (Math.asin(Math.min(1, Math.abs(ux * vy - uy * vx) / (lu * lv))) * 180) / Math.PI;
        r2 += 1 - angle / 90;
        continue;
      }
      if (Math.abs(ux * vy - uy * vx) > sin5 * lu * lv) continue;
      const t0 = ((r.x - p.x) * ux + (r.y - p.y) * uy) / lu;
      const t1 = ((s.x - p.x) * ux + (s.y - p.y) * uy) / lu;
      const overlap = Math.min(lu, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1));
      if (overlap > 1e-9 && segmentGap(p, q, r, s) < NEAR) r12 += overlap;
    }
  }
  return { R1: r1, R2: r2, R12: r12 };
}

/** This function gives the detour of a route: its length over the distance between its ends. */
function detourOf(points: readonly Point[]): number {
  const span = dist(points[0]!, points[points.length - 1]!);
  return span > 1e-9 ? polylineLength(points) / span : 1;
}

/**
 * This function runs the whole strategy `curriculum` (RULE-048, after curriculum learning, Bengio 2009). The record has no energy solver yet (RULE-019).
 * Thus a pool of routes of fixed settings takes its place. Each edge can take its route from any setting of the pool.
 * The first answer is the first setting. Each stage adds one rule, in the order `order`. A pass of a stage visits the edges, the worst first.
 * An edge takes the route of the pool with the least cost of the new rule. That cost is lower, and the earlier rules do not get worse.
 * A route with a break of a hard rule is not in the pool. The output has the routes alone, with no runs, bundles or levels.
 */
export function curriculum(graph: Graph, list: readonly PortfolioSetting[], options: Partial<CurriculumOptions> = {}): WholeOutput {
  const o = { ...CURRICULUM_DEFAULTS, ...options };
  const count = Math.max(1, Math.min(list.length, Math.floor(o.settings)));
  const pool = new Map<string, Route[]>();
  let first: WholeOutput | undefined;
  for (const s of list.slice(0, count)) {
    const limit = (s.pipeline.highway ?? s.pipeline.router).maxNodes;
    if (limit !== undefined && graph.nodes.length > limit) continue;
    const output = runPipeline(graph, s.pipeline);
    first ??= output;
    const faulty = new Set(checkProperties(output.graph, output.result, 1_000_000).map((v) => v.edge));
    for (const r of output.result.routes) {
      if (faulty.has(r.edge) || r.points.length < 2) continue;
      const list2 = pool.get(r.edge);
      if (list2) list2.push(r);
      else pool.set(r.edge, [r]);
    }
  }
  if (!first) return runPipeline(graph, list[0]!.pipeline);
  const rules = o.order.split("-") as CurriculumRule[];
  const current = new Map<string, Shape>(first.result.routes.map((r) => [r.edge, shapeOf(r)]));
  // A faulty first route takes the first route of the pool, so no stage starts from a break of a hard rule.
  for (const [edge, shape] of current) {
    const own = pool.get(edge);
    if (own && !own.includes(shape.route)) current.set(edge, shapeOf(own[0]!));
  }
  const costOf = (edge: string, s: Shape): Record<CurriculumRule, number> => {
    const sum = { R1: 0, R2: 0, R12: 0 };
    for (const [other, t] of current) {
      if (other === edge || t.x0 > s.x1 + NEAR || t.x1 < s.x0 - NEAR || t.y0 > s.y1 + NEAR || t.y1 < s.y0 - NEAR) continue;
      const c = pairCosts(s.route.points, t.route.points);
      sum.R1 += c.R1;
      sum.R2 += c.R2;
      sum.R12 += c.R12;
    }
    return sum;
  };
  const edges = [...current.keys()];
  for (let stage = 0; stage < rules.length; stage++) {
    const rule = rules[stage]!;
    const earlier = rules.slice(0, stage);
    for (let pass = 0; pass < Math.max(1, Math.floor(o.passes)); pass++) {
      const costs = new Map(edges.map((e) => [e, costOf(e, current.get(e)!)]));
      const order = [...edges].sort((a, b) => costs.get(b)![rule] - costs.get(a)![rule] || (a < b ? -1 : a > b ? 1 : 0));
      let moved = 0;
      for (const edge of order) {
        const now = current.get(edge)!;
        const base = costOf(edge, now);
        if (base[rule] <= 1e-9) continue;
        const cap = Math.max(o.detour, detourOf(now.route.points));
        let best: { shape: Shape; cost: number } | undefined;
        for (const r of pool.get(edge) ?? []) {
          if (r === now.route || detourOf(r.points) > cap + 1e-9) continue;
          const shape = shapeOf(r);
          const c = costOf(edge, shape);
          if (c[rule] >= base[rule] - 1e-9 || earlier.some((k) => c[k] > base[k] + 1e-9)) continue;
          if (!best || c[rule] < best.cost - 1e-9) best = { shape, cost: c[rule] };
        }
        if (best) {
          current.set(edge, best.shape);
          moved++;
        }
      }
      if (moved === 0) break;
    }
  }
  const routes = first.result.routes.map((r) => current.get(r.edge)?.route ?? r);
  return { graph: first.graph, result: { routes } };
}
