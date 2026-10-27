import { boardUnit, segmentKey } from "../../bench/measures/routes.ts";
import { dist, type Point } from "../../geom.ts";
import { Grid, segmentBounds } from "../../grid.ts";
import { WayFinder } from "../../ways.ts";
import { basePlan, orderAlongRoutes, planRoutes, routeIndex, tidyPlan, type HighwayBase } from "../base.ts";
import { memberAt, type Highway, type HighwayInput, type HighwayPlan } from "../model.ts";

/** The options of the highway strategy `zipper` (NAT-022 with WILD-037 of the notes). */
export interface ZipperOptions {
  /** The plan whose routes the zipper joins. The default is `shared-ways`. */
  readonly from: HighwayBase;
  /** Two legs zip when they are this distance apart or nearer, in units of the board (the median short side of the boxes). The default is 1. */
  readonly near: number;
  /** Two legs zip when the angle between them is this value or less, in degrees. The default is 15. */
  readonly maxAngle: number;
  /** The adhesion over the tension: two legs zip when `adhesion * overlap` is more than the length that the zip adds. The default is 0.3. */
  readonly adhesion: number;
  /** Two legs zip when they overlap along this length or more, in units of the board. The default is 1. */
  readonly minOverlap: number;
  /** The number of passes. Each pass routes the plan and zips the legs again. The default is 1. */
  readonly passes: number;
}

/** The default options of the strategy `zipper`. */
export const ZIPPER_DEFAULTS: Readonly<ZipperOptions> = Object.freeze({ from: "shared-ways", near: 1, maxAngle: 15, adhesion: 0.3, minOverlap: 1, passes: 1 });

/** One leg of a route that no other route shares. */
interface Leg {
  readonly edge: string;
  readonly a: Point;
  readonly b: Point;
  readonly len: number;
}

/** A pair of legs that can zip, with the line of the zip. */
export interface Zip {
  readonly gain: number;
  /** The first point of the zipped line. */
  readonly from: Point;
  /** The last point of the zipped line. */
  readonly to: Point;
  /** This value is `true` when the leg goes from `from` to `to`, for each of the two legs. */
  readonly forward: readonly [boolean, boolean];
}

/** The limits of `zipLegs`, in the units of the board. */
export interface ZipLimits {
  readonly near: number;
  readonly maxAngle: number;
  readonly adhesion: number;
  readonly minOverlap: number;
}

/**
 * This function tells if two legs zip (NAT-022), and gives the zipped line.
 * The zipped line is the mean of the two legs, with the weight of their lengths, along the stretch where they overlap.
 * The legs zip when the angle between them is `maxAngle` or less, and they are `near` or nearer along the overlap.
 * The overlap must be `minOverlap` or more.
 * The zip adds two jogs to each leg, so it adds the length `2 (d_a + d_b)`, with the distances of the legs to the zipped line.
 * The legs zip only when `adhesion * overlap` is more than that length.
 */
export function zipLegs(a0: Point, a1: Point, b0: Point, b1: Point, o: ZipLimits): Zip | undefined {
  const la = dist(a0, a1);
  const lb = dist(b0, b1);
  if (la <= 1e-9 || lb <= 1e-9) return undefined;
  const ua = { x: (a1.x - a0.x) / la, y: (a1.y - a0.y) / la };
  const ub = { x: (b1.x - b0.x) / lb, y: (b1.y - b0.y) / lb };
  const dot = ua.x * ub.x + ua.y * ub.y;
  if (Math.abs(dot) < Math.cos((o.maxAngle * Math.PI) / 180) - 1e-12) return undefined;
  const sign = dot >= 0 ? 1 : -1;
  const dx = ua.x * la + sign * ub.x * lb;
  const dy = ua.y * la + sign * ub.y * lb;
  const dl = Math.hypot(dx, dy);
  if (dl <= 1e-9) return undefined;
  const u = { x: dx / dl, y: dy / dl };
  const o0 = { x: ((a0.x + a1.x) * la + (b0.x + b1.x) * lb) / (2 * (la + lb)), y: ((a0.y + a1.y) * la + (b0.y + b1.y) * lb) / (2 * (la + lb)) };
  const along = (p: Point): number => (p.x - o0.x) * u.x + (p.y - o0.y) * u.y;
  const across = (p: Point): number => (p.x - o0.x) * u.y - (p.y - o0.y) * u.x;
  const ta = [along(a0), along(a1)] as const;
  const tb = [along(b0), along(b1)] as const;
  const lo = Math.max(Math.min(...ta), Math.min(...tb));
  const hi = Math.min(Math.max(...ta), Math.max(...tb));
  const overlap = hi - lo;
  if (overlap < o.minOverlap || overlap <= 1e-9) return undefined;
  // The offset of a leg from the zipped line at the place t along it.
  const offset = (p0: Point, p1: Point, t0: number, t1: number, t: number): number => {
    const s = Math.abs(t1 - t0) <= 1e-12 ? 0 : (t - t0) / (t1 - t0);
    return across({ x: p0.x + (p1.x - p0.x) * s, y: p0.y + (p1.y - p0.y) * s });
  };
  let jog = 0;
  for (const t of [lo, hi]) {
    const da = offset(a0, a1, ta[0], ta[1], t);
    const db = offset(b0, b1, tb[0], tb[1], t);
    if (Math.abs(da - db) > o.near) return undefined;
    jog += Math.abs(da) + Math.abs(db);
  }
  const gain = o.adhesion * overlap - jog;
  if (!(gain > 0)) return undefined;
  const from = { x: o0.x + u.x * lo, y: o0.y + u.y * lo };
  const to = { x: o0.x + u.x * hi, y: o0.y + u.y * hi };
  return { gain, from, to, forward: [ua.x * u.x + ua.y * u.y > 0, ub.x * u.x + ub.y * u.y > 0] };
}

/**
 * This function gives the highways of the plan `from`, with the legs that run near and nearly parallel zipped together (NAT-022, WILD-037).
 * A pass routes the plan with `follow` and takes each leg that no other route shares. A grid of the legs finds the near pairs.
 * The pairs that zip (`zipLegs`) go from the largest gain to the smallest, and each leg zips one time in a pass at most.
 * A zipped line that goes into a box, made larger by 1, does not zip.
 * Each zip is a new highway of two members. The `seq` of each member follows the place of its merge point along the route of the edge.
 */
export function zipperPlan(input: HighwayInput, o: Readonly<ZipperOptions>): HighwayPlan {
  const graph = input.graph;
  const unit = boardUnit(graph);
  const limits: ZipLimits = { near: o.near * unit, maxAngle: o.maxAngle, adhesion: o.adhesion, minOverlap: Math.max(1e-6, o.minOverlap * unit) };
  const obstacles = new WayFinder(graph.nodes).obstacles;
  let plan = basePlan(input, o.from);
  for (let pass = 0; pass < Math.max(1, Math.round(o.passes)); pass++) {
    const routes = planRoutes(graph, plan).routes;
    const users = new Map<string, number>();
    for (const r of routes) {
      const own = new Set<string>();
      for (let i = 1; i < r.points.length; i++) {
        const k = segmentKey(r.points[i - 1]!, r.points[i]!);
        if (k !== undefined) own.add(k);
      }
      for (const k of own) users.set(k, (users.get(k) ?? 0) + 1);
    }
    const legs: Leg[] = [];
    for (const r of routes)
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1]!;
        const b = r.points[i]!;
        const k = segmentKey(a, b);
        const len = dist(a, b);
        if (k === undefined || (users.get(k) ?? 0) > 1 || len < limits.minOverlap) continue;
        legs.push({ edge: r.edge, a, b, len });
      }
    const grid = new Grid<number>(Math.max(32, 4 * limits.near));
    legs.forEach((l, i) => {
      const bx = segmentBounds(l.a, l.b);
      grid.add(i, { x: bx.x - limits.near, y: bx.y - limits.near, w: bx.w + 2 * limits.near, h: bx.h + 2 * limits.near });
    });
    const found: { i: number; j: number; zip: Zip }[] = [];
    legs.forEach((l, i) => {
      grid.query(segmentBounds(l.a, l.b), (j) => {
        if (j <= i || legs[j]!.edge === l.edge) return;
        const m = legs[j]!;
        const zip = zipLegs(l.a, l.b, m.a, m.b, limits);
        if (zip) found.push({ i, j, zip });
      });
    });
    found.sort((p, q) => q.zip.gain - p.zip.gain || p.i - q.i || p.j - q.j);
    const used = new Set<number>();
    const added: Highway[] = [];
    for (const { i, j, zip } of found) {
      if (used.has(i) || used.has(j)) continue;
      if (!obstacles.clear(zip.from, zip.to, 1)) continue;
      used.add(i);
      used.add(j);
      const spine = [zip.from, zip.to];
      const members = [legs[i]!, legs[j]!].map((l, k) => (zip.forward[k] ? memberAt(spine, l.edge, 0, 1) : memberAt(spine, l.edge, 1, 0)));
      added.push({ id: "", key: `zip${pass}`, spine, lanes: members.map((m) => m.edge), members });
    }
    if (added.length === 0) break;
    plan = tidyPlan(orderAlongRoutes({ highways: [...plan.highways, ...added] }, routeIndex(routes)));
  }
  return tidyPlan(plan);
}
