import { tracedHighwayCurves, type JogStyle, type JogTrace, type LaneCurve } from "../curves/highway/index.ts";
import { CURVE_TYPES, curveSpace, distinctPoints, sampleCurve, type CubicSegment, type CurveSegment, type CurveSpace, type CurveType } from "../curves/index.ts";
import { polylineLength, segmentsCross, type Point } from "../geom.ts";
import { nodeIndex, type Graph, type Router } from "../model.ts";
import { nearestSide, SIDE_NORMAL } from "../plugs.ts";
import { laneRoutes, runKey, segmentsOf, type SegmentGraph } from "../segments.ts";
import { curveStrategies } from "../strategies/builtins.ts";
import type { Strategy } from "../strategies/model.ts";
import { measureLinks, type MeasuredLink } from "./links.ts";

// The core runs in any host, so it reads the clock without the types of Node or the browser.
const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

/**
 * One row of the benchmark of the curves: one curve type on the routes of one router on one fixture.
 * The type `T` of the name of the curve is `CurveType` for `benchCurves`, and `string` for `benchCurveStrategies`.
 */
export interface CurveBenchRow<T extends string = CurveType> {
  readonly router: string;
  readonly fixture: string;
  readonly type: T;
  /** The number of routes. */
  readonly links: number;
  /** The number of polylines that go through a box that is not one of their ends (`measureLinks`). */
  readonly through: number;
  /** The number of curves without a free space that go through such a box. */
  readonly free: number;
  /** The number of curves with the free space of the nodes (`curveSpace`) that go through such a box. */
  readonly clamped: number;
  /** The ratio of the length of all curves with the free space to the length of all polylines. */
  readonly length: number;
  /** The time to make all curves with the free space, in milliseconds. */
  readonly ms: number;
}

/** The options of `benchCurves`. */
export interface CurveBenchOptions {
  /** The radius of the types `rounded` and `arc`. The default is 12. */
  readonly radius?: number;
  /** The tolerance of the samples of the curves. The default is 0.25. */
  readonly tolerance?: number;
}

/**
 * This function routes a graph with a router and makes each curve type of each route.
 * It counts the curves that go through a box, with and without the free space, and it compares their length to the polylines.
 * The type `spline` leaves each plug along the normal of the nearest side of its node.
 */
export function benchCurves(router: Router, fixture: string, graph: Graph, options: CurveBenchOptions = {}): CurveBenchRow[] {
  // Each built-in curve strategy has the name of its curve type, so each row has a `CurveType`.
  return benchCurveStrategies(
    router,
    fixture,
    graph,
    CURVE_TYPES.map((t) => curveStrategies[t]),
    options,
  ) as CurveBenchRow[];
}

/**
 * This function does the work of `benchCurves` with a list of curve strategies, in place of the curve types.
 * The option `radius` goes to each strategy. A strategy without such an option does not read it.
 */
export function benchCurveStrategies(
  router: Router,
  fixture: string,
  graph: Graph,
  curves: readonly Strategy<"curve">[],
  options: CurveBenchOptions = {},
): CurveBenchRow<string>[] {
  const tolerance = options.tolerance ?? 0.25;
  const result = router.route(graph);
  const byId = nodeIndex(graph);
  const boxes = new Map(graph.nodes.map((n) => [n.id, n.box]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const space = curveSpace(
    graph.nodes.map((n) => n.box),
    tolerance,
  );
  const routes = result.routes.flatMap((r) => {
    const e = edges.get(r.edge);
    const s = e && byId.get(e.source.node);
    const t = e && byId.get(e.target.node);
    if (!e || !s || !t || r.points.length < 2) return [];
    const first = r.points[0]!;
    const last = r.points[r.points.length - 1]!;
    return [{ source: s.id, target: t.id, points: r.points, startNormal: SIDE_NORMAL[nearestSide(s.box, first)], endNormal: SIDE_NORMAL[nearestSide(t.box, last)] }];
  });
  const base = measureLinks(boxes, routes);
  const ink = routes.reduce((sum, r) => sum + polylineLength(r.points), 0);
  const radius = { radius: options.radius ?? 12 };
  return curves.map((curve): CurveBenchRow<string> => {
    const make = (withSpace: boolean): MeasuredLink[] =>
      routes.map((r) => ({
        source: r.source,
        target: r.target,
        points: sampleCurve(
          curve.run({ points: r.points, startNormal: r.startNormal, endNormal: r.endNormal, ...(withSpace ? { space } : {}) }, radius),
          tolerance,
        ),
      }));
    const free = measureLinks(boxes, make(false));
    const t0 = now();
    const clamped = make(true);
    const ms = now() - t0;
    const length = clamped.reduce((sum, l) => sum + polylineLength(l.points), 0);
    return {
      router: router.name,
      fixture,
      type: curve.name,
      links: routes.length,
      through: base.through,
      free: free.through,
      clamped: measureLinks(boxes, clamped).through,
      length: ink > 0 ? length / ink : 1,
      ms,
    };
  });
}

/** This function writes the rows of `benchCurves` as a Markdown table. */
export function formatCurves(rows: readonly CurveBenchRow<string>[]): string {
  const head = "| router | fixture | curve | routes | through, polyline | through, free | through, clamped | length | ms |";
  const line = "|---|---|---|---:|---:|---:|---:|---:|---:|";
  const body = rows.map((r) => `| ${r.router} | ${r.fixture} | ${r.type} | ${r.links} | ${r.through} | ${r.free} | ${r.clamped} | ${r.length.toFixed(3)} | ${r.ms.toFixed(1)} |`);
  return [head, line, ...body].join("\n");
}

/** The options of `measureHighways`. */
export interface HighwayMeasureOptions {
  /** The largest width of an open segment, as in `laneRoutes`. The default is 16. */
  readonly maxWidth?: number;
  /** A piece of a curve with a radius under this value counts in `underMin`. The default is 4. */
  readonly minRadius?: number;
  /** The length at each end of a segment that the spacing does not sample, for the merges and the splits. The default is 12. */
  readonly ends?: number;
  /** The free space of the board. With it, the measure counts the lanes that go through a box that their polyline avoids. */
  readonly space?: CurveSpace;
}

/**
 * The measures of the lanes of the open segments of a board, after a curve.
 * The spacing errors are shares of the spacing of the segment: 0.05 is 5% of the spacing.
 */
export interface HighwayMeasures {
  /** The number of open segments with two lanes or more. */
  readonly bundles: number;
  /** The number of curves of edges in an open segment. */
  readonly lanes: number;
  /** The number of sample points of the spacing. */
  readonly samples: number;
  /** The largest spacing error at a sample point. */
  readonly worstSpacing: number;
  /** The mean spacing error of the sample points. */
  readonly meanSpacing: number;
  /** The share of the sample points with a spacing error over `SPACING_LIMIT`. */
  readonly overLimit: number;
  /** The number of points where two lanes of one open segment cross, in the body of the segment: its bends and its straight parts. */
  readonly crossings: number;
  /** The number of points where two lanes of one open segment cross near an end of the segment, in the option `ends`. These are the merges and splits. */
  readonly endCrossings: number;
  /** The number of breaks of the tangent (G1 faults) near the open segments, by more than `BREAK` radians. */
  readonly breaks: number;
  /** The smallest radius of an arc or a cubic piece near the open segments. It is `Infinity` when there is no such piece. */
  readonly minRadius: number;
  /** The number of arcs and cubic pieces near the open segments with a radius under the option `minRadius`. */
  readonly underMin: number;
  /** The number of lanes that go through a box that their polyline of `laneRoutes` avoids. */
  readonly through: number;
}

/** A break of the tangent larger than this angle, in radians, counts in `breaks`. */
export const BREAK = 0.01;

/** A spacing error over this share of the spacing counts in `overLimit`. */
export const SPACING_LIMIT = 0.05;

/** A lane goes along a segment for the spacing where the cosine of the angle between their directions is at least this value. */
const ALONG = Math.cos(Math.PI / 6);
/** A lane is in a segment for the crossings where the cosine of the angle between their directions is at least this value. */
const FORWARD = Math.cos((5 * Math.PI) / 12);

/** This function gives the unit tangent at the start and at the end of a segment that starts at `from`. */
function tangents(from: Point, s: CurveSegment): [Point, Point] | undefined {
  const unit = (a: Point, b: Point): Point | undefined => {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    return l > 1e-9 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : undefined;
  };
  if (s.kind === "move") return undefined;
  if (s.kind === "line") {
    const u = unit(from, s.to);
    return u && [u, u];
  }
  if (s.kind === "cubic") {
    const a = unit(from, s.c1) ?? unit(from, s.c2) ?? unit(from, s.to);
    const b = unit(s.c2, s.to) ?? unit(s.c1, s.to) ?? unit(from, s.to);
    return a && b && [a, b];
  }
  const d = Math.sign(s.sweep);
  const end = s.start + s.sweep;
  return [
    { x: -d * Math.sin(s.start), y: d * Math.cos(s.start) },
    { x: -d * Math.sin(end), y: d * Math.cos(end) },
  ];
}

/** This function gives the smallest radius of curvature of a cubic piece from `p0`, from 33 sample points. */
function cubicRadius(p0: Point, c: CubicSegment): number {
  let min = Infinity;
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const u = 1 - t;
    const dx = 3 * (u * u * (c.c1.x - p0.x) + 2 * u * t * (c.c2.x - c.c1.x) + t * t * (c.to.x - c.c2.x));
    const dy = 3 * (u * u * (c.c1.y - p0.y) + 2 * u * t * (c.c2.y - c.c1.y) + t * t * (c.to.y - c.c2.y));
    const ddx = 6 * (u * (c.c2.x - 2 * c.c1.x + p0.x) + t * (c.to.x - 2 * c.c2.x + c.c1.x));
    const ddy = 6 * (u * (c.c2.y - 2 * c.c1.y + p0.y) + t * (c.to.y - 2 * c.c2.y + c.c1.y));
    const k = Math.abs(dx * ddy - dy * ddx);
    if (k > 1e-12) min = Math.min(min, Math.hypot(dx, dy) ** 3 / k);
  }
  return min;
}

/** This function gives points along a polyline, `step` apart, with the first point and the last point. */
function resample(p: readonly Point[], step: number): Point[] {
  const out: Point[] = p.length > 0 ? [p[0]!] : [];
  let next = step;
  let s = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    while (next < s + l) {
      const t = (next - s) / l;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      next += step;
    }
    s += l;
  }
  if (p.length > 1) out.push(p[p.length - 1]!);
  return out;
}

/** The nearest point of a polyline to a point. */
interface Nearest {
  /** The distance to the polyline. */
  readonly d: number;
  /** The place of the nearest point along the polyline. */
  readonly s: number;
  /** The unit direction of the piece of the polyline with the nearest point. */
  readonly u: Point;
}

/** This function gives the nearest point of a polyline to `q`. */
function nearest(q: Point, p: readonly Point[]): Nearest {
  let best = Infinity;
  let at = 0;
  let u: Point = { x: 1, y: 0 };
  let s = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (l * l)));
    const d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
    if (d < best && l > 0) {
      best = d;
      at = s + t * l;
      u = { x: dx / l, y: dy / l };
    }
    s += l;
  }
  return { d: best, s: at, u };
}

/** One open segment with two lanes or more, as the measure sees it. */
interface Bundle {
  /** The center line, with no repeated points. */
  readonly c: readonly Point[];
  readonly edges: readonly string[];
  /** The direction of each lane along the center line: 1 forward, -1 back. */
  readonly sign: readonly number[];
  readonly spacing: number;
  /** The largest distance from the center line of a point of a lane in the segment. */
  readonly band: number;
  readonly total: number;
}

/**
 * This function gives the parts of a sampled lane that go along a bundle. Each part is near its center line, between the places `from` and `to`.
 * Each part goes in the direction of the lane in the bundle. A lane that passes near the bundle in another direction is not in it there.
 */
function partsAlong(p: readonly Point[], b: Bundle, sign: number, from: number, to: number, cos: number): Point[][] {
  const xs = b.c.map((q) => q.x);
  const ys = b.c.map((q) => q.y);
  const x0 = Math.min(...xs) - b.band;
  const x1 = Math.max(...xs) + b.band;
  const y0 = Math.min(...ys) - b.band;
  const y1 = Math.max(...ys) + b.band;
  const parts: Point[][] = [];
  let cur: Point[] = [];
  for (let i = 0; i < p.length; i++) {
    const q = p[i]!;
    let ok = q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
    if (ok) {
      const m = nearest(q, b.c);
      const a = p[Math.max(0, i - 1)]!;
      const z = p[Math.min(p.length - 1, i + 1)]!;
      const l = Math.hypot(z.x - a.x, z.y - a.y);
      ok = m.d <= b.band && m.s >= from && m.s <= to && l > 0 && sign * ((z.x - a.x) * m.u.x + (z.y - a.y) * m.u.y) >= cos * l;
    }
    if (ok) cur.push(q);
    else if (cur.length > 0) {
      parts.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) parts.push(cur);
  return parts;
}

/**
 * This function measures the lanes of the open segments of a board after a curve. It measures the spacing, the crossings,
 * the breaks of the tangent, the radii and the lanes that go through a box.
 *
 * A lane is in a segment where it goes near the center line of the segment, in its direction along the segment.
 * The spacing samples each lane `spacing / 4` apart, from the middle of the first leg to the middle of the last leg.
 * It does not sample the lane in the option `ends`. The ends of a segment are for the merges and the splits.
 *
 * A sample compares the distance to the next lane with the spacing. It counts when the next lane is in the band of the segment.
 * The crossings, the breaks and the radii count along the full segment, and `ends` past each end of it.
 */
export function measureHighways(
  graph: SegmentGraph,
  open: ReadonlySet<string>,
  laneWidth: number,
  curves: readonly LaneCurve[],
  options: HighwayMeasureOptions = {},
): HighwayMeasures {
  const maxWidth = options.maxWidth ?? 16;
  const minRadius = options.minRadius ?? 4;
  const ends = options.ends ?? 12;
  const signs = new Map<string, number>();
  for (const path of graph.paths) for (const ref of path.segments) signs.set(`${ref.segment}|${path.edge}`, ref.reverse ? -1 : 1);
  const bundles: Bundle[] = [];
  for (const s of graph.segments) {
    const c = distinctPoints(s.points);
    if (s.count < 2 || !open.has(runKey(s.edges)) || c.length < 2) continue;
    const spacing = Math.min(laneWidth, maxWidth / (s.count - 1));
    const sign = s.edges.map((e) => signs.get(`${s.id}|${e}`) ?? 1);
    bundles.push({ c, edges: s.edges, sign, spacing, band: ((s.count - 1) / 2) * spacing + spacing, total: polylineLength(c) });
  }
  const inBundle = new Set(bundles.flatMap((s) => s.edges));
  const lanes = curves.filter((c) => inBundle.has(c.edge));
  // The samples of the curves are within 0.5% of the spacing of the curve, so the samples add almost no error.
  const fine = Math.max(1e-3, Math.min(laneWidth, maxWidth) * 0.005);
  const sampled = new Map(lanes.map((c) => [c.edge, sampleCurve(c.segments, fine)]));
  let samples = 0;
  let worst = 0;
  let sum = 0;
  let over = 0;
  const crossings = new Set<string>();
  const endCrossings = new Set<string>();
  for (const b of bundles) {
    const sp = b.spacing;
    const c = b.c;
    const from = Math.max(ends, Math.hypot(c[1]!.x - c[0]!.x, c[1]!.y - c[0]!.y) / 2);
    const to = b.total - Math.max(ends, Math.hypot(c[c.length - 1]!.x - c[c.length - 2]!.x, c[c.length - 1]!.y - c[c.length - 2]!.y) / 2);
    const body = b.edges.map((e, k) => partsAlong(sampled.get(e) ?? [], b, b.sign[k]!, from, to, ALONG));
    const whole = b.edges.map((e, k) => partsAlong(sampled.get(e) ?? [], b, b.sign[k]!, 0, b.total, ALONG));
    const crossing = b.edges.map((e, k) => partsAlong(sampled.get(e) ?? [], b, b.sign[k]!, 0, b.total, FORWARD));
    for (let k = 0; k + 1 < b.edges.length; k++)
      for (const [x, y] of [
        [k, k + 1],
        [k + 1, k],
      ] as const)
        for (const part of body[x]!)
          for (const q of resample(part, sp / 4)) {
            let d = Infinity;
            for (const other of whole[y]!) d = Math.min(d, nearest(q, other).d);
            if (d > b.band) continue;
            const err = Math.abs(d - sp) / sp;
            samples += 1;
            sum += err;
            if (err > SPACING_LIMIT) over += 1;
            worst = Math.max(worst, err);
          }
    for (let i = 0; i < b.edges.length; i++)
      for (let j = i + 1; j < b.edges.length; j++)
        for (const P of crossing[i]!)
          for (const Q of crossing[j]!)
            for (let x = 1; x < P.length; x++)
              for (let y = 1; y < Q.length; y++) {
                if (!segmentsCross(P[x - 1]!, P[x]!, Q[y - 1]!, Q[y]!)) continue;
                const q = { x: (P[x - 1]!.x + P[x]!.x) / 2, y: (P[x - 1]!.y + P[x]!.y) / 2 };
                const pair = [b.edges[i]!, b.edges[j]!].sort().join("|");
                const at = nearest(q, c).s;
                (at >= from && at <= to ? crossings : endCrossings).add(`${pair}@${Math.round(q.x)},${Math.round(q.y)}`);
              }
  }
  // A piece of a lane is near a segment of the lane when its start is near the center line, or past an end by no more than `ends`.
  const near = new Map<string, Bundle[]>();
  for (const b of bundles) for (const e of b.edges) near.set(e, [...(near.get(e) ?? []), b]);
  const isNear = (edge: string, q: Point): boolean => (near.get(edge) ?? []).some((b) => nearest(q, b.c).d <= b.band + ends);
  let breaks = 0;
  let least = Infinity;
  let underMin = 0;
  let through = 0;
  const polylines = options.space ? new Map(laneRoutes(graph, open, laneWidth, maxWidth).map((r) => [r.edge, r.points])) : undefined;
  for (const lane of lanes) {
    let at: Point | undefined;
    let before: Point | undefined;
    for (const s of lane.segments) {
      if (s.kind === "move" || at === undefined) {
        at = s.to;
        before = undefined;
        continue;
      }
      const t = tangents(at, s);
      const close = isNear(lane.edge, at);
      if (close && t && before && Math.acos(Math.max(-1, Math.min(1, before.x * t[0].x + before.y * t[0].y))) > BREAK) breaks += 1;
      const r = s.kind === "arc" ? s.radius : s.kind === "cubic" ? cubicRadius(at, s) : Infinity;
      if (close && r < Infinity) {
        least = Math.min(least, r);
        if (r < minRadius - 1e-9) underMin += 1;
      }
      if (t) before = t[1];
      at = s.to;
    }
    const p = polylines?.get(lane.edge);
    if (options.space && p && options.space.addsHit(sampleCurve(lane.segments, options.space.tolerance), p)) through += 1;
  }
  return {
    bundles: bundles.length,
    lanes: lanes.length,
    samples,
    worstSpacing: worst,
    meanSpacing: samples > 0 ? sum / samples : 0,
    overLimit: samples > 0 ? over / samples : 0,
    crossings: crossings.size,
    endCrossings: endCrossings.size,
    breaks,
    minRadius: least,
    underMin,
    through,
  };
}

/** One row of `benchHighways`: the measures of the lanes of one router on one board, after one way to curve them. */
export interface HighwayBenchRow extends HighwayMeasures {
  readonly router: string;
  readonly fixture: string;
  /** The way to curve the lanes: `rounded` curves each lane alone, and `highway` curves the lanes of a bundle together. */
  readonly curve: "rounded" | "highway";
  /** The shape of the S curves of a row `highway`. */
  readonly jog?: JogStyle;
  /** The measures of the S curves of a row `highway`. */
  readonly jogs?: JogMeasures;
  /** The time to make all curves, in milliseconds. */
  readonly ms: number;
}

/** The measures of the S curves where the lanes join or leave a bundle. Each curvature is in 1 / units. */
export interface JogMeasures {
  /** The number of S curves. */
  readonly count: number;
  /** The median and the largest of the peak curvature of each S curve. */
  readonly peakMedian: number;
  readonly peakMax: number;
  /** The largest curvature at an end of an S curve. The straight leg next to it has the curvature 0, so it is the jump at the end. */
  readonly endJump: number;
  /** The largest jump of the curvature at a joint inside an S curve. */
  readonly innerJump: number;
}

/** This function gives the curvature of the cubic `(p0, c1, c2, p3)` at `t`. */
function cubicCurvature(p0: Point, s: CubicSegment, t: number): number {
  const u = 1 - t;
  const [c1, c2, p3] = [s.c1, s.c2, s.to];
  const dx = 3 * u * u * (c1.x - p0.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (p3.x - c2.x);
  const dy = 3 * u * u * (c1.y - p0.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (p3.y - c2.y);
  const ddx = 6 * u * (c2.x - 2 * c1.x + p0.x) + 6 * t * (p3.x - 2 * c2.x + c1.x);
  const ddy = 6 * u * (c2.y - 2 * c1.y + p0.y) + 6 * t * (p3.y - 2 * c2.y + c1.y);
  const speed = Math.hypot(dx, dy);
  return speed > 1e-12 ? (dx * ddy - dy * ddx) / speed ** 3 : 0;
}

/** This function gives the signed curvature at the start (`t = 0`) and at the end (`t = 1`) of a segment, and its largest absolute curvature. */
function curvatureOf(from: Point, s: CurveSegment): { readonly start: number; readonly end: number; readonly peak: number } {
  if (s.kind === "arc") {
    const k = s.radius > 0 ? Math.sign(s.sweep) / s.radius : 0;
    return { start: k, end: k, peak: Math.abs(k) };
  }
  if (s.kind !== "cubic") return { start: 0, end: 0, peak: 0 };
  let peak = 0;
  for (let i = 0; i <= 64; i++) peak = Math.max(peak, Math.abs(cubicCurvature(from, s, i / 64)));
  return { start: cubicCurvature(from, s, 0), end: cubicCurvature(from, s, 1), peak };
}

/** This function measures the S curves of the lanes. `jogs` has the first and the last index of each S curve in the segments of its lane. */
export function measureJogs(curves: readonly LaneCurve[], jogs: JogTrace): JogMeasures {
  const peaks: number[] = [];
  let endJump = 0;
  let innerJump = 0;
  curves.forEach((c, i) => {
    for (const [first, last] of jogs[i] ?? []) {
      let peak = 0;
      let before: number | undefined;
      for (let k = first; k <= last; k++) {
        const s = c.segments[k]!;
        const from = c.segments[k - 1]?.to ?? s.to;
        const m = curvatureOf(from, s);
        peak = Math.max(peak, m.peak);
        if (k === first) endJump = Math.max(endJump, Math.abs(m.start));
        if (k === last) endJump = Math.max(endJump, Math.abs(m.end));
        if (before !== undefined) innerJump = Math.max(innerJump, Math.abs(before - m.start));
        before = m.end;
      }
      peaks.push(peak);
    }
  });
  peaks.sort((a, b) => a - b);
  const mid = peaks.length === 0 ? 0 : peaks.length % 2 === 1 ? peaks[(peaks.length - 1) / 2]! : (peaks[peaks.length / 2 - 1]! + peaks[peaks.length / 2]!) / 2;
  return { count: peaks.length, peakMedian: mid, peakMax: peaks.length === 0 ? 0 : peaks[peaks.length - 1]!, endJump, innerJump };
}

/** The options of `benchHighways`. */
export interface HighwayBenchOptions {
  /** The spacing of the lanes. The default is 4. */
  readonly spacing?: number;
  /** The largest width of an open segment. The default is 16. */
  readonly maxWidth?: number;
  /** The radius of each curve. The default is 12. */
  readonly radius?: number;
  /** The smallest radius of `highwayCurves`, and the limit of `underMin`. The default is 4. */
  readonly minRadius?: number;
  /** The shapes of the S curves. Each shape gives one row `highway`. The default is `["biarc"]`. */
  readonly jogs?: readonly JogStyle[];
  /** The number of cubic pieces of a `quintic` S curve. The default is 4. */
  readonly jogPieces?: number;
}

/**
 * This function routes a graph, opens each shared segment, and curves the lanes in two ways.
 * The row `rounded` curves each lane of `laneRoutes` alone with the curve `rounded`. Each row `highway` curves them with `highwayCurves` and one shape of S curve.
 * Both ways get the free space of the nodes.
 */
export function benchHighways(router: Router, fixture: string, graph: Graph, options: HighwayBenchOptions = {}): HighwayBenchRow[] {
  const spacing = options.spacing ?? 4;
  const maxWidth = options.maxWidth ?? 16;
  const radius = options.radius ?? 12;
  const minRadius = options.minRadius ?? 4;
  const segments = segmentsOf(router.route(graph));
  const open = new Set(segments.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  const space = curveSpace(graph.nodes.map((n) => n.box));
  const measure = { maxWidth, minRadius, ends: radius, space };
  const t0 = now();
  const alone = laneRoutes(segments, open, spacing, maxWidth).map((r) => ({ edge: r.edge, segments: curveStrategies.rounded.run({ points: r.points, space }, { radius }) }));
  const t1 = now();
  const rows: HighwayBenchRow[] = [{ router: router.name, fixture, curve: "rounded", ...measureHighways(segments, open, spacing, alone, measure), ms: t1 - t0 }];
  for (const jog of options.jogs ?? ["biarc"]) {
    const t2 = now();
    const together = tracedHighwayCurves(segments, open, spacing, { maxWidth, radius, minRadius, space, jog, jogPieces: options.jogPieces ?? 4 });
    const t3 = now();
    rows.push({
      router: router.name,
      fixture,
      curve: "highway",
      jog,
      jogs: measureJogs(together.curves, together.jogs),
      ...measureHighways(segments, open, spacing, together.curves, measure),
      ms: t3 - t2,
    });
  }
  return rows;
}

/** This function writes the rows of `benchHighways` as a Markdown table. The spacing errors are percents of the spacing. */
export function formatHighways(rows: readonly HighwayBenchRow[]): string {
  const head =
    "| router | fixture | curve | jog | bundles | lanes | worst spacing | mean spacing | over 5% | crossings | end crossings | tangent breaks | min radius | under min | through | S curves | S peak κ median | S peak κ max | S end κ | S inner jump | ms |";
  const line = "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const k = (v: number | undefined): string => (v === undefined ? "-" : v.toFixed(4));
  const body = rows.map(
    (r) =>
      `| ${r.router} | ${r.fixture} | ${r.curve} | ${r.jog ?? "-"} | ${r.bundles} | ${r.lanes} | ${pct(r.worstSpacing)} | ${pct(r.meanSpacing)} | ${pct(r.overLimit)} | ${r.crossings} | ${r.endCrossings} | ${r.breaks} | ${r.minRadius === Infinity ? "-" : r.minRadius.toFixed(2)} | ${r.underMin} | ${r.through} | ${r.jogs?.count ?? "-"} | ${k(r.jogs?.peakMedian)} | ${k(r.jogs?.peakMax)} | ${k(r.jogs?.endJump)} | ${k(r.jogs?.innerJump)} | ${r.ms.toFixed(1)} |`,
  );
  return [head, line, ...body].join("\n");
}
