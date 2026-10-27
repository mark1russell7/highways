import { center, dist, polylineLength, type Box, type Point } from "./geom.ts";
import type { LevelItem, LevelLink, Node, Side } from "./model.ts";
import { pointOnSide, SIDE_NORMAL, sideToward, type Plug } from "./plugs.ts";
import { CornerGraph, Obstacles } from "./visibility.ts";
import type { WayFinder, WayOptions } from "./ways.ts";

/** Two items of a level that a link joins, and the count of the edges between them. */
export interface ItemPair {
  readonly source: string;
  readonly target: string;
  readonly count: number;
}

/** The parts of a way finder that a link uses. */
type Ways = Pick<WayFinder, "obstacles" | "corners" | "margin" | "out">;

/** The free plugs of a node, and the reach of each plug. */
interface FreePlugs {
  readonly plugs: readonly Plug[];
  readonly reach: readonly number[];
}

/** The ways of a level, with a second corner graph and the free plugs of the nodes. */
interface LevelWays extends Ways {
  /** This function gives a second corner graph with a small margin. The first link that needs it makes it. */
  readonly tight: () => CornerGraph;
  /** The free plugs of each node that a link needed. */
  readonly free: Map<Node, FreePlugs>;
}

/** The margin of the second corner graph. A gap between two boxes wider than approximately 1.5 times this margin lets a link through. */
const TIGHT_MARGIN = 1;

const EPS = 1e-6;

/**
 * This function removes the repeated points, the points in the middle of a straight run,
 * and the points where the way turns back on itself.
 */
function tidy(p: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of p) {
    if (out.length > 0 && dist(q, out[out.length - 1]!) <= EPS) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const cross = (b.x - a.x) * (q.y - b.y) - (b.y - a.y) * (q.x - b.x);
      if (Math.abs(cross) > EPS * (1 + dist(a, b) * dist(b, q))) break;
      // The point b is on the line through a and q: in the middle of a straight run, or at the tip of a turn back.
      out.pop();
    }
    if (out.length > 0 && dist(q, out[out.length - 1]!) <= EPS) continue;
    out.push(q);
  }
  return out;
}

/**
 * This function gives the links of one level. The items of the level are the obstacles.
 * A link starts on the boundary of the box of its source and ends on the boundary of the box of its target.
 * It goes around the boxes of the other items. Where there is space, its legs are parallel to the axes.
 */
export function levelLinks(items: readonly LevelItem[], pairs: readonly ItemPair[], options: WayOptions = {}): LevelLink[] {
  if (pairs.length === 0) return [];
  const nodes: Node[] = items.map((i) => ({ id: i.id, box: i.box }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ways = levelWays(nodes, options);
  const inset = Math.min(6, ways.margin);
  const out: LevelLink[] = [];
  for (const p of pairs) {
    const s = byId.get(p.source);
    const t = byId.get(p.target);
    if (!s || !t) continue;
    // Two items with a clear way between their facing sides get the short way.
    const [fs, ft] = facingPlugs(s.box, t.box, inset);
    let points = isFree(ways, s, fs) && isFree(ways, t, ft) ? quickWay(ways, ends(ways, s, fs, t, ft)) : undefined;
    // Else the link goes from the middle of a side. Each item has at most four such plugs, so the corner graph finds their ends one time.
    points ??= sideWay(ways, s, t, inset);
    out.push({ source: p.source, target: p.target, count: p.count, points });
  }
  return out;
}

/**
 * This function gives a way from plug to plug between the plugs at the middle of a side of the two nodes.
 * Without a way in the corner graph, the link goes straight between the ends, with legs parallel to the axes where they are clear.
 * When that line goes through another box, the link goes between the free plugs of the two nodes (`freeWay`) instead.
 */
function sideWay(ways: LevelWays, s: Node, t: Node, inset: number): Point[] {
  const e = ends(ways, s, sidePlug(ways, s, center(t.box)), t, sidePlug(ways, t, center(s.box)));
  const quick = quickWay(ways, e);
  if (quick) return quick;
  const path = ways.corners.path(e.a, e.b);
  const way = pulled(ways, e.ps, path ?? [e.a, e.b], e.pt);
  if (path || ways.obstacles.clearPath(way, 0, new Set([s, t]))) return way;
  return freeWay(ways, s, t, inset) ?? way;
}

/**
 * This function makes the obstacles and the corner graph of the items of a level.
 * The buckets of the obstacles grow with the items, so a long link visits few buckets.
 */
function levelWays(nodes: readonly Node[], options: WayOptions): LevelWays {
  const margin = options.margin ?? 5;
  const k = options.k ?? 8;
  let size = 0;
  for (const n of nodes) size += Math.max(n.box.w, n.box.h);
  const obstacles = new Obstacles(nodes, Math.max(180, (2 * size) / Math.max(1, nodes.length)));
  const corners = new CornerGraph(nodes, obstacles, { margin, k, cones: true });
  const out = (p: Plug): Point => ({ x: p.point.x + p.normal.x * margin, y: p.point.y + p.normal.y * margin });
  let tight: CornerGraph | undefined;
  const tightGraph = (): CornerGraph => (tight ??= new CornerGraph(nodes, obstacles, { margin: Math.min(margin, TIGHT_MARGIN), k, cones: true }));
  return { obstacles, corners, margin, out, tight: tightGraph, free: new Map() };
}

/**
 * This function gives the plugs of a link between two boxes. Each plug is on the side that faces the other box.
 * When the two sides face each other and their spans overlap, both plugs are at the middle of the overlap, so the link is straight.
 */
export function facingPlugs(a: Box, b: Box, inset: number): [Plug, Plug] {
  const sa = sideToward(a, center(b));
  const sb = sideToward(b, center(a));
  const plug = (box: Box, side: Side, toward: Point): Plug => ({ point: pointOnSide(box, side, toward, inset), normal: SIDE_NORMAL[side] });
  const across = (sa === "east" && sb === "west") || (sa === "west" && sb === "east");
  const down = (sa === "south" && sb === "north") || (sa === "north" && sb === "south");
  if (across || down) {
    const lo = across ? Math.max(a.y, b.y) + inset : Math.max(a.x, b.x) + inset;
    const hi = across ? Math.min(a.y + a.h, b.y + b.h) - inset : Math.min(a.x + a.w, b.x + b.w) - inset;
    if (lo <= hi) {
      const ca = center(a);
      const cb = center(b);
      const m = Math.max(lo, Math.min(hi, across ? (ca.y + cb.y) / 2 : (ca.x + cb.x) / 2));
      const at = (box: Box, side: Side): Point =>
        across
          ? { x: side === "east" ? box.x + box.w : box.x, y: m }
          : { x: m, y: side === "south" ? box.y + box.h : box.y };
      return [
        { point: at(a, sa), normal: SIDE_NORMAL[sa] },
        { point: at(b, sb), normal: SIDE_NORMAL[sb] },
      ];
    }
  }
  return [plug(a, sa, center(b)), plug(b, sb, center(a))];
}

const SIDES: readonly Side[] = ["north", "east", "south", "west"];

/** This function tells if the way out of a plug is free. The plug and the point at `margin` from it are in no other box. */
function isFree(ways: Ways, node: Node, plug: Plug): boolean {
  return !ways.obstacles.inside(ways.out(plug), 0, node) && !ways.obstacles.inside(plug.point, 0, node);
}

/** This function gives the plug at the middle of a side of the node: the side with a free way out that faces `toward` most. */
function sidePlug(ways: Ways, node: Node, toward: Point): Plug {
  const b = node.box;
  const c = center(b);
  const d = { x: toward.x - c.x, y: toward.y - c.y };
  const facing = (s: Side): number => SIDE_NORMAL[s].x * d.x + SIDE_NORMAL[s].y * d.y;
  const order = [...SIDES].sort((u, v) => facing(v) - facing(u));
  const plug = (s: Side): Plug => {
    const n = SIDE_NORMAL[s];
    return { point: { x: c.x + (n.x * b.w) / 2, y: c.y + (n.y * b.h) / 2 }, normal: n };
  };
  for (const s of order) if (isFree(ways, node, plug(s))) return plug(s);
  return plug(order[0]!);
}

/**
 * This function gives the free plugs of a node: on each side, the free point nearest to the middle of the side.
 * A point is free when it and the point at `margin` from it are in no other box. The function keeps the plugs of each node.
 */
function freePlugs(ways: LevelWays, node: Node, inset: number): FreePlugs {
  const known = ways.free.get(node);
  if (known) return known;
  const b = node.box;
  const out: Plug[] = [];
  for (const side of SIDES) {
    const n = SIDE_NORMAL[side];
    const across = n.x === 0;
    // The side goes from `lo` to `hi` along its axis, at the coordinate `at` of the other axis.
    const lo = across ? b.x : b.y;
    const hi = across ? b.x + b.w : b.y + b.h;
    const at = across ? (n.y > 0 ? b.y + b.h : b.y) : n.x > 0 ? b.x + b.w : b.x;
    const far = at + (across ? n.y : n.x) * ways.margin;
    // A box covers a point of the side when the point or its way out is inside the box, as in `isFree`.
    const covered: [number, number][] = [];
    const strip = across
      ? { x: lo, y: Math.min(at, far), w: hi - lo, h: Math.abs(far - at) }
      : { x: Math.min(at, far), y: lo, w: Math.abs(far - at), h: hi - lo };
    ways.obstacles.query(strip, (m) => {
      if (m === node) return;
      const o = m.box;
      const [o0, o1, p0, p1] = across ? [o.x, o.x + o.w, o.y, o.y + o.h] : [o.y, o.y + o.h, o.x, o.x + o.w];
      if ((at > p0 && at < p1) || (far > p0 && far < p1)) covered.push([o0, o1]);
    });
    const mid = (lo + hi) / 2;
    let best: number | undefined;
    for (const [f0, f1] of freeSpans(lo, hi, covered)) {
      const room = Math.min(inset, (f1 - f0) / 2);
      const u = Math.max(f0 + room, Math.min(f1 - room, mid));
      if (best === undefined || Math.abs(u - mid) < Math.abs(best - mid)) best = u;
    }
    if (best !== undefined) out.push({ point: across ? { x: best, y: at } : { x: at, y: best }, normal: n });
  }
  const free = { plugs: out, reach: out.map((p) => reach(ways, node, p)) };
  ways.free.set(node, free);
  return free;
}

/** This function gives the indices of the plugs, and the plugs that face `toward` most come first. */
function facingOrder(plugs: readonly Plug[], from: Point, toward: Point): number[] {
  const facing = (p: Plug): number => p.normal.x * (toward.x - from.x) + p.normal.y * (toward.y - from.y);
  return plugs.map((_, i) => i).sort((u, v) => facing(plugs[v]!) - facing(plugs[u]!) || u - v);
}

/** This function gives the parts of the span from `lo` to `hi` outside each open interval of `covered`. A part of zero length does not count. */
function freeSpans(lo: number, hi: number, covered: [number, number][]): [number, number][] {
  covered.sort((u, v) => u[0] - v[0]);
  const out: [number, number][] = [];
  let x = lo;
  for (const [c0, c1] of covered) {
    if (c0 > x) out.push([x, Math.min(c0, hi)]);
    x = Math.max(x, c1);
    if (x >= hi) break;
  }
  if (x < hi) out.push([x, hi]);
  return out.filter(([a, b]) => b - a > EPS);
}

/**
 * This function gives the shortest way between the free plugs of the two nodes, or `undefined` when the second corner graph has none.
 * A link uses it when its plugs at the middle of a side find no way. Other boxes can cover such a plug, or close the space in front of it.
 */
function freeWay(ways: LevelWays, s: Node, t: Node, inset: number): Point[] | undefined {
  const fs = freePlugs(ways, s, inset);
  const ft = freePlugs(ways, t, inset);
  const cs = center(s.box);
  const ct = center(t.box);
  const is = facingOrder(fs.plugs, cs, ct);
  const it = facingOrder(ft.plugs, ct, cs);
  const from = is.map((i) => fs.plugs[i]!);
  const to = it.map((k) => ft.plugs[k]!);
  const ra = is.map((i) => fs.reach[i]!);
  const rb = it.map((k) => ft.reach[k]!);
  // A pair of plugs with one or two clear legs between them gives the short way.
  let best: Point[] | undefined;
  let bestLength = Infinity;
  from.forEach((ps, i) =>
    to.forEach((pt, k) => {
      const way = quickWay(ways, endsAt(ps, ra[i]!, pt, rb[k]!));
      const length = way ? polylineLength(way) : Infinity;
      if (length < bestLength) {
        best = way;
        bestLength = length;
      }
    }),
  );
  if (best) return best;
  // Else one search of the second corner graph finds the shortest way from a plug of `s` to a plug of `t`.
  // The corners of the second graph are near the boxes, so the way can go through a gap that is narrower than the margin.
  const a = from.map((ps, i) => ({ point: along(ps, ra[i]!), cost: ra[i]! }));
  const b = to.map((pt, k) => ({ point: along(pt, rb[k]!), cost: rb[k]! }));
  const found = ways.tight().pathAmong(a, b);
  return found && pulled(ways, from[found.from]!, found.points, to[found.to]!);
}

/** The two ends of a link: each plug, and the point where the link turns away from the normal of the plug. */
interface Ends {
  readonly ps: Plug;
  readonly pt: Plug;
  readonly a: Point;
  readonly b: Point;
}

/**
 * This function gives the ends of a link. The link leaves each plug along its normal for the margin.
 * A box can be nearer than twice the margin in front of a plug. Then the link turns in the middle of the space before that box.
 * Two plugs that face each other across a narrow space make the link turn in the middle of that space.
 */
function ends(ways: Ways, s: Node, ps: Plug, t: Node, pt: Plug): Ends {
  return endsAt(ps, reach(ways, s, ps), pt, reach(ways, t, pt));
}

/** This function gives the ends of a link from the plug `ps` to the plug `pt`, with the reach of each plug. */
function endsAt(ps: Plug, ra: number, pt: Plug, rb: number): Ends {
  // Two plugs that face each other turn at the same distance, so the link does not go past itself.
  if (ps.normal.x === -pt.normal.x && ps.normal.y === -pt.normal.y) {
    const d = (pt.point.x - ps.point.x) * ps.normal.x + (pt.point.y - ps.point.y) * ps.normal.y;
    if (d > 0 && ra + rb > d) ra = rb = d / 2;
  }
  return { ps, pt, a: along(ps, ra), b: along(pt, rb) };
}

const along = (p: Plug, d: number): Point => ({ x: p.point.x + p.normal.x * d, y: p.point.y + p.normal.y * d });

/** This function gives the distance that a link goes along the normal of a plug before it turns. */
function reach(ways: Ways, node: Node, plug: Plug): number {
  const skip = new Set([node]);
  const far = 2 * ways.margin;
  if (ways.obstacles.clear(plug.point, along(plug, far), 0, skip)) return ways.margin;
  let lo = 0;
  let hi = far;
  for (let i = 0; i < 10; i++) {
    const m = (lo + hi) / 2;
    if (ways.obstacles.clear(plug.point, along(plug, m), 0, skip)) lo = m;
    else hi = m;
  }
  return lo / 2;
}

/**
 * This function gives the way between the ends when one or two legs parallel to the axes are clear, or `undefined`.
 * The legs keep half the margin from the boxes, or less when an end turns nearer to a box.
 */
function quickWay(ways: Ways, e: Ends): Point[] | undefined {
  const near = Math.min(dist(e.ps.point, e.a), dist(e.pt.point, e.b));
  const pad = Math.max(0, Math.min(ways.margin / 2, near - 1));
  const legs = square(e.a, e.b, ways.obstacles, pad, axisOf(e.ps.normal), axisOf(e.pt.normal));
  return legs && tidy([e.ps.point, e.a, ...legs, e.pt.point]);
}

/**
 * This function gives a way from the plug `ps` through the points of `path` to the plug `pt`.
 * The way leaves and enters each plug along its normal. Then it pulls the corners tight with legs that are parallel to the axes, where the obstacles let it.
 */
function pulled(ways: Ways, ps: Plug, path: readonly Point[], pt: Plug): Point[] {
  const legs = squarePull(path, ways.obstacles, ways.margin / 2, axisOf(ps.normal), axisOf(pt.normal));
  return tidy([ps.point, ...legs, pt.point]);
}

type Axis = "x" | "y";

const axisOf = (n: Point): Axis => (Math.abs(n.x) > Math.abs(n.y) ? "x" : "y");

/**
 * This function pulls a path tight. From each vertex, it goes to the farthest vertex that one or two legs can reach.
 * These legs are parallel to the axes and clear of the obstacles by `pad`. It keeps a diagonal leg only where no such legs are clear.
 * `first` is the axis of the way into the first vertex, and `last` is the axis of the way out of the last vertex.
 */
function squarePull(p: readonly Point[], obstacles: Obstacles, pad: number, first: Axis, last: Axis, lookahead = 16): Point[] {
  if (p.length === 0) return [];
  const out: Point[] = [p[0]!];
  let axis: Axis | undefined = first;
  let i = 0;
  while (i < p.length - 1) {
    let step: { j: number; legs: Point[] } | undefined;
    for (let j = Math.min(p.length - 1, i + lookahead); j > i && !step; j--) {
      const legs = square(p[i]!, p[j]!, obstacles, pad, axis, j === p.length - 1 ? last : undefined);
      if (legs) step = { j, legs };
    }
    // With no clear legs to the next vertex, the legs may touch a box, but they do not go through it.
    step ??= {
      j: i + 1,
      legs: square(p[i]!, p[i + 1]!, obstacles, 0, axis, i + 1 === p.length - 1 ? last : undefined) ?? [p[i + 1]!],
    };
    out.push(...step.legs);
    const end = out[out.length - 1]!;
    const before = out[out.length - 2]!;
    axis = Math.abs(end.y - before.y) < EPS ? "x" : Math.abs(end.x - before.x) < EPS ? "y" : undefined;
    i = step.j;
  }
  return out;
}

/**
 * This function gives one or two legs parallel to the axes from `a` to `b`, clear of the obstacles by `pad`, or `undefined`.
 * Of two clear corners, it picks the corner that continues the axis `from` and arrives along the axis `to`.
 */
function square(a: Point, b: Point, obstacles: Obstacles, pad: number, from: Axis | undefined, to: Axis | undefined): Point[] | undefined {
  if (Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS) return obstacles.clear(a, b, pad) ? [b] : undefined;
  // The corner of `x` goes along the x axis first, and the corner of `y` along the y axis first.
  const options: { c: Point; bends: number }[] = [
    { c: { x: b.x, y: a.y }, bends: (from === "y" ? 1 : 0) + (to === "x" ? 1 : 0) },
    { c: { x: a.x, y: b.y }, bends: (from === "x" ? 1 : 0) + (to === "y" ? 1 : 0) },
  ];
  options.sort((u, v) => u.bends - v.bends);
  for (const { c } of options) if (obstacles.clear(a, c, pad) && obstacles.clear(c, b, pad)) return [c, b];
  return undefined;
}
