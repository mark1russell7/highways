import {
  bendCount,
  dist,
  frechet,
  inflectionCount,
  polylineLength,
  segmentBoxDistance,
  segmentsCross,
  type Box,
  type Point,
} from "../geom.ts";
import { rng } from "../fixtures.ts";
import { Grid } from "../grid.ts";
import { nodeIndex, type Graph, type Node, type Result } from "../model.ts";

/** The quality of a result. Lower is better for each value except `clearance`. */
export interface Quality {
  /** The length of all drawn lines. A segment that several routes share counts one time. */
  readonly ink: number;
  /** The number of points where two drawn segments cross. */
  readonly crossings: number;
  /** This value is true when `crossings` is an estimate from a sample of the segments. */
  readonly crossingsEstimated: boolean;
  /** The mean number of bends of a route. */
  readonly bends: number;
  /** The mean number of inflections of a route. */
  readonly inflections: number;
  /** The mean distance from a route to the nearest node that is not one of its ends, up to `CLEARANCE_CAP`. */
  readonly clearance: number;
  /** The share of the routes that come closer than 4 units to a node that is not one of their ends. */
  readonly tight: number;
  /** The mean ratio of the length of a route to the distance between its ends. */
  readonly detour: number;
  /** The mean angle, in degrees, between the first or last segment of a route and the normal of the side of its node. */
  readonly plugAngle: number;
}

/** The clearance stops at this distance. */
export const CLEARANCE_CAP = 40;
const TIGHT = 4;
const EXACT_CROSSINGS = 20_000;
const SAMPLE = 2_000;

const key = (p: Point): string => `${Math.round(p.x * 8)},${Math.round(p.y * 8)}`;

/** This function measures the quality of a result. */
export function measureQuality(graph: Graph, result: Result): Quality {
  const byId = nodeIndex(graph);
  const nodes = new Grid<Node>(180);
  for (const n of graph.nodes) nodes.add(n, n.box);

  // The drawn segments: one for each distinct pair of ends.
  const segs: [Point, Point][] = [];
  const seen = new Set<string>();
  let bends = 0;
  let infl = 0;
  let clear = 0;
  let tight = 0;
  let detour = 0;
  let detourN = 0;
  let angle = 0;
  let angleN = 0;
  for (const r of result.routes) {
    const p = r.points;
    for (let i = 1; i < p.length; i++) {
      const ka = key(p[i - 1]!);
      const kb = key(p[i]!);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(k)) continue;
      seen.add(k);
      segs.push([p[i - 1]!, p[i]!]);
    }
    bends += bendCount(p);
    infl += inflectionCount(p);
    const ends = endNodes(graph, byId, r.edge);
    let c = CLEARANCE_CAP;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      nodes.querySegment(a, b, c, (n) => {
        if (n !== ends.source && n !== ends.target) c = Math.min(c, segmentBoxDistance(a, b, n.box));
      });
    }
    clear += c;
    if (c < TIGHT) tight++;
    if (p.length >= 2) {
      const d = dist(p[0]!, p[p.length - 1]!);
      if (d > 1) {
        detour += polylineLength(p) / d;
        detourN++;
      }
      for (const [at, next, node] of [
        [p[0]!, p[1]!, ends.source],
        [p[p.length - 1]!, p[p.length - 2]!, ends.target],
      ] as const) {
        if (!node) continue;
        const a = sideAngle(node.box, at, next);
        if (a !== undefined) {
          angle += a;
          angleN++;
        }
      }
    }
  }
  const n = Math.max(1, result.routes.length);
  let ink = 0;
  for (const [a, b] of segs) ink += dist(a, b);
  const [crossings, crossingsEstimated] = countCrossings(segs);
  return {
    ink,
    crossings,
    crossingsEstimated,
    bends: bends / n,
    inflections: infl / n,
    clearance: clear / n,
    tight: tight / n,
    detour: detourN ? detour / detourN : 1,
    plugAngle: angleN ? angle / angleN : 0,
  };
}

interface Ends {
  readonly source: Node | undefined;
  readonly target: Node | undefined;
}

function endNodes(graph: Graph, byId: Map<string, Node>, edgeId: string): Ends {
  const e = edgeIndex(graph).get(edgeId);
  return { source: e && byId.get(e.source.node), target: e && byId.get(e.target.node) };
}

const edgeIndexes = new WeakMap<Graph, Map<string, Graph["edges"][number]>>();
function edgeIndex(graph: Graph): Map<string, Graph["edges"][number]> {
  let m = edgeIndexes.get(graph);
  if (!m) {
    m = new Map();
    for (const e of graph.edges) m.set(e.id, e);
    edgeIndexes.set(graph, m);
  }
  return m;
}

/**
 * This function gives an angle in degrees: the angle between the segment from `at` to `next` and the outward normal.
 * The normal is the normal of the side of the box nearest to `at`. A route that starts inside the box (an interior route) gives no angle.
 */
export function sideAngle(box: Box, at: Point, next: Point): number | undefined {
  const d = [
    [Math.abs(at.y - box.y), 0, -1],
    [Math.abs(at.x - (box.x + box.w)), 1, 0],
    [Math.abs(at.y - (box.y + box.h)), 0, 1],
    [Math.abs(at.x - box.x), -1, 0],
  ].sort((a, b) => a[0]! - b[0]!)[0]!;
  if (d[0]! > 1) return undefined;
  const vx = next.x - at.x;
  const vy = next.y - at.y;
  const l = Math.hypot(vx, vy);
  if (l === 0) return undefined;
  const cos = Math.max(-1, Math.min(1, (vx * d[1]! + vy * d[2]!) / l));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * This function counts the crossings of a set of segments with a grid of buckets.
 * Above 20 000 segments, it counts the crossings of a seeded sample of 2 000 segments and scales the count.
 */
export function countCrossings(segs: readonly (readonly [Point, Point])[]): [number, boolean] {
  if (segs.length < 2) return [0, false];
  const len = segs.reduce((s, [a, b]) => s + dist(a, b), 0) / segs.length;
  const grid = new Grid<number>(Math.max(20, len));
  segs.forEach(([a, b], i) => grid.addSegment(i, a, b));
  const exact = segs.length <= EXACT_CROSSINGS;
  const R = rng(segs.length);
  const pick = exact ? segs.map((_, i) => i) : Array.from({ length: SAMPLE }, () => Math.floor(R() * segs.length));
  let count = 0;
  for (const i of pick) {
    const [a, b] = segs[i]!;
    grid.querySegment(a, b, 0, (j) => {
      if (exact && j <= i) return;
      if (j === i) return;
      const [c, d] = segs[j]!;
      if (segmentsCross(a, b, c, d)) count++;
    });
  }
  return exact ? [count, false] : [Math.round((count * segs.length) / (2 * pick.length)), true];
}

/** The change between two results of the same graph: the Fréchet distance between the two routes of each edge. */
export interface Stability {
  readonly mean: number;
  readonly max: number;
  /** The share of the routes that moved more than 1 unit. */
  readonly moved: number;
}

/** This function measures how much the routes changed between two results. */
export function measureStability(before: Result, after: Result): Stability {
  const prev = new Map(before.routes.map((r) => [r.edge, r.points] as const));
  let sum = 0;
  let max = 0;
  let moved = 0;
  let n = 0;
  for (const r of after.routes) {
    const p = prev.get(r.edge);
    if (!p) continue;
    const f = frechet(p, r.points);
    sum += f;
    max = Math.max(max, f);
    if (f > 1) moved++;
    n++;
  }
  return { mean: n ? sum / n : 0, max, moved: n ? moved / n : 0 };
}
