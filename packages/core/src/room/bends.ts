import type { Box, Point } from "../geom.ts";
import { Grid } from "../grid.ts";
import type { Edge, Router } from "../model.ts";
import { segmentsOf, type SegmentGraph } from "../segments.ts";
import type { Boxed, Gap, RoomLink } from "./index.ts";

/**
 * The options of the room for the bends of the bundles (HWC-D). With them, `roomDemand` also opens the gaps where a bundle bends.
 * The values agree with the options of `highwayCurves` that draw the bundles.
 */
export interface RoomBends {
  /** The router that bundles the edges. Each segment of its routes with two or more edges is a bundle. */
  readonly router: Router;
  /** The edges that the router routes. Without them, each link gives `count` edges, with no data. */
  readonly edges?: readonly Edge[];
  /** The distance between two lanes of a bundle, as `laneWidth` of `highwayCurves`. The default is 4. */
  readonly spacing?: number;
  /** The largest width of a bundle, from its outer lane to its outer lane, as `maxWidth` of `highwayCurves`. The default is `Infinity`. */
  readonly maxWidth?: number;
  /** The smallest radius of each lane, as `minRadius` of `highwayCurves`. The default is 4. */
  readonly minRadius?: number;
  /** The number of passes of the demand of the bends. Each pass routes the board that the passes before it opened. The default is 1. */
  readonly passes?: number;
}

/** One leg of the route of an edge: a straight piece of the center line of one segment. */
interface BendLeg {
  readonly a: Point;
  readonly b: Point;
  readonly u: Point;
  readonly len: number;
  /** The number of lanes of the segment of the leg. A segment of one edge has 1. */
  readonly lanes: number;
  /** The offset of the lane of the edge from the center line, to the left of the leg. */
  readonly off: number;
  /** The key of the leg: its segment and its place in the segment. Two edges of one segment share the key. */
  readonly key: string;
}

/** A turn smaller than this angle, in radians, is no corner. A turn nearer to a half turn than this angle is a spike, and it gets no arc. */
const FLAT = 1e-6;
const SPIKE = 0.01;
const SAME = 1e-6;
/** A leg with a smaller share of its length on an axis does not grow on that axis. */
const SLANT = 0.2;

const turnOf = (u: Point, w: Point): number => Math.atan2(u.x * w.y - u.y * w.x, u.x * w.x + u.y * w.y);

/**
 * This function gives the length along a leg of an S of two arcs with the radius `r` that shifts a lane by `shift`.
 * It is the length of the shift of `highwayCurves` at a merge or a split.
 */
function jogLength(r: number, shift: number): number {
  const d = Math.abs(shift);
  if (d < SAME || r <= 0) return 0;
  if (r < d / 2) return 2 * r;
  return 2 * r * Math.sin(Math.acos(1 - d / (2 * r)));
}

/** This function gives the legs of the route of each edge, with the lanes and the offset of the lane on each leg. */
function legsOf(graph: SegmentGraph, spacing: number, maxWidth: number): BendLeg[][] {
  const byId = new Map(graph.segments.map((s) => [s.id, s]));
  return graph.paths.map((path) => {
    const legs: BendLeg[] = [];
    for (const ref of path.segments) {
      const s = byId.get(ref.segment);
      if (!s) continue;
      const sp = s.count > 1 ? Math.min(spacing, maxWidth / (s.count - 1)) : 0;
      const offset = ((s.count - 1) / 2 - ref.lane) * sp;
      const c: Point[] = [];
      for (const p of s.points) if (c.length === 0 || Math.hypot(p.x - c[c.length - 1]!.x, p.y - c[c.length - 1]!.y) > SAME) c.push(p);
      const n = c.length;
      for (let j = 0; j + 1 < n; j++) {
        const from = ref.reverse ? n - 1 - j : j;
        const to = ref.reverse ? n - 2 - j : j + 1;
        const a = c[from]!;
        const b = c[to]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        legs.push({
          a,
          b,
          u: { x: (b.x - a.x) / len, y: (b.y - a.y) / len },
          len,
          lanes: sp > 0 ? s.count : 1,
          off: ref.reverse ? -offset : offset,
          key: `${s.id}:${Math.min(from, to)}`,
        });
      }
    }
    return legs;
  });
}

/**
 * This function gives the length that the arcs at one end of a leg use on the leg, as the lanes of `highwayCurves` use it.
 * `A` is the leg before the vertex, `B` the leg after it, and `X` the leg of the two that the length is for.
 *
 * - At a bend of two bundles, the center line has the radius `R = W/2 + minRadius`, with `W` the width of the wider bundle. The tangent length is `T = R tan(φ/2)`.
 *   Each lane uses the same part of the leg, because the arcs are concentric.
 * - At another corner, the lane has the radius `minRadius` at its own corner, at the offset `c` of the lane. The tangent length is `(minRadius + |c|) tan(φ/2)`.
 * - A lane that joins or leaves a bundle shifts on the leg with fewer lanes. The S of the shift adds its length on that leg.
 */
function endLength(A: BendLeg, B: BendLeg, X: BendLeg, minRadius: number): number {
  const phi = Math.abs(turnOf(A.u, B.u));
  if (Math.PI - phi < SPIKE) return 0;
  const k = phi < FLAT ? 0 : Math.tan(phi / 2);
  const c = A.lanes < B.lanes ? B.off : A.off;
  if (A.lanes > 1 && B.lanes > 1) return k * (Math.max(Math.abs(A.off), Math.abs(B.off), Math.abs(c)) + minRadius);
  return k * (minRadius + Math.abs(c)) + jogLength(minRadius, c - X.off);
}

/**
 * This function gives, for each leg of the routes, the length that the leg lacks for the arcs at its two ends.
 * `highwayCurves` gives each end of a leg at most the half of the leg. So a leg needs `2 max(T_A, T_B)`, and this length is at least `T_A + T_B`.
 * The first and the last leg of a route end at a plug, and the plug end needs no length.
 */
function shortLegs(legs: readonly (readonly BendLeg[])[], minRadius: number): Map<string, { leg: BendLeg; short: number }> {
  const out = new Map<string, { leg: BendLeg; short: number }>();
  for (const path of legs) {
    if (path.every((l) => l.lanes < 2)) continue;
    for (let j = 0; j < path.length; j++) {
      const X = path[j]!;
      const start = j > 0 ? endLength(path[j - 1]!, X, X, minRadius) : 0;
      const end = j + 1 < path.length ? endLength(X, path[j + 1]!, X, minRadius) : 0;
      const short = 2 * Math.max(start, end) - X.len;
      if (short <= SAME) continue;
      const known = out.get(X.key);
      if (!known || known.short < short) out.set(X.key, { leg: X, short });
    }
  }
  return out;
}

/** This function gives the mean of the longer side of the boxes. */
function meanSide(items: readonly Boxed[]): number {
  let s = 0;
  for (const i of items) s += Math.max(i.box.w, i.box.h);
  return items.length ? s / items.length : 1;
}

/** This function gives the box nearest to a point, among the boxes within `reach` of it. */
function nearestBox(grid: Grid<Box>, p: Point, reach: number): Box | undefined {
  let best: Box | undefined;
  let bestD = Infinity;
  grid.query({ x: p.x - reach, y: p.y - reach, w: 2 * reach, h: 2 * reach }, (b) => {
    const dx = Math.max(b.x - p.x, 0, p.x - b.x - b.w);
    const dy = Math.max(b.y - p.y, 0, p.y - b.y - b.h);
    const d = Math.hypot(dx, dy);
    if (d < bestD || (d === bestD && best && (b.x < best.x || (b.x === best.x && b.y < best.y)))) [best, bestD] = [b, d];
  });
  return bestD <= reach ? best : undefined;
}

/**
 * This function gives the growth that each gap of the board needs for the bends of the bundles, in the order of `gaps`.
 * The router routes the board. Each segment with two or more edges is a bundle, as `highwayCurves` opens it.
 *
 * A leg that is too short for the arcs at its ends grows by the gaps between its two ends.
 * Each end of a leg moves with its nearest box, as `openGaps` moves the boxes. So a gap between the left (or top) edges of the two boxes lengthens the leg.
 * The leg grows on the axis of its longer side. The gap nearest to the middle of the leg takes the growth.
 * A gap that more legs need takes the largest growth, not the sum.
 */
export function bendGrowth(items: readonly Boxed[], links: readonly RoomLink[], gaps: readonly Gap[], bends: RoomBends, snap: number): number[] {
  const spacing = Math.max(0, bends.spacing ?? 4);
  const maxWidth = bends.maxWidth ?? Infinity;
  const minRadius = Math.max(0, bends.minRadius ?? 4);
  const edges: Edge[] = bends.edges
    ? [...bends.edges]
    : links.flatMap((l, i) => Array.from({ length: Math.max(1, l.count ?? 1) }, (_, k) => ({ id: `l${i}-${k}`, source: { node: l.source }, target: { node: l.target } })));
  const graph = segmentsOf(bends.router.route({ nodes: items, edges }));
  const short = shortLegs(legsOf(graph, spacing, maxWidth), minRadius);
  const grow: number[] = gaps.map(() => 0);
  if (short.size === 0) return grow;
  const side = meanSide(items);
  const grid = new Grid<Box>(Math.max(20, side));
  for (const i of items) grid.add(i.box, i.box);
  const anchor = (p: Point): Box | undefined => nearestBox(grid, p, side) ?? nearestBox(grid, p, 4 * side);
  const byAxis = { x: [] as number[], y: [] as number[] };
  gaps.forEach((g, i) => byAxis[g.axis].push(i));
  for (const { leg, short: s } of short.values()) {
    const A = anchor(leg.a);
    const B = anchor(leg.b);
    if (!A || !B) continue;
    const axes = (["x", "y"] as const).filter((x) => Math.abs(leg.u[x]) >= SLANT).sort((p, q) => Math.abs(leg.u[q]) - Math.abs(leg.u[p]));
    for (const axis of axes) {
      const la = A[axis];
      const lb = B[axis];
      const lo = Math.min(la, lb);
      const hi = Math.max(la, lb);
      const mid = (leg.a[axis] + leg.b[axis]) / 2;
      let pick = -1;
      for (const i of byAxis[axis]) {
        const g = gaps[i]!;
        if (g.at <= lo + snap || g.at > hi + snap) continue;
        if (pick < 0 || Math.abs(g.at - mid) < Math.abs(gaps[pick]!.at - mid)) pick = i;
      }
      if (pick < 0) continue;
      grow[pick] = Math.max(grow[pick]!, s / Math.abs(leg.u[axis]));
      break;
    }
  }
  return grow;
}
