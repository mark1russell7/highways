import { curveOf, CURVE_TYPES, curveSpace, sampleCurve, type CurveType } from "../curves/index.ts";
import { polylineLength } from "../geom.ts";
import { nodeIndex, type Graph, type Router } from "../model.ts";
import { nearestSide, SIDE_NORMAL } from "../plugs.ts";
import { measureLinks, type MeasuredLink } from "./links.ts";

// The core runs in any host, so it reads the clock without the types of Node or the browser.
const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

/** One row of the benchmark of the curves: one curve type on the routes of one router on one fixture. */
export interface CurveBenchRow {
  readonly router: string;
  readonly fixture: string;
  readonly type: CurveType;
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
  return CURVE_TYPES.map((type): CurveBenchRow => {
    const make = (withSpace: boolean): MeasuredLink[] =>
      routes.map((r) => ({
        source: r.source,
        target: r.target,
        points: sampleCurve(
          curveOf(r.points, { type, radius: options.radius ?? 12, startNormal: r.startNormal, endNormal: r.endNormal, ...(withSpace ? { space } : {}) }),
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
      type,
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
export function formatCurves(rows: readonly CurveBenchRow[]): string {
  const head = "| router | fixture | curve | routes | through, polyline | through, free | through, clamped | length | ms |";
  const line = "|---|---|---|---:|---:|---:|---:|---:|---:|";
  const body = rows.map((r) => `| ${r.router} | ${r.fixture} | ${r.type} | ${r.links} | ${r.through} | ${r.free} | ${r.clamped} | ${r.length.toFixed(3)} | ${r.ms.toFixed(1)} |`);
  return [head, line, ...body].join("\n");
}
