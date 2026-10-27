import { boxesOverlap, goesOutAndBack } from "./bench/links.ts";
import { center, dist, polylineLength, type Box, type Point } from "./geom.ts";
import type { LevelItem, LevelLink, Node, Side } from "./model.ts";
import { pointOnSide, SIDE_NORMAL, sideToward, type Plug } from "./plugs.ts";
import { CornerGraph, Obstacles, SoftGraph } from "./visibility.ts";
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
  /** This function gives the graph of `SoftGraph`. The first link that needs it makes it. */
  readonly soft: () => SoftGraph;
  /** The mean size of the boxes: the mean of the larger side of each box. */
  readonly size: number;
}

/** The options of the links of a level: the options of the ways, and two limits of the level links. */
export interface LevelLinkOptions extends WayOptions {
  /**
   * The margin of the second corner graph. A gap between two boxes wider than approximately 1.5 times this margin lets a link through.
   * The second graph uses the smaller of this value and `margin`. The default is 1.
   */
  readonly tightMargin?: number;
  /** A plug stays at least this far from the corners of its side. The level links use the smaller of this value and `margin`. The default is 6. */
  readonly plugInset?: number;
  /**
   * The cost of a level link through a far box, in units of the mean box size. A far box overlaps neither end of the link.
   * A link through a far box gets a second way that can go through boxes (`SoftGraph`). The link keeps the way with fewer far boxes.
   * The value 0 turns the second way off and gives the links of version 0.1.5. The default is 8.
   */
  readonly throughCost?: number;
}

/** The default values of the three limits of `LevelLinkOptions`. */
export const LEVEL_LINK_DEFAULTS: Readonly<Required<Pick<LevelLinkOptions, "tightMargin" | "plugInset" | "throughCost">>> = Object.freeze({
  tightMargin: 1,
  plugInset: 6,
  throughCost: 8,
});

/** The values of `throughCost` of the sweep of ER3d in the benchmark. The value 0 gives the links of version 0.1.5. */
export const THROUGH_COST_SWEEP: readonly number[] = [0, 2, 4, 8, 16];

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
export function levelLinks(items: readonly LevelItem[], pairs: readonly ItemPair[], options: LevelLinkOptions = {}): LevelLink[] {
  if (pairs.length === 0) return [];
  const nodes: Node[] = items.map((i) => ({ id: i.id, box: i.box }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ways = levelWays(nodes, options);
  const inset = Math.min(options.plugInset ?? LEVEL_LINK_DEFAULTS.plugInset, ways.margin);
  const throughCost = options.throughCost ?? LEVEL_LINK_DEFAULTS.throughCost;
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
  if (throughCost <= 0) return out;
  // The second way never makes the worst detour of the level longer.
  const limit = out.reduce((m, l) => Math.max(m, detour(l.points)), 1);
  return out.map((l) => ({ ...l, points: fewerFar(ways, byId.get(l.source)!, byId.get(l.target)!, l.points, throughCost, limit) }));
}

/** This function gives the length of the polyline divided by the distance between its ends, as the measure `worstDetour` gives it. */
function detour(p: readonly Point[]): number {
  const span = p.length > 1 ? dist(p[0]!, p[p.length - 1]!) : 0;
  return span > 1 ? polylineLength(p) / span : 1;
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
 * The corner graphs use `cones`, so a link goes along the corridors between the groups, not around the outer edge of the board.
 */
function levelWays(nodes: readonly Node[], options: LevelLinkOptions): LevelWays {
  const margin = options.margin ?? 5;
  const k = options.k ?? 8;
  let size = 0;
  for (const n of nodes) size += Math.max(n.box.w, n.box.h);
  const obstacles = new Obstacles(nodes, Math.max(180, (2 * size) / Math.max(1, nodes.length)));
  const corners = new CornerGraph(nodes, obstacles, { margin, k, cones: true });
  const out = (p: Plug): Point => ({ x: p.point.x + p.normal.x * margin, y: p.point.y + p.normal.y * margin });
  let tight: CornerGraph | undefined;
  const tightGraph = (): CornerGraph => (tight ??= new CornerGraph(nodes, obstacles, { margin: Math.min(margin, options.tightMargin ?? LEVEL_LINK_DEFAULTS.tightMargin), k, cones: true }));
  let soft: SoftGraph | undefined;
  const softGraph = (): SoftGraph => (soft ??= new SoftGraph(nodes, obstacles, { margin, k }));
  return { obstacles, corners, margin, out, tight: tightGraph, free: new Map(), soft: softGraph, size: size / Math.max(1, nodes.length) };
}

/** This function gives the boxes that the polyline goes through, without the boxes of `s` and `t`, and the number of far boxes among them. */
function boxesThrough(ways: Ways, p: readonly Point[], s: Node, t: Node, near: ReadonlySet<Node>): { boxes: Set<Node>; far: number } {
  const boxes = new Set<Node>();
  let far = 0;
  for (let i = 1; i < p.length; i++)
    ways.obstacles.through(p[i - 1]!, p[i]!, (n) => {
      if (n === s || n === t || boxes.has(n)) return;
      boxes.add(n);
      if (!near.has(n)) far++;
    });
  return { boxes, far };
}

/** This function gives the nodes whose boxes overlap the box of `s` or the box of `t`, as `boxesOverlap` sees it. */
function nearBoxes(ways: Ways, s: Node, t: Node): Set<Node> {
  const near = new Set<Node>();
  for (const end of [s, t])
    ways.obstacles.query(end.box, (n) => {
      if (n !== s && n !== t && boxesOverlap(n.box, end.box)) near.add(n);
    });
  return near;
}

/**
 * This function gives a way with fewer far boxes than `way`, or `way`. A far box overlaps neither end of the link.
 * On a walled-in level, each box overlaps its neighbours, so a link can find no way around the boxes.
 * Then a search of `SoftGraph` goes from the center of `s` to the center of `t`.
 *
 * In the search, a far box costs `cost` mean box sizes, and a near box costs one mean box size.
 * The way starts where the path leaves the box of `s` for the last time. It ends where the path then first enters the box of `t`.
 * The link keeps `way` when the new way goes out and back and `way` does not.
 * It also keeps `way` when the detour of the new way is longer than `limit`.
 */
function fewerFar(ways: LevelWays, s: Node, t: Node, way: readonly Point[], cost: number, limit: number): readonly Point[] {
  const near = nearBoxes(ways, s, t);
  const before = boxesThrough(ways, way, s, t, near);
  if (before.far === 0) return way;
  const far = cost * ways.size;
  const path = ways.soft().path(center(s.box), center(t.box), (n) => (n === s || n === t ? 0 : near.has(n) ? ways.size : far));
  const clipped = clip(path, s.box, t.box);
  if (!clipped) return way;
  const soft = tidy(pullThrough(ways, clipped, s, t));
  // A way that goes out and back is a new fault, so the link keeps the old way.
  if (goesOutAndBack(soft) && !goesOutAndBack(way)) return way;
  if (detour(soft) > limit) return way;
  return boxesThrough(ways, soft, s, t, near).far < before.far ? soft : way;
}

/** This function tells if the point is inside the box, not on its boundary. */
const within = (p: Point, b: Box): boolean => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

/** This function gives the point where the segment from `a`, inside the box, to `b` leaves the box. */
function exitPoint(a: Point, b: Point, box: Box): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let u = 1;
  if (dx > 0) u = Math.min(u, (box.x + box.w - a.x) / dx);
  if (dx < 0) u = Math.min(u, (box.x - a.x) / dx);
  if (dy > 0) u = Math.min(u, (box.y + box.h - a.y) / dy);
  if (dy < 0) u = Math.min(u, (box.y - a.y) / dy);
  u = Math.max(0, u);
  return { x: a.x + u * dx, y: a.y + u * dy };
}

/**
 * This function cuts a path from the inside of the box `a` to the inside of the box `b`. The cut path starts where the path leaves `a` for the last time.
 * It ends where the path then first enters `b`. It gives `undefined` when no such part is left.
 */
function clip(p: readonly Point[], a: Box, b: Box): Point[] | undefined {
  let i = -1;
  for (let k = 0; k < p.length; k++) if (within(p[k]!, a)) i = k;
  if (i < 0 || i === p.length - 1) return undefined;
  let j = -1;
  for (let k = i + 1; k < p.length && j < 0; k++) if (within(p[k]!, b)) j = k;
  if (j < 0) return undefined;
  const start = exitPoint(p[i]!, p[i + 1]!, a);
  const end = exitPoint(p[j]!, p[j - 1]!, b);
  if (within(start, b) || within(end, a)) return undefined;
  return [start, ...p.slice(i + 1, j), end];
}

/**
 * This function pulls a soft path tight. From each vertex, it goes to the farthest vertex of the next 16 vertices with a straight line.
 * The line can go only through the boxes that the path between the two vertices goes through.
 */
function pullThrough(ways: Ways, p: readonly Point[], s: Node, t: Node, lookahead = 16): Point[] {
  if (p.length < 3) return [...p];
  const boxesOf = (a: Point, b: Point): Node[] => {
    const out: Node[] = [];
    ways.obstacles.through(a, b, (n) => {
      if (n !== s && n !== t) out.push(n);
    });
    return out;
  };
  // The boxes of each leg of the path, found one time.
  const legs = p.map((q, m) => (m === 0 ? [] : boxesOf(p[m - 1]!, q)));
  const out: Point[] = [p[0]!];
  let i = 0;
  while (i < p.length - 1) {
    let next = i + 1;
    const last = Math.min(p.length - 1, i + lookahead);
    // The boxes of the path from vertex i to each vertex j.
    const along: Set<Node>[] = [];
    let seen = new Set<Node>();
    for (let j = i + 1; j <= last; j++) {
      seen = new Set([...seen, ...legs[j]!]);
      along[j] = seen;
    }
    for (let j = last; j > i + 1; j--) {
      if (boxesOf(p[i]!, p[j]!).every((n) => along[j]!.has(n))) {
        next = j;
        break;
      }
    }
    out.push(p[next]!);
    i = next;
  }
  return out;
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
