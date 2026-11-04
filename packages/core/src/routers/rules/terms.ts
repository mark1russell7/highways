import { segmentsCross, type Box, type Point } from "../../geom.ts";
import { checkRules, type Rule, type RuleSet } from "./language.ts";

/**
 * One number that the solver moves: the points from `k` to `last` of a route, along one direction.
 * No point of it is an end of its route or a point of another route. No run or trunk holds it.
 */
export interface Variable {
  readonly route: number;
  /** The index of the first point that it moves. */
  readonly k: number;
  /** The index of the last point that it moves. A leg has `k + 1`, and a point has `k`. */
  readonly last: number;
  /** The unit direction of the move. */
  readonly nx: number;
  readonly ny: number;
  /** The boxes near the points that it moves. */
  readonly boxes: readonly Box[];
}

/** One leg of a route, as a sample of a pair. */
export interface LegRef {
  readonly route: number;
  readonly k: number;
}

/** What a compiled term reads at one step of the solver. */
export interface TermContext {
  /** The length that makes a term a pure number: the option `clearance` of the solver. */
  readonly clearance: number;
  /** The number of other legs that each leg samples. The value 0 reads each leg of `nearOf`, with no sample. */
  readonly samples: number;
  /** The seeded source of the samples. */
  readonly random: () => number;
  /** Each leg of each route. */
  readonly all: readonly LegRef[];
  /** This function gives a point of a route at this step. */
  readonly pointOf: (route: number, k: number) => Point;
  /** This function gives the legs of other routes that a leg can reach at any step. */
  readonly nearOf: (route: number, k: number) => readonly LegRef[];
}

/** A place that a term `gap` reads near boxes, and the part of the move of the variable that it takes. */
export interface Sample {
  readonly point: Point;
  readonly part: number;
}

/** A variable at one step of the solver, with its first point, its last point and their middle. */
export interface VariableView {
  readonly variable: Variable;
  readonly shift: number;
  readonly a: Point;
  readonly b: Point;
  readonly mid: Point;
  /** The places of a term `gap` near boxes. */
  readonly samples: readonly Sample[];
}

/** A compiled rule. It adds the slope of its energy against one variable to `g`. It adds one summand at a time, so the sum keeps one order of rounding. */
export type CompiledTerm = (view: VariableView, context: TermContext, g: number) => number;

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

/** This function compiles `w (shift / c)²`: the variable stays near its first place. */
function holdTerm(w: number): CompiledTerm {
  return (view, context, g) => g + (2 * w * view.shift) / (context.clearance * context.clearance);
}

/** This function compiles `w (|ab'|² + |a'b|²) / c²` for the two legs at the ends of a variable. A variable has both, because it does not move an end of its route. */
function springTerm(w: number): CompiledTerm {
  return ({ variable: v, a, b }, context, g) => {
    const c2 = context.clearance * context.clearance;
    const before = context.pointOf(v.route, v.k - 1);
    const after = context.pointOf(v.route, v.last + 1);
    const out = v.nx * (a.x - before.x) + v.ny * (a.y - before.y) + v.nx * (b.x - after.x) + v.ny * (b.y - after.y);
    return g + (2 * w * out) / c2;
  };
}

/** This function compiles `w (1 - d / D)²` over a sample of the legs of other routes, or over all near legs, for `d` under `D`. */
function pairGapTerm(w: number, distance: number | undefined): CompiledTerm {
  return ({ variable: v, mid }, context, g) => {
    const D = distance ?? context.clearance;
    const near = context.samples === 0 ? context.nearOf(v.route, v.k) : undefined;
    const count = near?.length ?? context.samples;
    let sum = g;
    for (let s = 0; s < count; s++) {
      const other = near?.[s] ?? context.all[Math.floor(context.random() * context.all.length)]!;
      if (other.route === v.route) continue;
      const q = nearestOn(mid, context.pointOf(other.route, other.k), context.pointOf(other.route, other.k + 1));
      const dx = mid.x - q.x;
      const dy = mid.y - q.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= D || d <= 1e-9) continue;
      // E = (1 - d / D)², so dE/dt = -2 (1 - d / D) / D × (n · (mid - q)) / d.
      sum += w * (((-2 * (1 - d / D)) / D) * ((v.nx * dx + v.ny * dy) / d));
    }
    return sum;
  };
}

/** This function compiles `w (1 - d / D)²` over the near boxes, at each sample of the variable. A point in a box has a negative `d`. */
function boxGapTerm(w: number, distance: number | undefined): CompiledTerm {
  return ({ variable: v, samples }, context, g) => {
    const D = distance ?? context.clearance;
    let sum = g;
    for (const bx of v.boxes) {
      for (const { point: p, part } of samples) {
        const q = nearestOfBox(p, bx);
        const inside = p.x >= bx.x && p.x <= bx.x + bx.w && p.y >= bx.y && p.y <= bx.y + bx.h;
        const dx = (inside ? q.x - p.x : p.x - q.x) || 0;
        const dy = (inside ? q.y - p.y : p.y - q.y) || 0;
        const d0 = Math.sqrt(dx * dx + dy * dy);
        if (d0 <= 1e-9) continue;
        const d = inside ? -d0 : d0;
        if (d >= D) continue;
        sum += w * part * (((-2 * (1 - d / D)) / D) * ((v.nx * dx + v.ny * dy) / d0));
      }
    }
    return sum;
  };
}

/**
 * This function adds the slope of `w cos²θ` of one leg with the direction `u`, at each crossing with a leg of another route.
 * The direction `u` changes with the variable by `side` times the direction `n` of the variable.
 */
function addAngle(sum: number, w: number, p: Point, q: Point, side: number, v: Variable, context: TermContext, k: number): number {
  const ux = q.x - p.x;
  const uy = q.y - p.y;
  const uu = ux * ux + uy * uy;
  if (uu <= 1e-9) return sum;
  const un = ux * v.nx + uy * v.ny;
  let out = sum;
  for (const other of context.nearOf(v.route, k)) {
    const c = context.pointOf(other.route, other.k);
    const d = context.pointOf(other.route, other.k + 1);
    if (!segmentsCross(p, q, c, d)) continue;
    const vx = d.x - c.x;
    const vy = d.y - c.y;
    const vv = vx * vx + vy * vy;
    if (vv <= 1e-9) continue;
    const uv = ux * vx + uy * vy;
    const vn = vx * v.nx + vy * v.ny;
    // E = (u · v)² / (|u|² |v|²), so dE/dt = 2 (u · v) (n · v) / (|u|² |v|²) - 2 (u · v)² (u · n) / (|u|⁴ |v|²), times the side.
    out += w * side * ((2 * uv * vn) / (uu * vv) - (2 * uv * uv * un) / (uu * uu * vv));
  }
  return out;
}

/** This function compiles `w cos²θ` at each crossing of the two legs at the ends of a variable (RULE-019, RULE-049). These two legs turn, and a leg between two moved points does not. */
function angleTerm(w: number): CompiledTerm {
  return ({ variable: v, a, b }, context, g) => {
    const before = context.pointOf(v.route, v.k - 1);
    const after = context.pointOf(v.route, v.last + 1);
    return addAngle(addAngle(g, w, before, a, 1, v, context, v.k - 1), w, b, after, -1, v, context, v.last);
  };
}

/** This function compiles one rule. */
function compileRule(rule: Rule): CompiledTerm {
  if (rule.term === "hold") return holdTerm(rule.weight);
  if (rule.term === "spring") return springTerm(rule.weight);
  if (rule.term === "angle") return angleTerm(rule.weight);
  return rule.select === "free-pairs" ? pairGapTerm(rule.weight, rule.distance) : boxGapTerm(rule.weight, rule.distance);
}

/** This function compiles a rule file into one term for each rule, in the order of the file. It throws on a file with a fault of `checkRules`. */
export function compileRules(set: RuleSet): readonly CompiledTerm[] {
  const faults = checkRules(set);
  if (faults.length > 0) throw new Error(faults.join(" "));
  return set.rules.map(compileRule);
}

/** This function gives the largest distance of a rule file, so the solver finds the boxes in its reach. */
export function reachOf(set: RuleSet, clearance: number): number {
  return Math.max(clearance, ...set.rules.map((r) => r.distance ?? clearance));
}
