import type { Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { basePlan, tidyPlan, type HighwayBase } from "../base.ts";
import { pointAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/** The side of the road that the traffic keeps to. */
export type TrafficRule = "right" | "left";

/** The values of `TrafficRule`. */
export const TRAFFIC_RULES: readonly TrafficRule[] = Object.freeze(["right", "left"]);

/** The options of the highway strategy `divided` (HWY-011 of the notes). */
export interface DividedOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The plan that the strategy divides. The default is `shared-ways`. */
  readonly from: HighwayBase;
  /** The side of the road of the traffic. With `right`, the edges of each direction keep to the right of the spine. The default is `right`. */
  readonly rule: TrafficRule;
  /** The gap between the two carriageways, in lanes. The default is 1. */
  readonly gap: number;
  /** The width of one lane, in units of the board. The default is 4. */
  readonly laneWidth: number;
  /** A highway divides only when each direction has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `divided`. */
export const DIVIDED_DEFAULTS: Readonly<Required<Omit<DividedOptions, "margin" | "k">>> = Object.freeze({
  from: "shared-ways",
  rule: "right",
  gap: 1,
  laneWidth: 4,
  minSize: 2,
});

/** The largest length of a miter, as a multiple of the offset. A sharper corner gets a shorter miter. */
const MITER = 2;

/**
 * This function gives the polyline at the distance `offset` from `line`, with the same number of points. A positive offset is on the right of the line.
 * The y axis points down, so the right of the direction `(dx, dy)` is `(-dy, dx)`. Each inner point moves along the bisector of its two legs (a miter join).
 */
export function offsetLine(line: readonly Point[], offset: number): Point[] {
  const n = line.length;
  const normals: Point[] = [];
  for (let i = 1; i < n; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    normals.push(l > 1e-12 ? { x: -(b.y - a.y) / l, y: (b.x - a.x) / l } : { x: 0, y: 0 });
  }
  return line.map((p, i) => {
    const before = normals[i - 1] ?? normals[i]!;
    const after = normals[i] ?? normals[i - 1]!;
    let mx = before.x + after.x;
    let my = before.y + after.y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-12) {
      mx = after.x;
      my = after.y;
    } else {
      mx /= ml;
      my /= ml;
    }
    const cos = mx * after.x + my * after.y;
    const scale = Math.min(MITER, 1 / Math.max(1e-6, cos));
    return { x: p.x + mx * offset * scale, y: p.y + my * offset * scale };
  });
}

/** This function gives a highway with a new spine and the members in `members`. The merge points and split points move to the new spine. */
function carriageway(h: Highway, spine: readonly Point[], members: readonly HighwayMember[], suffix: string): Highway {
  const moved = members.map((m) => ({ ...m, merge: pointAt(spine, m.on), split: pointAt(spine, m.off) }));
  return { id: `${h.id}${suffix}`, key: h.key, spine, lanes: moved.map((m) => m.edge), members: moved };
}

/**
 * This function divides one highway into two carriageways, one for each direction (HWY-011, divided edge bundling of Selassie, Heller and Heer 2011).
 * Each carriageway is a copy of the spine at an offset to the side of its traffic. The offset is half the lanes of that side plus half the gap.
 * When an offset spine is not clear of the boxes, the function tries one half and one quarter of the offset. It gives `undefined` when none fits.
 */
export function divideHighway(h: Highway, finder: WayFinder, o: Readonly<Omit<DividedOptions, "from" | "margin" | "k">>): Highway[] | undefined {
  const forward = h.members.filter((m) => m.on < m.off);
  const backward = h.members.filter((m) => m.on > m.off);
  const size = Math.max(1, o.minSize);
  if (forward.length < size || backward.length < size) return undefined;
  const sign = o.rule === "left" ? -1 : 1;
  const lane = Math.max(0, o.laneWidth);
  const gap = Math.max(0, o.gap);
  const pad = finder.margin / 4;
  const wanted = (count: number): number => lane * (count / 2 + gap / 2);
  for (const share of [1, 0.5, 0.25]) {
    const right = offsetLine(h.spine, sign * share * wanted(forward.length));
    const left = offsetLine(h.spine, -sign * share * wanted(backward.length));
    if (!finder.obstacles.clearPath(right, pad) || !finder.obstacles.clearPath(left, pad)) continue;
    return [carriageway(h, right, forward, "a"), carriageway(h, left, backward, "b")];
  }
  return undefined;
}

/**
 * This function gives the highways of the plan `from`, with each highway of two-way traffic divided into two carriageways (HWY-011).
 * The edges of each direction get their own spine on the side of the rule `rule`. Thus the two directions do not cross in the lanes.
 * A highway with fewer than `minSize` edges in one direction, or without the room for the offsets, stays as it is.
 */
export function dividedPlan(input: HighwayInput, o: Readonly<DividedOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const base = basePlan(input, o.from);
  const highways: Highway[] = [];
  for (const h of base.highways) highways.push(...(divideHighway(h, finder, o) ?? [h]));
  return tidyPlan({ highways });
}
