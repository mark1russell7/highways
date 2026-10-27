/**
 * Free plugs on a side (WILD-001): the search of a route starts from the whole free side, not from one point of it.
 * Thus the first leg goes straight out to the first corner of the way, and the plug is the foot of that leg.
 */
import { center, dist, type Box, type Point } from "../geom.ts";
import { fixedPortPoint, type End, type Node, type Side } from "../model.ts";
import { placePlug, pointOnSide, SIDE_NORMAL, sideToward, type Plug } from "../plugs.ts";
import type { Terminal } from "../visibility.ts";
import type { WayFinder } from "../ways.ts";

/** The options of `sidePlugs`. */
export interface SidePlugOptions {
  /** The cost of a slant first leg: the length of the leg grows by `bend` × its angle to the normal, in radians. The default is 1. */
  readonly bend?: number;
  /** The distance from a plug to a corner of its box. The default is 6, as in `pointOnSide`. */
  readonly inset?: number;
  /** The largest number of places that the search tries on each side. The default is 16. */
  readonly most?: number;
}

/** A free side of one end: its node, its side and its range on the axis along the side. It also has the plug that faces the other end. */
interface FreeSide {
  readonly node: Node;
  readonly side: Side;
  readonly normal: Point;
  /** The axis along the side. */
  readonly along: "x" | "y";
  /** The place of the side on the other axis. */
  readonly at: number;
  readonly lo: number;
  readonly hi: number;
  readonly facing: Plug;
}

/** A place that the search tries: the plug, and the free point where the search starts from it, with its cost. */
interface Start extends Terminal {
  readonly plug: Plug;
}

/** This function gives the free side of an end, or `undefined` when the plug of the end is fixed. */
function freeSide(node: Node, end: End, toward: Point, inset: number): FreeSide | undefined {
  if (fixedPortPoint(node, end)) return undefined;
  const port = end.port === undefined ? undefined : node.ports?.find((p) => p.id === end.port);
  const side = port?.side ?? sideToward(node.box, toward);
  const b: Box = node.box;
  const along = side === "east" || side === "west" ? "y" : "x";
  const start = along === "y" ? b.y : b.x;
  const len = along === "y" ? b.h : b.w;
  const m = Math.min(inset, len / 4);
  const at = side === "east" ? b.x + b.w : side === "west" ? b.x : side === "south" ? b.y + b.h : b.y;
  const point = pointOnSide(b, side, toward, inset);
  return { node, side, normal: SIDE_NORMAL[side], along, at, lo: start + m, hi: start + len - m, facing: { point, normal: SIDE_NORMAL[side] } };
}

/** This function gives the point of the side at `v` on the axis along the side. */
function footAt(f: FreeSide, v: number): Point {
  return f.along === "y" ? { x: f.at, y: v } : { x: v, y: f.at };
}

/**
 * This function gives the places that the search tries on one free side. A place is the out point of a plug on the side.
 * A place is also a corner in front of the side. The plug of a corner is the foot of the leg to it.
 */
function startsOf(ways: WayFinder, f: FreeSide, others: readonly number[], bend: number, most: number): Start[] {
  const margin = ways.margin;
  const pad = margin / 2;
  const own = new Set<Node>([f.node]);
  const starts: Start[] = [];
  const out = (p: Point): Point => ({ x: p.x + f.normal.x * margin, y: p.y + f.normal.y * margin });
  const plugAt = (v: number): Plug => ({ point: footAt(f, v), normal: f.normal });
  // The plug that faces the other end is always a place of the search, so the search is never worse than the default.
  starts.push({ plug: f.facing, point: out(f.facing.point), cost: margin });
  const mid = (f.lo + f.hi) / 2;
  for (const v of [f.lo, mid, f.hi, ...others]) {
    if (v < f.lo - 1e-9 || v > f.hi + 1e-9) continue;
    const p = out(footAt(f, v));
    if (!ways.obstacles.inside(p, 0, f.node)) starts.push({ plug: plugAt(v), point: p, cost: margin });
  }
  // The corners in front of the side that its out points see.
  const seen = new Set<number>();
  for (const v of [f.lo, mid, f.hi, f.facing.point[f.along]]) for (const c of ways.corners.nearestVisible(out(footAt(f, v)), 16)) seen.add(c);
  for (const c of seen) {
    const q = ways.corners.points[c]!;
    const across = f.along === "y" ? "x" : "y";
    const depth = (q[across] - f.at) * f.normal[across];
    if (depth < margin - 1e-9) continue;
    const v = Math.max(f.lo, Math.min(f.hi, q[f.along]));
    const foot = footAt(f, v);
    const angle = Math.atan2(Math.abs(q[f.along] - v), depth);
    if (angle > Math.PI / 4 + 1e-9) continue;
    if (!ways.obstacles.clear(foot, q, pad, own)) continue;
    starts.push({ plug: plugAt(v), point: q, cost: dist(foot, q) * (1 + bend * angle) });
  }
  // One place for each foot: the cheapest. The places nearest to the facing plug come first.
  const best = new Map<number, Start>();
  for (const s of starts) {
    const key = Math.round(s.plug.point[f.along] * 2);
    const old = best.get(key);
    if (!old || s.cost < old.cost) best.set(key, s);
  }
  const facing = f.facing.point[f.along];
  const list = [...best.values()].sort((a, b) => Math.abs(a.plug.point[f.along] - facing) - Math.abs(b.plug.point[f.along] - facing));
  return list.slice(0, Math.max(1, most));
}

/**
 * This function places the two plugs of an edge with a free side. A fixed plug stays at its point.
 * The search (A*) starts from each place of the free side of the source. It ends at each place of the free side of the target.
 * The plugs are the places of the shortest way. Without a way, the plugs face the other end, as `placePlug` places them.
 */
export function sidePlugs(ways: WayFinder, s: Node, es: End, t: Node, et: End, options: SidePlugOptions = {}): [Plug, Plug] {
  const inset = options.inset ?? 6;
  const ps = placePlug(s, es, center(t.box));
  const pt = placePlug(t, et, center(s.box));
  if (s === t) return [ps, pt];
  const fs = freeSide(s, es, center(t.box), inset);
  const ft = freeSide(t, et, center(s.box), inset);
  if (!fs && !ft) return [ps, pt];
  const bend = options.bend ?? 1;
  const most = options.most ?? 16;
  const fixed = (p: Plug): Start[] => [{ plug: p, point: ways.out(p), cost: ways.margin }];
  // Two sides that face each other on one axis share the places of a straight line.
  const facingPair = fs && ft && fs.along === ft.along && fs.normal.x === -ft.normal.x && fs.normal.y === -ft.normal.y;
  const shared = (a: FreeSide | undefined, b: FreeSide | undefined, p: Plug): number[] => {
    if (!a) return [];
    if (facingPair && b) {
      const lo = Math.max(a.lo, b.lo);
      const hi = Math.min(a.hi, b.hi);
      return lo <= hi ? [lo, (lo + hi) / 2, hi] : [];
    }
    return [p.point[a.along]];
  };
  const from = fs ? startsOf(ways, fs, shared(fs, ft, pt), bend, most) : fixed(ps);
  const to = ft ? startsOf(ways, ft, shared(ft, fs, ps), bend, most) : fixed(pt);
  const way = ways.corners.pathAmong(from, to);
  if (!way) return [ps, pt];
  return [from[way.from]!.plug, to[way.to]!.plug];
}
