import { dist, polylineLength, type Point } from "../geom.ts";
import { orderLanes } from "../segments.ts";
import { WayFinder, type WayOptions } from "../ways.ts";
import { nearestPlace, tidyPlan } from "./base.ts";
import { lengthBetween, memberAt, pointAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "./model.ts";
import { edgePlugs } from "./stretches.ts";

/** One edge that snaps to a line: the points where it joins and leaves the line, and its place along its own way. */
export interface SnapMember {
  readonly edge: string;
  /** The point on the line where the edge joins it. */
  readonly from: Point;
  /** The point on the line where the edge leaves it. */
  readonly to: Point;
  /** The place of the join along the edge, from 0 at the source to 1 at the target. It orders the highways of one edge. */
  readonly at: number;
}

/** A straight line that a finder gives as the place of a highway, with the edges that snap to it. */
export interface SnapLine {
  readonly key: string;
  readonly a: Point;
  readonly b: Point;
  readonly members: readonly SnapMember[];
}

/** The options of `snapPlan`. */
export interface SnapOptions extends Pick<WayOptions, "margin" | "k"> {
  /** A highway has this number of edges or more. The value is 2 or more. */
  readonly minSize: number;
}

/** This function gives the line `u d + rho n` of the direction angle `theta`, with `d = (cos, sin)` and the normal `n = (-sin, cos)`. */
export function linePoint(theta: number, rho: number, u: number): Point {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: u * c - rho * s, y: u * s + rho * c };
}

/**
 * This function gives the highways of straight lines in the free space. Each line becomes a spine through the corner graph between its two ends.
 * An end inside a box moves to the nearest corner of the graph.
 * Each member joins the spine at the place nearest to its point `from`, and leaves it at the place nearest to its point `to`.
 * A member whose part of the spine is shorter than the margin does not ride. A spine with fewer than `minSize` members is not a highway.
 * An edge on several highways takes them in the order of `at`.
 */
export function snapPlan(input: HighwayInput, lines: readonly SnapLine[], o: Readonly<SnapOptions>): HighwayPlan {
  const min = Math.max(2, o.minSize);
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const plugs = new Map(edgePlugs(input.graph).map((p) => [p.edge.id, p] as const));
  const pad = finder.margin / 2;
  const free = (p: Point): Point => {
    if (!finder.obstacles.inside(p, pad)) return p;
    const i = corners.nearest(p);
    return i >= 0 ? corners.points[i]! : p;
  };
  const highways: Highway[] = [];
  const at = new Map<string, number>();
  for (const line of lines) {
    const a = free(line.a);
    const b = free(line.b);
    if (dist(a, b) <= finder.margin) continue;
    const raw = corners.path(a, b);
    if (!raw) continue;
    const spine = corners.pull(raw);
    if (spine.length < 2 || polylineLength(spine) <= 1e-6) continue;
    const riders: { edge: string; on: number; off: number; points: Point[] }[] = [];
    for (const m of line.members) {
      const plug = plugs.get(m.edge);
      if (!plug) continue;
      const on = nearestPlace(spine, m.from);
      const off = nearestPlace(spine, m.to);
      if (lengthBetween(spine, Math.min(on, off), Math.max(on, off)) < finder.margin) continue;
      riders.push({ edge: m.edge, on, off, points: [plug.ps.point, ...spinePart(spine, on, off), plug.pt.point] });
    }
    if (riders.length < min) continue;
    const hi = highways.length;
    for (const m of line.members) at.set(`${hi}\u0000${m.edge}`, m.at);
    const lanes = orderLanes(spine, riders.map((r) => ({ edge: r.edge, points: r.points })), "bundle");
    const byEdge = new Map(riders.map((r) => [r.edge, r]));
    const members: HighwayMember[] = lanes.map((edge) => memberAt(spine, edge, byEdge.get(edge)!.on, byEdge.get(edge)!.off));
    highways.push({ id: `h${hi}`, key: line.key, spine, lanes, members });
  }
  // The `seq` of each member follows `at` along its edge.
  const trips = new Map<string, { h: number; at: number }[]>();
  highways.forEach((h, hi) => {
    for (const m of h.members) {
      const list = trips.get(m.edge) ?? [];
      list.push({ h: hi, at: at.get(`${hi}\u0000${m.edge}`) ?? 0 });
      trips.set(m.edge, list);
    }
  });
  const seq = new Map<string, number>();
  for (const [edge, list] of trips) {
    list.sort((p, q) => p.at - q.at || p.h - q.h);
    list.forEach((x, k) => seq.set(`${x.h}\u0000${edge}`, k));
  }
  return tidyPlan({ highways: highways.map((h, hi) => ({ ...h, members: h.members.map((m) => ({ ...m, seq: seq.get(`${hi}\u0000${m.edge}`) ?? 0 })) })) });
}

/** This function gives the points of a spine from the place `on` to the place `off`, backward when `on` is larger. */
export function spinePart(spine: readonly Point[], on: number, off: number): Point[] {
  const lo = Math.min(on, off);
  const hi = Math.max(on, off);
  const out = [pointAt(spine, lo)];
  for (let i = Math.floor(lo) + 1; i < hi; i++) out.push(spine[i]!);
  out.push(pointAt(spine, hi));
  return on <= off ? out : out.reverse();
}
