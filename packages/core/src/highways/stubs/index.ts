import { center, dist, pointBoxDistance, type Point } from "../../geom.ts";
import { nodeIndex, type Node } from "../../model.ts";
import { pointOnSide, SIDE_NORMAL, sideToward } from "../../plugs.ts";
import { WayFinder } from "../../ways.ts";
import { basePlan, tidyPlan, tripsOf, type HighwayBase } from "../base.ts";
import { memberAt, type Highway, type HighwayInput, type HighwayPlan } from "../model.ts";

/** The ends of the edges that get stubs: the source ends, the target ends, or both. */
export type StubEnds = "source" | "target" | "both";

/** The options of the highway strategy `stubs` (HWY-015 with WILD-005 of the notes). */
export interface StubOptions {
  /** The plan that the stubs go into. The default is `shared-ways`. */
  readonly from: HighwayBase;
  /** The ends of one side of a box whose directions are in a window of this angle share a stub, in degrees. The default is 30. */
  readonly omega: number;
  /** The length of a stub is this share of the distance to the nearest other end. The default is 0.25. */
  readonly sigma: number;
  /** The ends that get stubs. The default is `both`. */
  readonly ends: StubEnds;
  /** A stub has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `stubs`. */
export const STUB_DEFAULTS: Readonly<StubOptions> = Object.freeze({ from: "shared-ways", omega: 30, sigma: 0.25, ends: "both", minSize: 2 });

/** One end of an edge that can get a stub. */
interface StubEnd {
  readonly edge: string;
  readonly node: Node;
  readonly other: Node;
  /** The angle from the normal of the side to the direction of the other node, in radians. A negative angle turns to the left. */
  readonly turn: number;
  /** The first merge point of the edge in the plan, from this end, or `undefined`. */
  readonly merge: Point | undefined;
}

/**
 * This function gives the highways of the plan `from`, with a stub at the ends of the edges (HWY-015, WILD-005).
 * The ends on one side of one box are sorted by the direction of their other node. A run of ends in a window of `omega` makes a group.
 * Each group of `minSize` ends or more shares one plug and one stub along the normal of the side. Then the edges fan out.
 *
 * The length of the stub is `sigma` times the distance to the nearest other node, and half that distance at most.
 * It is two times the margin of the way finder at least, and the stub stays out of the other boxes. Else the group gets no stub.
 * An end with a fixed plug or a side of its own gets no stub. An end whose first highway starts on its box, or near it, keeps the plan.
 */
export function stubPlan(input: HighwayInput, o: Readonly<StubOptions>): HighwayPlan {
  const graph = input.graph;
  const plan = basePlan(input, o.from);
  const trips = tripsOf(plan);
  const byId = nodeIndex(graph);
  const ways = new WayFinder(graph.nodes);
  const margin = ways.margin;
  const omega = (Math.max(0, o.omega) * Math.PI) / 180;
  const groups = new Map<string, StubEnd[]>();
  const add = (kind: "source" | "target", node: Node, other: Node, edge: string, merge: Point | undefined): void => {
    const side = sideToward(node.box, center(other.box));
    const n = SIDE_NORMAL[side];
    const c = center(node.box);
    const d = center(other.box);
    const dx = d.x - c.x;
    const dy = d.y - c.y;
    const turn = Math.atan2(n.x * dy - n.y * dx, n.x * dx + n.y * dy);
    const key = `${node.id}\u0000${kind}\u0000${side}`;
    const list = groups.get(key);
    const end: StubEnd = { edge, node, other, turn, merge };
    if (list) list.push(end);
    else groups.set(key, [end]);
  };
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t || s === t) continue;
    const trip = trips.get(e.id);
    if (o.ends !== "target" && e.source.port === undefined) add("source", s, t, e.id, trip?.[0]?.m.merge);
    if (o.ends !== "source" && e.target.port === undefined) add("target", t, s, e.id, trip?.[trip.length - 1]?.m.split);
  }

  const stubs: Highway[] = [];
  for (const [key, list] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const [, kind, side] = key.split("\u0000") as [string, "source" | "target", keyof typeof SIDE_NORMAL];
    list.sort((a, b) => a.turn - b.turn || (a.edge < b.edge ? -1 : 1));
    // The runs of ends in a window of omega.
    const runs: StubEnd[][] = [];
    for (const end of list) {
      const run = runs[runs.length - 1];
      if (run && end.turn - run[0]!.turn <= omega) run.push(end);
      else runs.push([end]);
    }
    for (const run of runs) {
      if (run.length < Math.max(2, o.minSize)) continue;
      const node = run[0]!.node;
      const n = SIDE_NORMAL[side];
      const toward = { x: run.reduce((s, r) => s + center(r.other.box).x, 0) / run.length, y: run.reduce((s, r) => s + center(r.other.box).y, 0) / run.length };
      const plug = pointOnSide(node.box, side, toward);
      const span = Math.min(...run.map((r) => dist(plug, center(r.other.box))));
      const gap = Math.min(...run.map((r) => pointBoxDistance(plug, r.other.box)));
      let len = Math.min(Math.max(0, o.sigma) * span, gap / 2);
      const skip = new Set([node]);
      const tip = (l: number): Point => ({ x: plug.x + n.x * l, y: plug.y + n.y * l });
      while (len >= 2 * margin && !ways.obstacles.clear(tip(margin / 2), tip(len), margin / 2, skip)) len /= 2;
      if (len < 2 * margin) continue;
      // An end whose highway starts on the box, or near the tip, keeps the plan.
      const kept = run.filter((r) => r.merge === undefined || pointBoxDistance(r.merge, node.box) > 2 * len);
      if (kept.length < Math.max(2, o.minSize)) continue;
      const end = tip(len);
      const spine = kind === "source" ? [plug, end] : [end, plug];
      // Lane 0 is on the left of the spine. At a source, the left lane turns most to the left. At a target, the order turns over.
      const lanes = kept.map((r) => r.edge);
      if (kind === "target") lanes.reverse();
      const seq = kind === "source" ? -1 : Number.MAX_SAFE_INTEGER;
      stubs.push({ id: "", key: `stub:${node.id}:${kind}:${side}`, spine, lanes, members: lanes.map((edge) => memberAt(spine, edge, 0, 1, seq)) });
    }
  }
  return tidyPlan({ highways: [...plan.highways, ...stubs] });
}
