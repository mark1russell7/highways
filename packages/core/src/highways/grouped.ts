import { dist, polylineLength, type Point } from "../geom.ts";
import { orderLanes } from "../segments.ts";
import { WayFinder, type WayOptions } from "../ways.ts";
import { tidyPlan } from "./base.ts";
import { memberAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "./model.ts";
import { sharedWaysPlan } from "./shared-ways/index.ts";
import { edgePlugs } from "./stretches.ts";

/**
 * The spine of a group of edges. With `shared`, the edges of each group go through the router `shared` with the group as their key.
 * Each stretch that they share is a highway. With `trunk`, each group gets one trunk between two terminals, with a leg from each plug.
 */
export type GroupSpine = "shared" | "trunk";

/** The values of `GroupSpine`. */
export const GROUP_SPINES: readonly GroupSpine[] = Object.freeze(["shared", "trunk"]);

/** The group of one edge: its key, and `flip` when the edge goes from the second end of the group to the first end. */
export interface EdgeGroup {
  readonly key: string;
  readonly flip: boolean;
}

/** The options of `groupedPlan`. */
export interface GroupedOptions extends WayOptions {
  readonly spine: GroupSpine;
  /** A group has this number of edges or more. The value is 2 or more. */
  readonly minSize: number;
  /**
   * With the spine `trunk`, an edge rides the trunk only when each of its legs is this share of the span or shorter.
   * The span is the distance between the two terminals. `Infinity` sets no limit.
   */
  readonly legMax?: number;
}

/**
 * This function gives the geometric median of points (the Weber point), with the iterations of Weiszfeld.
 * The point has the least sum of the distances to the points.
 */
export function weberPoint(points: readonly Point[], iterations = 32): Point {
  if (points.length === 0) throw new Error("The list has no point.");
  let p = { x: points.reduce((s, q) => s + q.x, 0) / points.length, y: points.reduce((s, q) => s + q.y, 0) / points.length };
  for (let k = 0; k < iterations; k++) {
    let wx = 0;
    let wy = 0;
    let w = 0;
    for (const q of points) {
      const d = dist(p, q);
      if (d < 1e-9) return q;
      wx += q.x / d;
      wy += q.y / d;
      w += 1 / d;
    }
    const next = { x: wx / w, y: wy / w };
    if (dist(next, p) < 1e-6) return next;
    p = next;
  }
  return p;
}

/**
 * This function gives the highways of the groups of edges. Only the edges in `groups` ride a highway, and each group needs `minSize` edges.
 * The spine `shared` gives the shared stretches of the router `shared` with the group as the key.
 * The spine `trunk` gives one trunk for each group, through the corner graph between two terminals.
 * A terminal is the Weber point of the points out of the plugs at one end of the group. A terminal in a box moves to the nearest of those points.
 */
export function groupedPlan(input: HighwayInput, groups: ReadonlyMap<string, EdgeGroup>, o: Readonly<GroupedOptions>): HighwayPlan {
  const min = Math.max(2, o.minSize);
  const size = new Map<string, number>();
  for (const g of groups.values()) size.set(g.key, (size.get(g.key) ?? 0) + 1);
  const big = (edge: string): EdgeGroup | undefined => {
    const g = groups.get(edge);
    return g && (size.get(g.key) ?? 0) >= min ? g : undefined;
  };
  const way: WayOptions = { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) };
  if (o.spine === "shared") return sharedWaysPlan(input, { ...way, rule: (e) => big(e.id)?.key });

  const finder = new WayFinder(input.graph.nodes, way);
  const byKey = new Map<string, { edge: string; flip: boolean; a: Point; b: Point; ps: Point; pt: Point }[]>();
  for (const { edge, ps, pt } of edgePlugs(input.graph)) {
    const g = big(edge.id);
    if (!g) continue;
    const os = finder.out(ps);
    const ot = finder.out(pt);
    const item = g.flip ? { edge: edge.id, flip: true, a: ot, b: os, ps: ps.point, pt: pt.point } : { edge: edge.id, flip: false, a: os, b: ot, ps: ps.point, pt: pt.point };
    const list = byKey.get(g.key);
    if (list) list.push(item);
    else byKey.set(g.key, [item]);
  }
  const pad = finder.margin / 2;
  const terminal = (points: readonly Point[]): Point => {
    const p = weberPoint(points);
    if (!finder.obstacles.inside(p, pad)) return p;
    let best = points[0]!;
    for (const q of points) if (dist(q, p) < dist(best, p)) best = q;
    return best;
  };
  const highways: Highway[] = [];
  const legMax = o.legMax ?? Infinity;
  for (const [key, list] of byKey) {
    if (list.length < min) continue;
    const ta = terminal(list.map((x) => x.a));
    const tb = terminal(list.map((x) => x.b));
    const span = dist(ta, tb);
    if (span <= finder.margin) continue;
    const riders = list.filter((x) => dist(x.a, ta) <= legMax * span && dist(x.b, tb) <= legMax * span);
    if (riders.length < min) continue;
    const raw = finder.corners.path(ta, tb);
    if (!raw) continue;
    const spine = finder.corners.pull(raw);
    if (spine.length < 2 || polylineLength(spine) <= 1e-6) continue;
    const last = spine.length - 1;
    const lanes = orderLanes(
      spine,
      riders.map((x) => ({ edge: x.edge, points: x.flip ? [x.ps, x.b, ...[...spine].reverse(), x.a, x.pt] : [x.ps, x.a, ...spine, x.b, x.pt] })),
      "bundle",
    );
    const byEdge = new Map(riders.map((x) => [x.edge, x]));
    const members: HighwayMember[] = lanes.map((edge) => (byEdge.get(edge)!.flip ? memberAt(spine, edge, last, 0) : memberAt(spine, edge, 0, last)));
    highways.push({ id: `h${highways.length}`, key, spine, lanes, members });
  }
  return tidyPlan({ highways });
}
