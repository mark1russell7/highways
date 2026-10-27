import type { Result } from "../model.ts";
import { segmentsOf } from "../segments.ts";
import { memberAt, type Highway, type HighwayMember, type HighwayPlan } from "./model.ts";

/**
 * This function gives the highways of a result of a router: one highway for each shared run and for each trunk of a bundle.
 * The spine is the points of the run or of the trunk. Each edge of the run is a member, from one end of the spine to the other end, in the way of its route.
 * The member `seq` is the place of the shared stretch in the route of the edge. The lanes keep the lane order of the router.
 *
 * Thus `follow` routes each edge along the shared stretches of the router. A route that does not hold its run is not a member.
 */
export function planOfResult(result: Result): HighwayPlan {
  const graph = segmentsOf(result);
  const keys = new Map<string, string>([...(result.runs ?? []).map((r) => [r.id, r.key] as const), ...(result.bundles ?? []).map((b) => [b.id, b.key] as const)]);
  const shared = graph.segments.filter((s) => s.count > 1);
  const ids = new Set(shared.map((s) => s.id));
  const place = new Map<string, { seq: number; reverse: boolean }>();
  for (const path of graph.paths) {
    let seq = 0;
    for (const ref of path.segments) if (ids.has(ref.segment)) place.set(`${ref.segment}\u0000${path.edge}`, { seq: seq++, reverse: ref.reverse });
  }
  const highways: Highway[] = [];
  for (const s of shared) {
    const last = s.points.length - 1;
    const members: HighwayMember[] = [];
    for (const edge of s.edges) {
      const at = place.get(`${s.id}\u0000${edge}`);
      if (at) members.push(at.reverse ? memberAt(s.points, edge, last, 0, at.seq) : memberAt(s.points, edge, 0, last, at.seq));
    }
    if (members.length < 2) continue;
    highways.push({ id: `h${highways.length}`, key: keys.get(s.id) ?? s.id, spine: s.points, lanes: members.map((m) => m.edge), members });
  }
  return { highways };
}
