import { dist, type Point } from "../../geom.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";
import { meetingPoints } from "../weiszfeld/index.ts";

/** The options of the highway strategy `mingle` (HWY-003 of the note on highways). */
export interface MingleOptions {
  /** Each bundle looks for a merge among this number of nearest bundles in 4D. The default is 8. */
  readonly k: number;
  /** The largest turn of an edge at a meeting point, in degrees. A larger turn moves the meeting point along the trunk. The default is 40. */
  readonly maxTurn: number;
  /** The number of levels of merges. The default is 6. */
  readonly levels: number;
  /** The weight of the trunk in the ink. With 1, the trunk costs its length one time. The default is 1. */
  readonly weight: number;
  /** A bundle with this number of edges or more gets highways. The default is 2. */
  readonly minSize: number;
  /** The spine of each bundle. The default is `trunk`: one trunk between the two meeting points. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `mingle`. */
export const MINGLE_DEFAULTS: Readonly<MingleOptions> = Object.freeze({ k: 8, maxTurn: 40, levels: 6, weight: 1, minSize: 2, spine: "trunk" });

/** One bundle of MINGLE: its edges with their direction, the ends on each side, the two meeting points and the ink. */
interface Bundle {
  readonly edges: readonly { readonly edge: string; readonly flip: boolean }[];
  readonly a: readonly Point[];
  readonly b: readonly Point[];
  readonly m1: Point;
  readonly m2: Point;
  readonly ink: number;
}

/** The number of steps of Weiszfeld for the meeting points of a bundle. */
const STEPS = 12;

/** This function gives the turn in degrees from the direction `p` to `q` to the direction `q` to `r`. A leg of length 0 gives no turn. */
function turnAt(p: Point, q: Point, r: Point): number {
  const ux = q.x - p.x;
  const uy = q.y - p.y;
  const vx = r.x - q.x;
  const vy = r.y - q.y;
  if (Math.hypot(ux, uy) < 1e-9 || Math.hypot(vx, vy) < 1e-9) return 0;
  return (Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) * 180) / Math.PI;
}

/** The number of steps of the bisection that moves a meeting point to the turn limit. */
const SLIDE_STEPS = 24;

/** This function gives the point at the share `t` of the way from `p` to `q`. */
function lerp(p: Point, q: Point, t: number): Point {
  return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
}

/**
 * This function moves the meeting point `m` along the trunk to the meeting point `far`. It stops when each end of `ends` turns at most `maxTurn` degrees at `m`.
 * The turn of each end gets smaller when `m` moves to `far`, so a bisection finds the smallest move. The point stays at most at the middle of the trunk.
 * The function gives `undefined` when the middle of the trunk does not obey the limit.
 */
function slide(m: Point, far: Point, ends: readonly Point[], maxTurn: number): Point | undefined {
  const worst = (p: Point): number => Math.max(...ends.map((e) => turnAt(e, p, far)));
  if (worst(m) <= maxTurn) return m;
  if (worst(lerp(m, far, 0.5)) > maxTurn) return undefined;
  let lo = 0;
  let hi = 0.5;
  for (let s = 0; s < SLIDE_STEPS; s++) {
    const mid = (lo + hi) / 2;
    if (worst(lerp(m, far, mid)) <= maxTurn) hi = mid;
    else lo = mid;
  }
  return lerp(m, far, hi);
}

/**
 * This function gives the bundle of the ends `a` and `b`, with its meeting points and its ink. A turn that is too large gives `undefined`.
 * The ink is `Σ |a_i - M1| + w |M1 - M2| + Σ |M2 - b_i|`. Each edge turns at most `maxTurn` degrees at `M1` and at `M2`.
 * As in MINGLE, a meeting point with a larger turn moves along the trunk to the other meeting point, until the turns obey the limit.
 */
function bundleOf(edges: Bundle["edges"], a: readonly Point[], b: readonly Point[], o: Readonly<MingleOptions>): Bundle | undefined {
  const [w1, w2] = meetingPoints(a, b, o.weight, STEPS);
  if (dist(w1, w2) < 1e-6) return undefined;
  const m1 = slide(w1, w2, a, o.maxTurn);
  const m2 = slide(w2, w1, b, o.maxTurn);
  if (!m1 || !m2) return undefined;
  let ink = o.weight * dist(m1, m2);
  for (let i = 0; i < a.length; i++) ink += dist(a[i]!, m1) + dist(m2, b[i]!);
  return { edges, a, b, m1, m2, ink };
}

/** This function gives the bundle of `p` and `q`, with `q` turned around when `flip` is `true`. */
function merged(p: Bundle, q: Bundle, flip: boolean, o: Readonly<MingleOptions>): Bundle | undefined {
  const edges = [...p.edges, ...q.edges.map((e) => ({ edge: e.edge, flip: e.flip !== flip }))];
  return bundleOf(edges, [...p.a, ...(flip ? q.b : q.a)], [...p.b, ...(flip ? q.a : q.b)], o);
}

/** This function gives the 4D distance of two bundles by their meeting points, and `flip` when the opposite direction is nearer. */
function distance4(p: Bundle, q: Bundle): { d: number; flip: boolean } {
  const direct = Math.hypot(dist(p.m1, q.m1), dist(p.m2, q.m2));
  const back = Math.hypot(dist(p.m1, q.m2), dist(p.m2, q.m1));
  return back < direct ? { d: back, flip: true } : { d: direct, flip: false };
}

/**
 * This function gives the bundles of MINGLE (Gansner, Hu, North and Scheidegger 2011) as groups of edges.
 * Each edge is a point in 4D: its two plugs. At each level, each bundle examines its `k` nearest bundles in 4D.
 * A merge saves ink when the ink of the joint bundle is less than the sum of the two inks. The merges with the largest gain go first.
 * A bundle merges one time at most in a level. The levels stop after `levels` levels, or when no merge saves ink.
 */
export function mingleBundles(input: HighwayInput, o: Readonly<MingleOptions>): Map<string, EdgeGroup> {
  let bundles: Bundle[] = edgePlugs(input.graph).map(({ edge, ps, pt }) => ({
    edges: [{ edge: edge.id, flip: false }],
    a: [ps.point],
    b: [pt.point],
    m1: ps.point,
    m2: pt.point,
    ink: dist(ps.point, pt.point),
  }));
  const k = Math.max(1, Math.round(o.k));
  for (let level = 0; level < Math.round(o.levels); level++) {
    const offers: { i: number; j: number; gain: number; joint: Bundle }[] = [];
    const tried = new Set<number>();
    const n = bundles.length;
    bundles.forEach((p, i) => {
      const near = bundles
        .map((q, j) => ({ j, ...distance4(p, q) }))
        .filter((x) => x.j !== i)
        .sort((x, y) => x.d - y.d || x.j - y.j)
        .slice(0, k);
      for (const { j, flip } of near) {
        const lo = Math.min(i, j);
        const hi = Math.max(i, j);
        if (tried.has(lo * n + hi)) continue;
        tried.add(lo * n + hi);
        const joint = merged(bundles[lo]!, bundles[hi]!, flip, o);
        if (!joint) continue;
        const gain = bundles[lo]!.ink + bundles[hi]!.ink - joint.ink;
        if (gain > 1e-9) offers.push({ i: lo, j: hi, gain, joint });
      }
    });
    if (offers.length === 0) break;
    offers.sort((x, y) => y.gain - x.gain || x.i - y.i || x.j - y.j);
    const used = new Set<number>();
    const next: Bundle[] = [];
    for (const x of offers) {
      if (used.has(x.i) || used.has(x.j)) continue;
      used.add(x.i);
      used.add(x.j);
      next.push(x.joint);
    }
    bundles.forEach((p, i) => {
      if (!used.has(i)) next.push(p);
    });
    bundles = next;
  }
  const groups = new Map<string, EdgeGroup>();
  bundles.forEach((p, i) => {
    for (const e of p.edges) groups.set(e.edge, { key: `m${i}`, flip: e.flip });
  });
  return groups;
}

/**
 * This function gives the highways of MINGLE (HWY-003). The bundles of `mingleBundles` with `minSize` edges or more get highways.
 * With the spine `trunk`, each bundle gets one trunk between its two meeting points, through the corner graph.
 * With `shared`, the edges of each bundle share their ways through the corner graph.
 */
export function minglePlan(input: HighwayInput, o: Readonly<MingleOptions>): HighwayPlan {
  return groupedPlan(input, mingleBundles(input, o), { spine: o.spine, minSize: o.minSize });
}
