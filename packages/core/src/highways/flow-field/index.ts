import type { Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The end of the edges that gets a field: the target of a fan-in, or the source of a fan-out. */
export type FieldEnd = "target" | "source";

/** The options of the highway strategy `flow-field` (EDA-046 with HWY-037 of the notes). */
export interface FlowFieldOptions extends Pick<WayOptions, "margin" | "k"> {
  /** An end with this number of edges or more on one side of its box gets a field. The default is 2. */
  readonly minFanIn: number;
  /** The end that gets a field. The default is `target`. */
  readonly end: FieldEnd;
}

/** The default options of the strategy `flow-field`. */
export const FLOW_FIELD_DEFAULTS: Readonly<Required<Omit<FlowFieldOptions, "margin" | "k">>> = Object.freeze({ minFanIn: 2, end: "target" });

/**
 * This function gives the highways of a flow field for each target (EDA-046, HWY-037).
 * The edges into one side of one box make a fan. The root of the fan is the point out of the median plug of the fan.
 * Each edge of the fan goes the shortest way from the point out of its other plug to the root, through the corner graph.
 * The shortest ways to one root make a tree, so they merge like streams and do not cross. Each stretch that two ways share is one highway.
 * With the end `source`, the same holds for the edges out of one side of one box.
 */
export function flowFieldPlan(input: HighwayInput, o: Readonly<FlowFieldOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const fans = new Map<string, { edge: string; root: Point; far: Point; along: number }[]>();
  for (const { edge, ps, pt } of edgePlugs(input.graph)) {
    const [near, far, node] = o.end === "target" ? [pt, ps, edge.target.node] : [ps, pt, edge.source.node];
    const key = `${node}\u0000${near.normal.x},${near.normal.y}`;
    const item = { edge: edge.id, root: finder.out(near), far: finder.out(far), along: near.normal.x === 0 ? near.point.x : near.point.y };
    const list = fans.get(key);
    if (list) list.push(item);
    else fans.set(key, [item]);
  }
  const ways: KeyedWay[] = [];
  for (const [key, fan] of fans) {
    if (fan.length < Math.max(2, o.minFanIn)) continue;
    const sorted = [...fan].sort((a, b) => a.along - b.along || (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
    const root = sorted[Math.floor((sorted.length - 1) / 2)]!.root;
    for (const f of fan) {
      const way = finder.corners.path(f.far, root);
      if (way) ways.push({ edge: f.edge, key, points: o.end === "target" ? way : [...way].reverse() });
    }
  }
  return sharedStretches(ways, { minSize: 2, pull: (p) => finder.corners.pull(p) });
}
