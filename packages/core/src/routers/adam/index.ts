import { checkProperties } from "../../bench/properties.ts";
import { measureQuality } from "../../bench/quality.ts";
import { rng } from "../../fixtures.ts";
import { segmentsCross, type Box, type Point } from "../../geom.ts";
import { outerGraph, type Graph, type GroupRule, type Result, type Route, type Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `adam` (RULE-020: Adam with a seeded sample of pairs). */
export interface AdamOptions {
  /** The first step size `eta0`, in units of `clearance`, from 0.01 to 1. The step size falls to a tenth of it at the last step. The default is 0.1. */
  readonly eta: number;
  /** The number of other legs that each leg samples at each step, from 4 to 32. The default is 8. */
  readonly samples: number;
  /** The number of steps: the budget of the search, from 100 to 2000. The default is 200. */
  readonly steps: number;
  /** The seed of the samples, a whole number from 0. The same seed gives the same routes. The default is 1. */
  readonly seed: number;
  /** A leg nearer than this distance to another leg or to a box gets a push, from 4 to 32. The default is 8. */
  readonly clearance: number;
}

/** The default options of the router `adam`. */
export const ADAM_DEFAULTS: Readonly<AdamOptions> = Object.freeze({ eta: 0.1, samples: 8, steps: 200, seed: 1, clearance: 8 });

/** The declarations of the options of the router `adam` (RULE-020). */
export const ADAM_SCHEMA: OptionSchema<AdamOptions> = {
  eta: { type: "number", min: 0.01, max: 1, step: 0.01, marks: [0.01, 0.1, 1], default: 0.1, describe: "The first step size, in units of the clearance. It falls to a tenth at the last step." },
  samples: { type: "integer", min: 4, max: 32, step: 1, marks: [4, 8, 16, 32], default: 8, describe: "The number of other legs that each leg samples at each step." },
  steps: { type: "integer", min: 100, max: 2000, step: 100, marks: [100, 200, 500, 2000], default: 200, describe: "The number of steps: the budget of the search." },
  seed: { type: "integer", min: 0, max: 1_000_000, step: 1, marks: [1, 2, 3], default: 1, describe: "The seed of the samples. The same seed gives the same routes." },
  clearance: { type: "number", min: 4, max: 32, step: 1, marks: [4, 8, 16, 32], default: 8, describe: "A leg nearer than this distance to another leg or to a box gets a push." },
};

/** The moment factors of Adam (Kingma and Ba 2015), as the record gives them. */
const BETA1 = 0.9;
const BETA2 = 0.999;
const EPS = 1e-8;

/** The weight of the push from a box, against the push from a leg. */
const BOX_WEIGHT = 4;

/** The weight of the term that holds a leg near its first place. */
const HOLD = 0.05;

/** A free leg of a route. No end of it is an end of its route or a point of another route. No run or trunk holds it. */
interface Leg {
  readonly route: number;
  /** The index of the first point of the leg in its route. */
  readonly k: number;
  /** The unit normal of the leg. The leg moves along it. */
  readonly nx: number;
  readonly ny: number;
  /** The boxes near the leg. */
  readonly boxes: readonly Box[];
}

/** This function gives the point of the segment `ab` nearest to `p`. */
function nearestOn(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** This function gives the point of a box nearest to `p`. A point in the box gives the nearest point of its border. */
function nearestOfBox(p: Point, b: Box): Point {
  const qx = Math.max(b.x, Math.min(b.x + b.w, p.x));
  const qy = Math.max(b.y, Math.min(b.y + b.h, p.y));
  if (qx !== p.x || qy !== p.y) return { x: qx, y: qy };
  const sides = [p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y];
  const m = Math.min(...sides);
  if (m === sides[0]) return { x: b.x, y: p.y };
  if (m === sides[1]) return { x: b.x + b.w, y: p.y };
  if (m === sides[2]) return { x: p.x, y: b.y };
  return { x: p.x, y: b.y + b.h };
}

/** This function gives the crossings of the route `a` with itself and with the routes of `others`. It skips the route with the index `skip`. */
function crossingsOf(a: readonly Point[], others: readonly (readonly Point[])[], skip: number): number {
  const [ax0, ay0, ax1, ay1] = boundsOf(a);
  let n = 0;
  for (let i = 1; i < a.length; i++) for (let k = i + 2; k < a.length; k++) if (segmentsCross(a[i - 1]!, a[i]!, a[k - 1]!, a[k]!)) n++;
  others.forEach((b, j) => {
    if (j === skip) return;
    const [bx0, by0, bx1, by1] = boundsOf(b);
    if (bx0 > ax1 || bx1 < ax0 || by0 > ay1 || by1 < ay0) return;
    for (let i = 1; i < a.length; i++) for (let k = 1; k < b.length; k++) if (segmentsCross(a[i - 1]!, a[i]!, b[k - 1]!, b[k]!)) n++;
  });
  return n;
}

/** The bounds of each polyline, once for each polyline object. */
const BOUNDS = new WeakMap<readonly Point[], readonly [number, number, number, number]>();

/** This function gives the bounds of a polyline: the least x and y, and the largest x and y. */
function boundsOf(p: readonly Point[]): readonly [number, number, number, number] {
  let b = BOUNDS.get(p);
  if (b) return b;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of p) {
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
  }
  b = [x0, y0, x1, y1];
  BOUNDS.set(p, b);
  return b;
}

/**
 * This function moves the free legs of the routes of `result` with Adam (RULE-020, after Kingma and Ba 2015, and the SGD layouts of Zheng, Pawar and Goodman 2019).
 * A leg is free when its two points are inside its route, and no other route, run or trunk holds them. The variable of a leg is a shift along its normal.
 * The energy of a leg is `Σ (1 - d / c)²` over a seeded sample of `samples` other legs nearer than `c`. The near boxes add the same term times 4.
 * A term `0.05 × (t / c)²` holds each leg near its first place. The step size falls from `eta` to a tenth of it, with only `+`, `*` and `/`.
 * A moved route goes back to its first points when it has more crossings than before, or a break of a hard rule.
 * When the output still has more crossings than the routes of `shared`, it is the routes of `shared`.
 */
export function adamRoutes(input: Graph, result: Result, options: Partial<AdamOptions> = {}): Result {
  const o = { ...ADAM_DEFAULTS, ...options };
  const c = Math.max(1e-6, o.clearance);
  const graph = outerGraph(input);
  const first = result.routes.map((r) => r.points);
  const pinned = new Set<string>();
  const keyOf = (p: Point): string => `${p.x},${p.y}`;
  for (const run of result.runs ?? []) for (const p of run.points) pinned.add(keyOf(p));
  for (const b of result.bundles ?? []) for (const p of b.trunk) pinned.add(keyOf(p));
  // A point of two routes or more stays, so two routes that share a leg keep it as one drawn leg.
  const owners = new Map<string, number>();
  first.forEach((pts, route) => {
    for (const p of pts) {
      const k = keyOf(p);
      const o = owners.get(k);
      if (o === undefined) owners.set(k, route);
      else if (o !== route) pinned.add(k);
    }
  });
  const boxes = graph.nodes.map((n) => n.box);
  const legs: Leg[] = [];
  first.forEach((pts, route) => {
    for (let k = 1; k + 2 < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      if (pinned.has(keyOf(a)) || pinned.has(keyOf(b))) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len <= 1e-9) continue;
      const reach = 3 * c;
      const near = boxes.filter((bx) => Math.min(a.x, b.x) - reach <= bx.x + bx.w && Math.max(a.x, b.x) + reach >= bx.x && Math.min(a.y, b.y) - reach <= bx.y + bx.h && Math.max(a.y, b.y) + reach >= bx.y);
      legs.push({ route, k, nx: -dy / len, ny: dx / len, boxes: near });
    }
  });
  if (legs.length === 0) return result;
  const shift = new Float64Array(legs.length);
  const m1 = new Float64Array(legs.length);
  const m2 = new Float64Array(legs.length);
  // The legs that touch each point of each route, so a point moves with each of its legs.
  const legAt = new Map<string, number[]>();
  legs.forEach((l, i) => {
    for (const k of [l.k, l.k + 1]) {
      const key = `${l.route}:${k}`;
      const list = legAt.get(key);
      if (list) list.push(i);
      else legAt.set(key, [i]);
    }
  });
  const pointOf = (route: number, k: number): Point => {
    const p = first[route]![k]!;
    const list = legAt.get(`${route}:${k}`);
    if (!list) return p;
    let x = p.x;
    let y = p.y;
    for (const i of list) {
      x += shift[i]! * legs[i]!.nx;
      y += shift[i]! * legs[i]!.ny;
    }
    return { x, y };
  };
  // Each leg of each route, as the pairs of the sample: the free legs and the fixed legs.
  const all: { route: number; k: number }[] = [];
  first.forEach((pts, route) => {
    for (let k = 0; k + 1 < pts.length; k++) all.push({ route, k });
  });
  const random = rng(Math.max(0, Math.floor(o.seed)));
  const steps = Math.max(1, Math.floor(o.steps));
  const count = Math.max(1, Math.floor(o.samples));
  let b1 = 1;
  let b2 = 1;
  for (let t = 0; t < steps; t++) {
    b1 *= BETA1;
    b2 *= BETA2;
    const eta = (o.eta * c) / (1 + (9 * t) / Math.max(1, steps - 1));
    const grads = new Float64Array(legs.length);
    legs.forEach((l, i) => {
      const a = pointOf(l.route, l.k);
      const b = pointOf(l.route, l.k + 1);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let g = (2 * HOLD * shift[i]!) / (c * c);
      for (let s = 0; s < count; s++) {
        const other = all[Math.floor(random() * all.length)]!;
        if (other.route === l.route) continue;
        const q = nearestOn(mid, pointOf(other.route, other.k), pointOf(other.route, other.k + 1));
        const dx = mid.x - q.x;
        const dy = mid.y - q.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= c || d <= 1e-9) continue;
        // E = (1 - d / c)², so dE/dt = -2 (1 - d / c) / c × (n · (mid - q)) / d.
        g += ((-2 * (1 - d / c)) / c) * ((l.nx * dx + l.ny * dy) / d);
      }
      for (const bx of l.boxes) {
        for (const p of [a, mid, b]) {
          const q = nearestOfBox(p, bx);
          const inside = p.x >= bx.x && p.x <= bx.x + bx.w && p.y >= bx.y && p.y <= bx.y + bx.h;
          const dx = (inside ? q.x - p.x : p.x - q.x) || 0;
          const dy = (inside ? q.y - p.y : p.y - q.y) || 0;
          const d0 = Math.sqrt(dx * dx + dy * dy);
          if (d0 <= 1e-9) continue;
          const d = inside ? -d0 : d0;
          if (d >= c) continue;
          g += ((BOX_WEIGHT * -2 * (1 - d / c)) / c) * ((l.nx * dx + l.ny * dy) / d0);
        }
      }
      grads[i] = g;
    });
    for (let i = 0; i < legs.length; i++) {
      const g = grads[i]!;
      m1[i] = BETA1 * m1[i]! + (1 - BETA1) * g;
      m2[i] = BETA2 * m2[i]! + (1 - BETA2) * g * g;
      const mh = m1[i]! / (1 - b1);
      const vh = m2[i]! / (1 - b2);
      shift[i] = Math.max(-2 * c, Math.min(2 * c, shift[i]! - (eta * mh) / (Math.sqrt(vh) + EPS)));
    }
  }
  const moved = new Set(legs.map((l) => l.route));
  const points = first.map((pts, route) => (moved.has(route) ? pts.map((_, k) => pointOf(route, k)) : pts));
  // A moved route with more crossings than its first points, against the other routes as they are, goes back to its first points.
  for (let round = 0; round < 8; round++) {
    let back = 0;
    for (const route of moved) {
      if (points[route] === first[route] || crossingsOf(points[route]!, points, route) <= crossingsOf(first[route]!, points, route)) continue;
      points[route] = first[route]!;
      back++;
    }
    if (back === 0) break;
  }
  const build = (pts: readonly (readonly Point[])[]): Result => ({ ...result, routes: result.routes.map((r, i): Route => (pts[i] === r.points ? r : { ...r, points: pts[i]! })) });
  let out = build(points);
  for (let round = 0; round < 3; round++) {
    const faulty = new Set(checkProperties(input, out, 1_000_000).map((v) => v.edge));
    const fix = result.routes.map((r, i) => (faulty.has(r.edge) && points[i] !== first[i] ? i : -1)).filter((i) => i >= 0);
    if (fix.length === 0) break;
    for (const i of fix) points[i] = first[i]!;
    out = build(points);
  }
  // The output keeps the routes of `shared` when it has a break of a hard rule, or more crossings, after the fixes.
  if (checkProperties(input, out, 1).length > checkProperties(input, result, 1).length) return result;
  return measureQuality(input, out).crossings > measureQuality(input, result).crossings ? result : out;
}

/**
 * This function makes the router `adam` (RULE-020). It is the router `shared`, then the steps of Adam of `adamRoutes`.
 * The runs and the bundles of `shared` stay, because no point of a run or of a trunk moves.
 */
export function adamRouter(options: Partial<AdamOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...ADAM_DEFAULTS, ...options };
  const base = sharedRouter({ name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) });
  return {
    name: o.name,
    ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }),
    route: (graph: Graph): Result => adamRoutes(graph, base.route(graph), o),
  };
}

/**
 * The router strategy `adam` (RULE-020), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const adamStrategy: Strategy<"router", AdamOptions> = defineStrategy({
  step: "router",
  name: "adam",
  describe: "Adam with a seeded sample of pairs (RULE-020). The free legs of the routes of `shared` move along their normals, away from near legs and boxes.",
  defaults: { ...ADAM_DEFAULTS },
  schema: ADAM_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<AdamOptions>): Result => adamRouter({ ...o, name: "adam", rule: byCollection }).route(graph),
});
