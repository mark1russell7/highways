import { dist, type Point } from "../geom.ts";
import type { Graph, Result } from "../model.ts";

/** The input of a highway strategy: the boxes and the edges, and optionally the first routes of a router. */
export interface HighwayInput {
  readonly graph: Graph;
  /**
   * These routes are the first routes, from a router. A strategy that reads first routes makes them itself when this value is absent.
   * The strategy `corridors` makes the ways of the corner graph, as the router `corners` finds them.
   */
  readonly routes?: Result;
  /**
   * This value is the graph before an edit and the plan of the same strategy on it. A strategy that keeps its highways stable over edits reads it.
   * The gates `hysteresis` (HWY-046) and `ids` (HWY-054) read it. The other strategies ignore it.
   */
  readonly previous?: { readonly graph: Graph; readonly plan: HighwayPlan };
}

/**
 * One edge of a highway. The edge joins the spine at the merge point and leaves it at the split point.
 * A place on the spine is the index of a point of the spine plus the share of the next leg. Point `i` of the spine is at `i`.
 * When `on` is larger than `off`, the edge goes along the spine from its last point to its first point.
 */
export interface HighwayMember {
  readonly edge: string;
  /** The place of the merge point on the spine. */
  readonly on: number;
  /** The place of the split point on the spine. */
  readonly off: number;
  /** The point where the edge joins the spine. */
  readonly merge: Point;
  /** The point where the edge leaves the spine. */
  readonly split: Point;
  /**
   * The place of this highway in the trip of the edge, from 0. An edge can go along several highways, one after the other.
   * `follow` takes the highways of an edge in the order of this value.
   */
  readonly seq: number;
}

/** A highway: a shared way that a bundle of edges follows, from their merge points to their split points. */
export interface Highway {
  readonly id: string;
  /** The key of the highway, for example the key of the grouping rule or the index of a cluster. */
  readonly key: string;
  /** The spine: the polyline that the edges follow, in free space. */
  readonly spine: readonly Point[];
  /** The edges in lane order. Lane 0 is on the left of the spine, from its first point to its last point. The y axis points down. */
  readonly lanes: readonly string[];
  /** The edges with their merge points and their split points, in the order of `lanes`. */
  readonly members: readonly HighwayMember[];
}

/** The output of a highway strategy: the highways, as data. `follow` routes the edges along them. */
export interface HighwayPlan {
  readonly highways: readonly Highway[];
}

/** This function gives the point at a place on a polyline. A place outside the polyline gives its nearest end. */
export function pointAt(line: readonly Point[], at: number): Point {
  if (line.length === 0) throw new Error("The polyline has no point.");
  if (at <= 0) return line[0]!;
  if (at >= line.length - 1) return line[line.length - 1]!;
  const i = Math.floor(at);
  const u = at - i;
  const a = line[i]!;
  if (u === 0) return a;
  const b = line[i + 1]!;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** This function gives the length of a polyline from the place `from` to the place `to`, with `from` not larger than `to`. */
export function lengthBetween(line: readonly Point[], from: number, to: number): number {
  if (to <= from) return 0;
  let sum = 0;
  let prev = pointAt(line, from);
  for (let i = Math.floor(from) + 1; i < to; i++) {
    const p = line[i]!;
    sum += dist(prev, p);
    prev = p;
  }
  return sum + dist(prev, pointAt(line, to));
}

/** This function gives a member of a highway with its merge point and its split point at the places `on` and `off` of the spine. */
export function memberAt(spine: readonly Point[], edge: string, on: number, off: number, seq = 0): HighwayMember {
  return { edge, on, off, merge: pointAt(spine, on), split: pointAt(spine, off), seq };
}

/**
 * This function lists the problems of a plan against its graph. A good plan gives an empty list.
 * Each highway has a spine of two points or more, and two members or more. Each member is an edge of the graph, with `on` and `off` on the spine and apart.
 * An edge is a member of a highway one time at most.
 */
export function checkPlan(graph: Graph, plan: HighwayPlan): string[] {
  const edges = new Set(graph.edges.map((e) => e.id));
  const out: string[] = [];
  const ids = new Set<string>();
  for (const h of plan.highways) {
    if (ids.has(h.id)) out.push(`Two highways have the id "${h.id}".`);
    ids.add(h.id);
    const last = h.spine.length - 1;
    if (h.spine.length < 2) out.push(`The highway "${h.id}" has a spine with fewer than two points.`);
    if (h.members.length < 2) out.push(`The highway "${h.id}" has fewer than two members.`);
    const seen = new Set<string>();
    for (const m of h.members) {
      if (!edges.has(m.edge)) out.push(`The highway "${h.id}" has the member "${m.edge}", which is not an edge of the graph.`);
      if (seen.has(m.edge)) out.push(`The highway "${h.id}" has the member "${m.edge}" two times.`);
      seen.add(m.edge);
      if (!(m.on >= 0 && m.on <= last && m.off >= 0 && m.off <= last)) out.push(`The member "${m.edge}" of the highway "${h.id}" has a place off the spine.`);
      if (m.on === m.off) out.push(`The member "${m.edge}" of the highway "${h.id}" joins and leaves the spine at one place.`);
    }
    if (h.lanes.length !== h.members.length || h.lanes.some((e) => !seen.has(e))) out.push(`The lanes of the highway "${h.id}" are not its members.`);
  }
  return out;
}
