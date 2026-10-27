import { dist, type Point } from "../../geom.ts";
import { basePlan, firstRoutes, tidyPlan, type HighwayBase } from "../base.ts";
import { lengthBetween, memberAt, pointAt, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/** The options of the highway strategy `meet` (HWY-050 of the note on highways). */
export interface MeetOptions {
  /** The plan whose merge points and split points the strategy moves. The default is `shared-ways`. */
  readonly from: HighwayBase;
  /** A first route meets the spine where it is this distance from the spine, or nearer. The default is 8: two lanes of 4. */
  readonly near: number;
  /** A first route meets the spine only where it runs at this angle to the spine, or less, in degrees. The default is 45. */
  readonly maxTurn: number;
  /** A member keeps its places when the stretch where its first route meets the spine is shorter than this length. The default is 10. */
  readonly minRun: number;
}

/** The default options of the strategy `meet`. */
export const MEET_DEFAULTS: Readonly<MeetOptions> = Object.freeze({ from: "shared-ways", near: 8, maxTurn: 45, minRun: 10 });

/** This function gives the distance from a point to a polyline, and the unit direction of the nearest leg. */
function nearestLeg(line: readonly Point[], p: Point): { d: number; ux: number; uy: number } {
  let best = { d: Infinity, ux: 1, uy: 0 };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = dist(a, b);
    if (len <= 1e-9) continue;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)));
    const d = dist(p, { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    if (d < best.d) best = { d, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len };
  }
  return best;
}

/**
 * This function gives a member with its merge point and its split point where its first route meets the spine and parts from it (HWY-050).
 * The function samples the stretch of the member on the spine, at steps of `near / 2` or less.
 * A sample meets the route when the route is `near` or nearer, and its nearest leg runs at `maxTurn` or less to the spine.
 * The new merge point is the first sample that meets the route, in the direction of the member. The new split point is the last one.
 * So the edge joins the spine late and leaves it early. The places only move inward.
 * The member keeps its places when no sample meets the route, or when the met stretch is shorter than `minRun`.
 */
export function meetMember(spine: readonly Point[], member: HighwayMember, route: readonly Point[] | undefined, o: Readonly<MeetOptions>): HighwayMember {
  if (!route || route.length < 2 || spine.length < 2) return member;
  const lo = Math.min(member.on, member.off);
  const hi = Math.max(member.on, member.off);
  const cos = Math.cos((Math.max(0, Math.min(90, o.maxTurn)) * Math.PI) / 180);
  const step = Math.max(1e-3, o.near / 2);
  let first = Infinity;
  let last = -Infinity;
  for (let i = Math.floor(lo); i < Math.min(spine.length - 1, Math.ceil(hi)); i++) {
    const from = Math.max(lo, i);
    const to = Math.min(hi, i + 1);
    if (to <= from) continue;
    const a = spine[i]!;
    const b = spine[i + 1]!;
    const len = dist(a, b);
    if (len <= 1e-9) continue;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    const n = Math.min(256, Math.max(1, Math.ceil(((to - from) * len) / step)));
    for (let j = 0; j <= n; j++) {
      const at = from + ((to - from) * j) / n;
      const leg = nearestLeg(route, pointAt(spine, at));
      if (leg.d > o.near || Math.abs(leg.ux * tx + leg.uy * ty) < cos - 1e-12) continue;
      first = Math.min(first, at);
      last = Math.max(last, at);
    }
  }
  if (!(last > first) || lengthBetween(spine, first, last) < o.minRun) return member;
  return member.on <= member.off ? memberAt(spine, member.edge, first, last, member.seq) : memberAt(spine, member.edge, last, first, member.seq);
}

/**
 * This function gives the highways of the plan `from`, with merge points and split points where the routes meet and part (HWY-050).
 * The first route of each edge is the route of `input.routes`, or its route without highways.
 * Each member gets the places of `meetMember`. The spines and the trips do not change.
 */
export function meetPlan(input: HighwayInput, o: Readonly<MeetOptions>): HighwayPlan {
  const plan = basePlan(input, o.from);
  if (plan.highways.length === 0) return plan;
  const first = firstRoutes(input);
  return tidyPlan({ highways: plan.highways.map((h) => ({ ...h, members: h.members.map((m) => meetMember(h.spine, m, first.get(m.edge), o)) })) });
}
