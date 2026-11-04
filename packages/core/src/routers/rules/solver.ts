import { checkProperties } from "../../bench/properties.ts";
import { measureQuality } from "../../bench/quality.ts";
import { rng } from "../../fixtures.ts";
import { segmentsCross, type Point } from "../../geom.ts";
import { outerGraph, type Graph, type Result, type Route } from "../../model.ts";
import type { RuleSet } from "./language.ts";
import { compileRules, reachOf, type Leg, type LegView, type TermContext } from "./terms.ts";

/** The options of the solver of a rule file. */
export interface SolverOptions {
  /** The first step size, in units of `clearance`. The step size falls to a tenth of it at the last step. */
  readonly eta: number;
  /** The number of other legs that each leg samples at each step. */
  readonly samples: number;
  /** The number of steps: the budget of the search. */
  readonly steps: number;
  /** The seed of the samples. The same seed gives the same routes. */
  readonly seed: number;
  /** The length that makes the energy a pure number, and the default distance of a term `gap`. */
  readonly clearance: number;
}

/** The moment factors of Adam (Kingma and Ba 2015), as the record gives them. */
const BETA1 = 0.9;
const BETA2 = 0.999;
const EPS = 1e-8;

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
 * This function moves the free legs of `result` down the energy of the rule file `set`, with the steps of Adam (RULE-036).
 * A hard rule is not a term. A route that breaks one goes back to its first points, and so does a route with more crossings.
 */
export function solveRules(input: Graph, result: Result, set: RuleSet, o: Readonly<SolverOptions>): Result {
  const terms = compileRules(set);
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
      const reach = 3 * reachOf(set, c);
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
  const context: TermContext = { clearance: c, samples: Math.max(1, Math.floor(o.samples)), random, all, pointOf };
  let b1 = 1;
  let b2 = 1;
  for (let t = 0; t < steps; t++) {
    b1 *= BETA1;
    b2 *= BETA2;
    const eta = (o.eta * c) / (1 + (9 * t) / Math.max(1, steps - 1));
    const grads = new Float64Array(legs.length);
    legs.forEach((leg, i) => {
      const a = pointOf(leg.route, leg.k);
      const b = pointOf(leg.route, leg.k + 1);
      const view: LegView = { leg, shift: shift[i]!, a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      let g = 0;
      for (const term of terms) g = term(view, context, g);
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
