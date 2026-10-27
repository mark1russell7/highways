import { channelWidth } from "../../channels.ts";
import { dist, polylineLength, type Point } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { WayFinder } from "../../ways.ts";
import { basePlan, nearestPlace, tidyPlan, type HighwayBase } from "../base.ts";
import { memberAt, pointAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/** The options of the highway strategy `lanes` (HWY-051 of the note on highways). */
export interface LanesOptions {
  /** The distance from a box to the corners of the graph. The default is 5. */
  readonly margin?: number;
  /** The number of visible neighbours of each corner. The default is 8. */
  readonly k?: number;
  /** The plan that the strategy changes. The default is `shared-ways`. */
  readonly from: HighwayBase;
  /** The gap between two lanes. The default is 4. */
  readonly laneGap: number;
  /** The largest width of a highway. The default is 32. */
  readonly maxWidth: number;
  /** The number of times that a highway can split, one half after the other. The default is 3. */
  readonly depth: number;
}

/** The default options of the strategy `lanes`. */
export const LANES_DEFAULTS: Readonly<LanesOptions> = Object.freeze({ from: "shared-ways", laneGap: 4, maxWidth: 32, depth: 3 });

/** The cost factor of a link that is too narrow for the lanes, for the way of the second half. */
const NARROW_COST = 8;

/** This function gives the number of lanes of a highway on each leg of its spine. A lane is a member whose part on the spine holds the leg. */
function lanesOnLegs(h: Highway): number[] {
  const legs = new Array<number>(Math.max(0, h.spine.length - 1)).fill(0);
  for (const m of h.members) {
    const lo = Math.min(m.on, m.off);
    const hi = Math.max(m.on, m.off);
    for (let i = 0; i < legs.length; i++) if (lo < i + 1 && hi > i) legs[i]!++;
  }
  return legs;
}

/** This function gives the width of `n` lanes. */
const widthOf = (n: number, o: Readonly<LanesOptions>): number => Math.min(o.maxWidth, n * o.laneGap);

/**
 * This function gives the number of legs of the spines of a plan where the lanes do not fit in the channel.
 * A leg with two lanes or more needs `min(maxWidth, lanes × laneGap)`. The channel is the free space across the leg (`channelWidth`).
 */
export function channelOverflows(graph: Graph, plan: HighwayPlan, o: Readonly<Pick<LanesOptions, "laneGap" | "maxWidth" | "margin" | "k">>): number {
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const full = { from: "none" as const, depth: 0, ...o };
  let n = 0;
  for (const h of plan.highways) {
    const legs = lanesOnLegs(h);
    legs.forEach((count, i) => {
      if (count > 1 && channelWidth(finder.obstacles, h.spine[i]!, h.spine[i + 1]!) < widthOf(count, full)) n++;
    });
  }
  return n;
}

/**
 * This function gives the plan of `from`, with each highway that does not fit in its channels split in two (HWY-051).
 * The lanes split into two halves by lane order. The first half keeps the spine. The second half gets a new spine through the corners, where the narrow links cost more.
 * A highway with fewer than four lanes moves as one to the new spine.
 * A half that still does not fit splits again, up to `depth` times. A new spine needs a shorter length of narrow legs than the old spine.
 */
export function lanesPlan(input: HighwayInput, o: Readonly<LanesOptions>): HighwayPlan {
  const plan = basePlan(input, o.from);
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const widths = new Map<string, number>();
  const channel = (a: Point, b: Point): number => {
    const key = a.x < b.x || (a.x === b.x && a.y <= b.y) ? `${a.x},${a.y},${b.x},${b.y}` : `${b.x},${b.y},${a.x},${a.y}`;
    let w = widths.get(key);
    if (w === undefined) widths.set(key, (w = channelWidth(finder.obstacles, a, b)));
    return w;
  };
  const narrowLegs = (h: Highway): number[] => {
    const out: number[] = [];
    lanesOnLegs(h).forEach((count, i) => {
      if (count > 1 && channel(h.spine[i]!, h.spine[i + 1]!) < widthOf(count, o)) out.push(i);
    });
    return out;
  };
  // The length of the legs of a spine that are too narrow for `need`.
  const tight = (spine: readonly Point[], need: number): number => spine.reduce((n, p, i) => (i > 0 && channel(spine[i - 1]!, p) < need ? n + dist(spine[i - 1]!, p) : n), 0);

  const pad = finder.margin / 2;
  const reach = 2 * (o.k ?? 8);
  /**
   * This function gives the cheapest way from `from` to `to` through the corners (Dijkstra). A link narrower than `need` costs `NARROW_COST` times its length.
   * Unlike `corners.path`, it also prices the first link and the last link, and it does not take the straight line without a price.
   */
  const detour = (from: Point, to: Point, need: number): Point[] | undefined => {
    const pts: Point[] = [from, to];
    const id = (j: number): number => j + 2;
    const pointOf = (n: number): Point => (n < 2 ? pts[n]! : corners.points[n - 2]!);
    const best = new Map<number, number>([[0, 0]]);
    const parent = new Map<number, number>();
    const done = new Set<number>();
    const heap: [number, number][] = [[0, 0]];
    const push = (c: number, n: number): void => {
      heap.push([c, n]);
      for (let i = heap.length - 1; i > 0; ) {
        const up = (i - 1) >> 1;
        if (heap[up]![0] <= heap[i]![0]) break;
        [heap[up], heap[i]] = [heap[i]!, heap[up]!];
        i = up;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top;
    };
    while (heap.length > 0 && done.size < 20_000) {
      const [c, n] = pop();
      if (done.has(n)) continue;
      done.add(n);
      if (n === 1) break;
      const p = pointOf(n);
      const next = corners.nearestVisible(p, reach, n >= 2 ? n - 2 : -1).map(id);
      if (finder.obstacles.clear(p, to, pad)) next.push(1);
      for (const m of next) {
        if (done.has(m)) continue;
        const q = pointOf(m);
        const d = dist(p, q);
        const g = c + (channel(p, q) < need ? d * NARROW_COST : d);
        if (g < (best.get(m) ?? Infinity)) {
          best.set(m, g);
          parent.set(m, n);
          push(g, m);
        }
      }
    }
    if (!done.has(1)) return undefined;
    const out: Point[] = [];
    for (let n: number | undefined = 1; n !== undefined; n = parent.get(n)) out.push(pointOf(n));
    return out.reverse();
  };

  // This function moves the members to a new spine. A member whose two places meet on the new spine leaves the highway.
  const move = (h: Highway, spine: readonly Point[], edges: readonly string[]): Highway => {
    const byEdge = new Map(h.members.map((m) => [m.edge, m]));
    const members: HighwayMember[] = [];
    for (const edge of edges) {
      const m = byEdge.get(edge)!;
      const on = nearestPlace(spine, pointAt(h.spine, m.on));
      const off = nearestPlace(spine, pointAt(h.spine, m.off));
      if (Math.abs(on - off) < 1e-6) continue;
      members.push({ ...memberAt(spine, edge, on, off), seq: m.seq });
    }
    return { ...h, spine, lanes: members.map((m) => m.edge), members };
  };

  const split = (h: Highway, depth: number): Highway[] => {
    if (depth <= 0 || narrowLegs(h).length === 0) return [h];
    // A highway with fewer than four lanes cannot give two halves of two lanes. All its lanes move to the new spine.
    const half = h.lanes.length < 4 ? 0 : Math.ceil(h.lanes.length / 2);
    const first = h.lanes.slice(0, half);
    const second = h.lanes.slice(half);
    const need = widthOf(second.length, o);
    const from = h.spine[0]!;
    const to = h.spine[h.spine.length - 1]!;
    const raw = detour(from, to, need);
    if (!raw) return [h];
    const pulled = corners.pull(raw);
    const spine = tight(pulled, need) <= tight(raw, need) ? pulled : raw;
    if (spine.length < 2 || polylineLength(spine) <= finder.margin || tight(spine, need) >= tight(h.spine, need)) return [h];
    const moved = move(h, spine, second);
    if (first.length === 0) return split(moved, depth - 1);
    return [...split(move(h, h.spine, first), depth - 1), ...split(moved, depth - 1)];
  };

  return tidyPlan({ highways: plan.highways.flatMap((h) => split(h, Math.max(0, Math.round(o.depth)))) });
}
