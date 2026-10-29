import { checkProperties } from "../../bench/properties.ts";
import { rng } from "../../fixtures.ts";
import { dist, polylineLength, type Point } from "../../geom.ts";
import type { Graph, Route } from "../../model.ts";
import { turnsOf } from "../../routers/reroute/index.ts";
import type { WholeOutput } from "../../strategies/model.ts";
import { pairCosts } from "../curriculum/index.ts";
import { runPipeline } from "../pipeline/index.ts";
import type { PortfolioSetting } from "../portfolio/index.ts";

/** The features of one route, in order: crossings (R1), angle cost (R2), lane overlap (R12) over 20, detour minus 1 (R5), and bends over 2. */
export const PREFERENCE_FEATURES: readonly string[] = Object.freeze(["R1", "R2", "R12", "R5", "bends"]);

/** The scale of the lane overlap in the features, in units of length. */
const OVERLAP_SCALE = 20;

/**
 * The weights of the made-up panel that labels the made-up pairs, in the order of `PREFERENCE_FEATURES`.
 * The order comes from the studies of the readers of graphs: the crossings count most, then the bends and the length, then the angle (Purchase 1997, Ware, Purchase, Colpoys and McGill 2002).
 * The numbers are made up. They do not come from the screen or from a board.
 */
export const PREFERENCE_PANEL: readonly number[] = Object.freeze([3, 0.75, 0.5, 1.5, 1]);

/** The options of the fit of the preferences. */
export interface PreferenceFit {
  /** The weight of the L2 term of the fit, from 0 to 1. The default is 0.01. */
  readonly l2: number;
  /** The seed of the made-up pairs. The default is 1. */
  readonly seed: number;
  /** The number of made-up pairs, from 50 to 1000. The default is 200. */
  readonly pairs: number;
}

/** The options of the whole strategy `preferences` (RULE-038). */
export interface PreferenceOptions {
  /** The weight of the L2 term of the fit, from 0 to 1. The default is 0.01. */
  readonly l2: number;
  /** The number of passes over the edges, from 1 to 3. The default is 1. */
  readonly passes: number;
  /** The number of settings in the pool of routes, from the start of its list, from 2 to 3. The default is 3. */
  readonly settings: number;
  /** A new route has a detour of at most this value, or of its old route, from 1.5 to 4. The default is 2. */
  readonly detour: number;
}

/** The default options of the strategy `preferences`. */
export const PREFERENCE_DEFAULTS: Readonly<PreferenceOptions> = Object.freeze({ l2: 0.01, passes: 1, settings: 3, detour: 2 });

/** One made-up pair: the features of two routes, and 1 when the panel prefers the first one. */
export interface PreferencePair {
  readonly a: readonly number[];
  readonly b: readonly number[];
  readonly first: 0 | 1;
}

/** The result of the fit: the weights, the agreement with held-out pairs, and the source of the pairs. */
export interface PreferenceModel {
  readonly weights: readonly number[];
  /** The share of 50 held-out made-up pairs where the weights agree with the panel. */
  readonly agreement: number;
  readonly source: string;
}

/**
 * This function gives a smooth step from 0 to 1, a stand-in for the logistic function with only `+`, `*`, `/` and `Math.abs`.
 * It is `0.5 + 0.5 z / (1 + |z|)`. These operations are exact to the last bit on each platform.
 */
export function softStep(z: number): number {
  return 0.5 + (0.5 * z) / (1 + Math.abs(z));
}

/** This function gives a made-up feature vector of one route. */
function madeUpFeatures(random: () => number): number[] {
  return [Math.floor(random() * 5), random() * 2, random() * 2, random(), Math.floor(random() * 7) / 2];
}

/** This function gives a noise with a mean of 0 and a spread of approximately 0.6: the sum of three uniform values. */
function noise(random: () => number): number {
  return (random() + random() + random() - 1.5) * 1.2;
}

/** This function gives the utility of a feature vector for the weights `w`. A larger utility is better. */
function utility(w: readonly number[], f: readonly number[]): number {
  let u = 0;
  for (let i = 0; i < f.length; i++) u -= w[i]! * f[i]!;
  return u;
}

/**
 * This function gives `count` made-up pairs, with the labels of the made-up panel `PREFERENCE_PANEL` and a noise.
 * The pairs come from the seed alone. They do not come from a board.
 */
export function madeUpPairs(count: number, seed: number): PreferencePair[] {
  const random = rng(seed);
  const out: PreferencePair[] = [];
  for (let i = 0; i < count; i++) {
    const a = madeUpFeatures(random);
    const b = madeUpFeatures(random);
    out.push({ a, b, first: utility(PREFERENCE_PANEL, a) - utility(PREFERENCE_PANEL, b) + noise(random) > 0 ? 1 : 0 });
  }
  return out;
}

/** This function gives the share of the pairs where the weights `w` prefer the same route as the panel. */
export function agreementOf(w: readonly number[], pairs: readonly PreferencePair[]): number {
  if (pairs.length === 0) return 0;
  let n = 0;
  for (const p of pairs) if ((utility(w, p.a) > utility(w, p.b) ? 1 : 0) === p.first) n++;
  return n / pairs.length;
}

/** The fits of earlier calls, by their options. */
const FITS = new Map<string, PreferenceModel>();

/**
 * This function fits the weights of the rules to made-up pairs (RULE-038, a Bradley-Terry model, after Bradley and Terry 1952).
 * The probability that a reader prefers `a` to `b` is `softStep(u(a) - u(b))`, with `u(x) = -w · f(x)`. The fit takes 400 steps of the gradient of the score.
 * An L2 term `l2 × |w|²` keeps the weights small. A weight below 0 becomes 0. The weights are scaled so that their sum is the number of features.
 * The held-out pairs come from the seed plus 7919. The pairs do not come from the screen or from a board.
 */
export function fitPreferences(options: Partial<PreferenceFit> = {}): PreferenceModel {
  const o = { l2: 0.01, seed: 1, pairs: 200, ...options };
  const key = JSON.stringify(o);
  const known = FITS.get(key);
  if (known) return known;
  const pairs = madeUpPairs(Math.max(1, Math.floor(o.pairs)), o.seed);
  const n = PREFERENCE_FEATURES.length;
  const w = new Array<number>(n).fill(1);
  const rate = 0.5;
  for (let step = 0; step < 400; step++) {
    const grad = new Array<number>(n).fill(0);
    for (const p of pairs) {
      const d = p.b.map((v, i) => v - p.a[i]!);
      let z = 0;
      for (let i = 0; i < n; i++) z += w[i]! * d[i]!;
      const e = softStep(z) - p.first;
      for (let i = 0; i < n; i++) grad[i]! += (e * d[i]!) / pairs.length;
    }
    for (let i = 0; i < n; i++) w[i] = Math.max(0, w[i]! - rate * (grad[i]! + 2 * o.l2 * w[i]!));
  }
  const sum = w.reduce((s, v) => s + v, 0);
  const weights = sum > 1e-12 ? w.map((v) => (v * n) / sum) : w.map(() => 1);
  const model: PreferenceModel = {
    weights,
    agreement: agreementOf(weights, madeUpPairs(50, o.seed + 7919)),
    source: `${Math.floor(o.pairs)} made-up pairs of seed ${o.seed}, labelled by the made-up panel PREFERENCE_PANEL with a noise`,
  };
  FITS.set(key, model);
  return model;
}

/** A route with its bounding box, for the quick test of two routes. */
interface Shape {
  readonly route: Route;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** The weighted cost of the route alone: its detour and its bends. */
  readonly own: number;
}

/** This function gives the detour of a route: its length over the distance between its ends. */
function detourOf(points: readonly Point[]): number {
  const span = dist(points[0]!, points[points.length - 1]!);
  return span > 1e-9 ? polylineLength(points) / span : 1;
}

/**
 * This function runs the whole strategy `preferences` (RULE-038). It fits the weights of the rules to made-up pairs (`fitPreferences`).
 * Each edge can take its route from any setting of the pool. The first answer is the first setting.
 * A pass visits the edges in order. An edge takes the route of the pool with the least weighted cost, when that cost is lower than the cost of its route.
 * The cost is the weighted sum of the features of the route against the routes of the other edges. A route with a break of a hard rule is not in the pool.
 * The output has the routes alone, with no runs, bundles or levels.
 */
export function preferences(graph: Graph, list: readonly PortfolioSetting[], options: Partial<PreferenceOptions> = {}): WholeOutput {
  const o = { ...PREFERENCE_DEFAULTS, ...options };
  const w = fitPreferences({ l2: o.l2 }).weights;
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
      const own = pool.get(r.edge);
      if (own) own.push(r);
      else pool.set(r.edge, [r]);
    }
  }
  if (!first) return runPipeline(graph, list[0]!.pipeline);
  const shapeOf = (route: Route): Shape => {
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
    return { route, x0, y0, x1, y1, own: w[3]! * (detourOf(route.points) - 1) + (w[4]! * turnsOf(route.points)) / 2 };
  };
  const current = new Map<string, Shape>(first.result.routes.map((r) => [r.edge, shapeOf(r)]));
  for (const [edge, shape] of current) {
    const own = pool.get(edge);
    if (own && !own.includes(shape.route)) current.set(edge, shapeOf(own[0]!));
  }
  const near = 4;
  const costOf = (edge: string, s: Shape): number => {
    let sum = s.own;
    for (const [other, t] of current) {
      if (other === edge || t.x0 > s.x1 + near || t.x1 < s.x0 - near || t.y0 > s.y1 + near || t.y1 < s.y0 - near) continue;
      const c = pairCosts(s.route.points, t.route.points);
      sum += w[0]! * c.R1 + w[1]! * c.R2 + (w[2]! * c.R12) / OVERLAP_SCALE;
    }
    return sum;
  };
  const edges = [...current.keys()];
  for (let pass = 0; pass < Math.max(1, Math.floor(o.passes)); pass++) {
    let moved = 0;
    for (const edge of edges) {
      const now = current.get(edge)!;
      const base = costOf(edge, now);
      const cap = Math.max(o.detour, detourOf(now.route.points));
      let best: { shape: Shape; cost: number } | undefined;
      for (const r of pool.get(edge) ?? []) {
        if (r === now.route || detourOf(r.points) > cap + 1e-9) continue;
        const shape = shapeOf(r);
        const c = costOf(edge, shape);
        if (c < (best?.cost ?? base) - 1e-9) best = { shape, cost: c };
      }
      if (best) {
        current.set(edge, best.shape);
        moved++;
      }
    }
    if (moved === 0) break;
  }
  const routes = first.result.routes.map((r) => current.get(r.edge)?.route ?? r);
  return { graph: first.graph, result: { routes } };
}
