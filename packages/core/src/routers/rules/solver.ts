import { checkProperties } from "../../bench/properties.ts";
import { measureQuality } from "../../bench/quality.ts";
import { rng } from "../../fixtures.ts";
import { segmentsCross, type Box, type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";
import { outerGraph, type Graph, type Result, type Route } from "../../model.ts";
import type { RuleSet } from "./language.ts";
import { compileRules, reachOf, type LegRef, type Sample, type TermContext, type Variable, type VariableView } from "./terms.ts";

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
  /** The method: `adam` with a sample of legs (RULE-020), or `gradient`, plain steps over all near legs (RULE-019). The default is `adam`. */
  readonly descent?: "adam" | "gradient";
  /** This function gets the outcome of the guards of one board. A record uses it, and the routes do not depend on it. */
  readonly report?: ((outcome: SolverOutcome) => void) | undefined;
}

/** What the guards did on one board. */
export interface SolverOutcome {
  /** The number of variables of the board. */
  readonly variables: number;
  /** The number of moved routes before the last guard, which reads the whole board. */
  readonly routes: number;
  /** The reason that the last guard gave back the routes of the input, or `none`. */
  readonly dropped: "none" | "breaks" | "crossings";
  /** This value is true when the pass of crossings stopped at its cap with routes still going back. */
  readonly capped: boolean;
  /** The first points of each route. */
  readonly first: readonly (readonly Point[])[];
  /** The points of each route after the pass of crossings. */
  readonly afterPass: readonly (readonly Point[])[];
  /** The points of each route after the fix of hard rules. The last guard reads these points. */
  readonly final: readonly (readonly Point[])[];
}

/** The cap of the rounds of the pass of crossings. */
const PASS_ROUNDS = 8;

/** The moment factors of Adam (Kingma and Ba 2015), as the record gives them. */
const BETA1 = 0.9;
const BETA2 = 0.999;
const EPS = 1e-8;

/** This function gives the crossings of the route `a` with itself and with the routes of `others`. It skips the route with the index `skip`. */
export function crossingsOf(a: readonly Point[], others: readonly (readonly Point[])[], skip: number): number {
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

/** This function gives the boxes in `reach` of the bounds of `points`. */
function boxesNear(boxes: readonly Box[], points: readonly Point[], reach: number): readonly Box[] {
  const x0 = Math.min(...points.map((p) => p.x)) - reach;
  const x1 = Math.max(...points.map((p) => p.x)) + reach;
  const y0 = Math.min(...points.map((p) => p.y)) - reach;
  const y1 = Math.max(...points.map((p) => p.y)) + reach;
  return boxes.filter((bx) => x0 <= bx.x + bx.w && x1 >= bx.x && y0 <= bx.y + bx.h && y1 >= bx.y);
}

/** This function gives one variable for each free leg of a route, along its normal. */
function legVariables(pts: readonly Point[], route: number, pinned: (p: Point) => boolean, boxes: readonly Box[], reach: number): Variable[] {
  const out: Variable[] = [];
  for (let k = 1; k + 2 < pts.length; k++) {
    const a = pts[k]!;
    const b = pts[k + 1]!;
    if (pinned(a) || pinned(b)) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len <= 1e-9) continue;
    out.push({ route, k, last: k + 1, nx: -dy / len, ny: dx / len, boxes: boxesNear(boxes, [a, b], reach) });
  }
  return out;
}

/** This function gives two variables for each free point of a route: one in x and one in y. */
function pointVariables(pts: readonly Point[], route: number, pinned: (p: Point) => boolean, boxes: readonly Box[], reach: number): Variable[] {
  const out: Variable[] = [];
  for (let k = 1; k + 1 < pts.length; k++) {
    if (pinned(pts[k]!)) continue;
    const near = boxesNear(boxes, [pts[k - 1]!, pts[k]!, pts[k + 1]!], reach);
    out.push({ route, k, last: k, nx: 1, ny: 0, boxes: near }, { route, k, last: k, nx: 0, ny: 1, boxes: near });
  }
  return out;
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
 * This function gives the places of a variable that a term `gap` reads near boxes.
 * A leg reads its two ends and its middle. A point reads itself and the middles of its two legs, which move half as far.
 */
function samplesOf(v: Variable, a: Point, b: Point, mid: Point, pointOf: (route: number, k: number) => Point): readonly Sample[] {
  if (v.last > v.k) return [{ point: a, part: 1 }, { point: mid, part: 1 }, { point: b, part: 1 }];
  const before = pointOf(v.route, v.k - 1);
  const after = pointOf(v.route, v.k + 1);
  return [
    { point: { x: (before.x + a.x) / 2, y: (before.y + a.y) / 2 }, part: 0.5 },
    { point: a, part: 1 },
    { point: { x: (after.x + a.x) / 2, y: (after.y + a.y) / 2 }, part: 0.5 },
  ];
}

/** This function gives a function that makes the grid of each leg of `routes` one time, at its first use. */
function lazyGrid(routes: readonly (readonly Point[])[], cell: number): () => Grid<LegRef> {
  let grid: Grid<LegRef> | undefined;
  return () => {
    if (grid === undefined) {
      const made = new Grid<LegRef>(Math.max(1, 4 * cell));
      routes.forEach((pts, route) => {
        for (let k = 0; k + 1 < pts.length; k++) made.addSegment({ route, k }, pts[k]!, pts[k + 1]!);
      });
      grid = made;
    }
    return grid;
  };
}

/** This function gives the variables that the rule file `set` moves on the routes of `result`. */
export function freeVariables(input: Graph, result: Result, set: RuleSet, clearance: number): readonly Variable[] {
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
  const boxes = outerGraph(input).nodes.map((n) => n.box);
  const isPinned = (p: Point): boolean => pinned.has(keyOf(p));
  const reach = 3 * reachOf(set, clearance);
  const variableOf = set.variable === "points" ? pointVariables : legVariables;
  return first.flatMap((pts, route) => variableOf(pts, route, isPinned, boxes, reach));
}

/**
 * This function moves the variables of `result` down the energy of the rule file `set` (RULE-036).
 * The rule file names the variable. A hard rule is not a term. A route that breaks one goes back to its first points, and so does a route with more crossings.
 */
export function solveRules(input: Graph, result: Result, set: RuleSet, o: Readonly<SolverOptions>): Result {
  const terms = compileRules(set);
  const c = Math.max(1e-6, o.clearance);
  const first = result.routes.map((r) => r.points);
  const variables = freeVariables(input, result, set, c);
  if (variables.length === 0) {
    o.report?.({ variables: 0, routes: 0, dropped: "none", capped: false, first, afterPass: first, final: first });
    return result;
  }
  const shift = new Float64Array(variables.length);
  const m1 = new Float64Array(variables.length);
  const m2 = new Float64Array(variables.length);
  // The variables that move each point of each route.
  const movers = new Map<string, number[]>();
  variables.forEach((v, i) => {
    for (let k = v.k; k <= v.last; k++) {
      const key = `${v.route}:${k}`;
      const list = movers.get(key);
      if (list) list.push(i);
      else movers.set(key, [i]);
    }
  });
  const pointOf = (route: number, k: number): Point => {
    const p = first[route]![k]!;
    const list = movers.get(`${route}:${k}`);
    if (!list) return p;
    let x = p.x;
    let y = p.y;
    for (const i of list) {
      x += shift[i]! * variables[i]!.nx;
      y += shift[i]! * variables[i]!.ny;
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
  const gradient = o.descent === "gradient";
  // A leg moves by 2 c at most, and a point moves with two legs. So two legs farther apart than this distance stay out of reach at each step.
  const reach = reachOf(set, c) + 8 * c;
  const legGrid = lazyGrid(first, c);
  const nearLegs = new Map<string, readonly LegRef[]>();
  const nearOf = (route: number, k: number): readonly LegRef[] => {
    const key = `${route}:${k}`;
    let list = nearLegs.get(key);
    if (list === undefined) {
      const near: LegRef[] = [];
      legGrid().querySegment(first[route]![k]!, first[route]![k + 1]!, reach, (other) => {
        if (other.route !== route) near.push(other);
      });
      list = near;
      nearLegs.set(key, list);
    }
    return list;
  };
  const context: TermContext = { clearance: c, samples: gradient ? 0 : Math.max(1, Math.floor(o.samples)), random, all, pointOf, nearOf };
  let b1 = 1;
  let b2 = 1;
  for (let t = 0; t < steps; t++) {
    b1 *= BETA1;
    b2 *= BETA2;
    const eta = (o.eta * c) / (1 + (9 * t) / Math.max(1, steps - 1));
    const grads = new Float64Array(variables.length);
    variables.forEach((variable, i) => {
      const a = pointOf(variable.route, variable.k);
      const b = pointOf(variable.route, variable.last);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const view: VariableView = { variable, shift: shift[i]!, a, b, mid, samples: samplesOf(variable, a, b, mid, pointOf) };
      let g = 0;
      for (const term of terms) g = term(view, context, g);
      grads[i] = g;
    });
    for (let i = 0; i < variables.length; i++) {
      const g = grads[i]!;
      if (gradient) {
        shift[i] = Math.max(-2 * c, Math.min(2 * c, shift[i]! - eta * c * g));
        continue;
      }
      m1[i] = BETA1 * m1[i]! + (1 - BETA1) * g;
      m2[i] = BETA2 * m2[i]! + (1 - BETA2) * g * g;
      const mh = m1[i]! / (1 - b1);
      const vh = m2[i]! / (1 - b2);
      shift[i] = Math.max(-2 * c, Math.min(2 * c, shift[i]! - (eta * mh) / (Math.sqrt(vh) + EPS)));
    }
  }
  const moved = new Set(variables.map((v) => v.route));
  const points = first.map((pts, route) => (moved.has(route) ? pts.map((_, k) => pointOf(route, k)) : pts));
  // A moved route with more crossings than its first points, against the other routes as they are, goes back to its first points.
  let capped = false;
  for (let round = 0; round < PASS_ROUNDS; round++) {
    let back = 0;
    for (const route of moved) {
      if (points[route] === first[route] || crossingsOf(points[route]!, points, route) <= crossingsOf(first[route]!, points, route)) continue;
      points[route] = first[route]!;
      back++;
    }
    if (back === 0) break;
    capped = round === PASS_ROUNDS - 1;
  }
  const afterPass = [...points];
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
  const breaks = checkProperties(input, out, 1).length > checkProperties(input, result, 1).length;
  const crossings = !breaks && measureQuality(input, out).crossings > measureQuality(input, result).crossings;
  o.report?.({ variables: variables.length, routes: points.filter((p, i) => p !== first[i]).length, dropped: breaks ? "breaks" : crossings ? "crossings" : "none", capped, first, afterPass, final: points });
  return breaks || crossings ? result : out;
}
