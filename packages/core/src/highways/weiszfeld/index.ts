import { dist, type Point } from "../../geom.ts";
import { basePlan, nearestPlace, planRoutes, routeIndex, tidyPlan, tripsOf, type HighwayBase } from "../base.ts";
import { memberAt, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/** The options of the highway strategy `weiszfeld` (HWY-043 of the note on highways). */
export interface WeiszfeldOptions {
  /** The plan whose highways get new meeting points. The default is `shared-ways`. */
  readonly from: HighwayBase;
  /** The weight of the trunk is `k^alpha` for `k` members. With 0, the trunk costs its ink one time. With 1, it costs each lane. The default is 0.5. */
  readonly alpha: number;
  /** The number of steps of Weiszfeld. The default is 20. */
  readonly steps: number;
}

/** The default options of the strategy `weiszfeld`. */
export const WEISZFELD_DEFAULTS: Readonly<WeiszfeldOptions> = Object.freeze({ from: "shared-ways", alpha: 0.5, steps: 20 });

const TINY = 1e-9;

/** This function gives one step of Weiszfeld for the point `m`. The point `m` is near the points `ends`, and tied to `other` with the weight `w`. */
function weiszfeldStep(m: Point, ends: readonly Point[], other: Point, w: number): Point {
  let x = 0;
  let y = 0;
  let sum = 0;
  for (const p of ends) {
    const d = Math.max(TINY, dist(p, m));
    x += p.x / d;
    y += p.y / d;
    sum += 1 / d;
  }
  const d = Math.max(TINY, dist(other, m));
  x += (w * other.x) / d;
  y += (w * other.y) / d;
  sum += w / d;
  return sum > 0 ? { x: x / sum, y: y / sum } : m;
}

/** This function gives the mean of a list of points that is not empty. */
const mean = (ps: readonly Point[]): Point => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });

/**
 * This function gives the meeting points `M1` and `M2` of a bundle with the least weighted ink (HWY-043):
 * `Σ |a_i - M1| + w |M1 - M2| + Σ |M2 - b_i|`. The lists `a` and `b` are the ends of the edges on each side, and `w` is the weight of the trunk.
 * The function starts at the means of `a` and `b`. Each step moves `M1` and then `M2` by one step of Weiszfeld.
 */
export function meetingPoints(a: readonly Point[], b: readonly Point[], w: number, steps: number): [Point, Point] {
  if (a.length === 0 || b.length === 0) throw new Error("A side of the bundle has no end.");
  let m1 = mean(a);
  let m2 = mean(b);
  for (let s = 0; s < steps; s++) {
    m1 = weiszfeldStep(m1, a, m2, w);
    m2 = weiszfeldStep(m2, b, m1, w);
  }
  return [m1, m2];
}

/**
 * This function gives the highways of the plan `from`, with the meeting points of Weiszfeld (HWY-043).
 * The ends of a member are the points where its edge comes to the highway and goes away from it after `follow` of the plan.
 * They are the plugs, or the split point of the highway before and the merge point of the highway after.
 * The weight of the trunk is `k^alpha` for `k` members. The trunk stays on the spine: the function projects `M1` and `M2` on the spine.
 * Each member then joins the spine at `M1` and leaves it at `M2`, but not outside its own stretch. So a member only gets shorter on the spine.
 */
export function weiszfeldPlan(input: HighwayInput, o: Readonly<WeiszfeldOptions>): HighwayPlan {
  const plan = basePlan(input, o.from);
  if (plan.highways.length === 0) return plan;
  const routes = routeIndex(planRoutes(input.graph, plan).routes);
  const trips = tripsOf(plan);
  const highways = plan.highways.map((h, hi) => {
    const a: Point[] = [];
    const b: Point[] = [];
    for (const m of h.members) {
      const trip = trips.get(m.edge) ?? [];
      const route = routes.get(m.edge);
      const k = trip.findIndex((s) => s.h === hi);
      const before = k > 0 ? trip[k - 1]!.m.split : route?.[0];
      const after = k >= 0 && k < trip.length - 1 ? trip[k + 1]!.m.merge : route?.[route.length - 1];
      if (!before || !after) continue;
      if (m.on <= m.off) {
        a.push(before);
        b.push(after);
      } else {
        a.push(after);
        b.push(before);
      }
    }
    if (a.length < 2) return h;
    const [m1, m2] = meetingPoints(a, b, h.members.length ** Math.max(0, o.alpha), Math.max(0, Math.round(o.steps)));
    const pa = nearestPlace(h.spine, m1);
    const pb = nearestPlace(h.spine, m2);
    if (pb - pa <= 1e-6) return h;
    const members: HighwayMember[] = h.members.map((m) => {
      if (m.on <= m.off) {
        const on = Math.max(m.on, pa);
        const off = Math.min(m.off, pb);
        return off - on > 1e-6 ? memberAt(h.spine, m.edge, on, off, m.seq) : m;
      }
      const on = Math.min(m.on, pb);
      const off = Math.max(m.off, pa);
      return on - off > 1e-6 ? memberAt(h.spine, m.edge, on, off, m.seq) : m;
    });
    return { ...h, members };
  });
  return tidyPlan({ highways });
}
