import { TOLERANCE } from "../bench/properties.ts";
import { center, dist, inflate, pointBoxDistance, segmentHitsBox, type Box, type Point } from "../geom.ts";
import { Grid } from "../grid.ts";
import { fixedPortPoint, nodeIndex, type Bundle, type Edge, type Graph, type Level, type Node, type Result, type Route, type Router, type SharedRun } from "../model.ts";
import { nearestSide, placePlug, SIDE_NORMAL } from "../plugs.ts";
import { defineStrategy, type Strategy } from "../strategies/model.ts";
import { WayFinder } from "../ways.ts";
import { BoundaryWalk, nearestOnBoundary } from "./walk.ts";

export { BoundaryWalk, nearestOnBoundary } from "./walk.ts";

/** The options of the repair step (RULE-046). */
export interface RepairOptions {
  /** The distance from a box to the corners of a detour, and twice the clearance of a pushed leg. The default is 5. */
  readonly margin?: number;
  /** The number of visible neighbours of each corner of the detour graph. The default is 8. */
  readonly k?: number;
  /** With `false`, the step does not push a leg out of a box. The default is `true`. */
  readonly push?: boolean;
  /** With `false`, the step takes no detour through the corner graph. The default is `true`. */
  readonly detour?: boolean;
  /** With `false`, the step does not route a whole faulty route again through the corner graph. The default is `true`. */
  readonly reroute?: boolean;
  /** With `false`, the step does not walk along the boundaries of the boxes. The default is `true`. */
  readonly walk?: boolean;
}

/** The counts of one repair: what the step found and what it did. */
export interface RepairCounts {
  /** The number of edges whose two nodes are in the graph. */
  readonly routes: number;
  /** The routes with a break of a hard rule before the repair, and the missing routes. */
  readonly faulty: number;
  /** The ends that the step moved back to their plugs or to the boxes of their nodes. */
  readonly snapped: number;
  /** The legs that the step pushed out of a box. */
  readonly pushed: number;
  /** The legs that the step replaced with a detour through the corner graph. */
  readonly detoured: number;
  /** The faulty routes that the step routed again from end to end through the corner graph. */
  readonly rerouted: number;
  /** The faulty routes that the step replaced with a walk along the boundaries of the boxes. */
  readonly walked: number;
  /** The missing routes that the step added. */
  readonly added: number;
  /** The faulty routes that the step could not repair. They keep their base routes. */
  readonly kept: number;
  /** The edges that the step took out of a run or a bundle. The repaired route of such an edge does not hold the run or the trunk. */
  readonly unbundled: number;
  /** The ends of level links that the step moved to the boundaries of their items. */
  readonly linkEnds: number;
}

/** The result of `repairResult`: the repaired result and the counts. */
export interface RepairReport {
  readonly result: Result;
  readonly counts: RepairCounts;
}

/** The repair step makes at most this number of fixes for one route. A route that needs more keeps its base route. */
const MAX_FIXES = 64;

/** This function tells if the point is on the boundary of the box, within `TOLERANCE`, as the rule `link-ends` tests it. */
function onBoundary(p: Point, b: Box): boolean {
  const inner = inflate(b, -TOLERANCE);
  const deep = p.x > inner.x && p.x < inner.x + inner.w && p.y > inner.y && p.y < inner.y + inner.h;
  return !deep && pointBoxDistance(p, b) <= TOLERANCE;
}

/** This function tells if the polyline `p` holds the points of `part` in a row, within `TOLERANCE`. */
function holds(p: readonly Point[], part: readonly Point[]): boolean {
  if (part.length === 0) return true;
  for (let i = 0; i + part.length <= p.length; i++) if (part.every((q, j) => dist(q, p[i + j]!) <= TOLERANCE)) return true;
  return false;
}

/** This function drops each point that is at the same place as the point before it. */
function dedupe(p: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const v of p) if (out.length === 0 || dist(out[out.length - 1]!, v) > 1e-9) out.push(v);
  return out;
}

/**
 * This function repairs the breaks of the hard rules in the routes of any router (RULE-046). The input result does not change.
 *
 * - It adds a route through the corner graph for each edge without a route (`complete`).
 * - It moves each end back to its fixed plug, or to the nearest point of the box of its node (`ends-at-plugs` and `fixed-plugs`).
 * - It pushes each inner leg out of a box that it goes through, to the near side of the box (`no-pass-through`).
 * - It replaces each other leg through a box with a detour through the corner graph.
 * - When a leg does not repair, it routes the whole route again through the corner graph.
 *   Else it walks along the boundaries of the boxes (`BoundaryWalk`).
 * - A route that still breaks a rule keeps its base route.
 * - It takes an edge out of a run or a bundle when its new route does not hold the run or the trunk (`run-shared` and `bundle-trunk`).
 * - It moves the ends of each level link to the boundaries of its items (`link-ends`).
 *
 * A route without a break does not change. The same input gives the same output.
 */
export function repairResult(graph: Graph, result: Result, options: RepairOptions = {}): RepairReport {
  const margin = options.margin ?? 5;
  const doPush = options.push ?? true;
  const doDetour = options.detour ?? true;
  const doReroute = options.reroute ?? true;
  const doWalk = options.walk ?? true;
  const byId = nodeIndex(graph);
  const grid = new Grid<Node>(180);
  for (const n of graph.nodes) grid.add(n, n.box);
  let ways: WayFinder | undefined;
  let walker: BoundaryWalk | undefined;
  const walkerOf = (): BoundaryWalk => (walker ??= new BoundaryWalk(graph.nodes, grid));
  const waysOf = (): WayFinder => (ways ??= new WayFinder(graph.nodes, { margin, ...(options.k === undefined ? {} : { k: options.k }) }));
  const counts = { routes: 0, faulty: 0, snapped: 0, pushed: 0, detoured: 0, rerouted: 0, walked: 0, added: 0, kept: 0, unbundled: 0, linkEnds: 0 };

  // The test of the rule `no-pass-through`: a node whose box the segment goes through. The end nodes `s` and `t` do not count.
  const hitOf = (p: Point, q: Point, s: Node, t: Node): Node | undefined => {
    let hit: Node | undefined;
    grid.querySegment(p, q, 0, (n) => {
      if (!hit && n !== s && n !== t && segmentHitsBox(p, q, inflate(n.box, -TOLERANCE))) hit = n;
    });
    return hit;
  };
  const clear = (p: readonly Point[], s: Node, t: Node): boolean => {
    for (let i = 1; i < p.length; i++) if (hitOf(p[i - 1]!, p[i]!, s, t)) return false;
    return true;
  };

  // The point at `margin` out of the box that `p` is on or in, along the normal of its nearest side. A point on no box stays.
  const leave = (p: Point): Point => {
    let on: Node | undefined;
    grid.query({ x: p.x - TOLERANCE, y: p.y - TOLERANCE, w: 2 * TOLERANCE, h: 2 * TOLERANCE }, (n) => {
      if (!on && pointBoxDistance(p, n.box) <= TOLERANCE) on = n;
    });
    if (!on) return p;
    const at = nearestOnBoundary(on.box, p);
    const nrm = SIDE_NORMAL[nearestSide(on.box, at)];
    return { x: at.x + nrm.x * margin, y: at.y + nrm.y * margin };
  };

  // The polyline with the leg `i` moved to one side of the box, with the clearance `margin / 2`, or `undefined`.
  const push = (p: readonly Point[], i: number, box: Box, s: Node, t: Node): Point[] | undefined => {
    const a = p[i - 1]!;
    const b = p[i]!;
    const len = dist(a, b);
    if (len <= 0) return undefined;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const big = inflate(box, margin / 2);
    const proj = [
      { x: big.x, y: big.y },
      { x: big.x + big.w, y: big.y },
      { x: big.x, y: big.y + big.h },
      { x: big.x + big.w, y: big.y + big.h },
    ].map((c) => (c.x - a.x) * nx + (c.y - a.y) * ny);
    const shifts = [Math.max(...proj), Math.min(...proj)].sort((u, v) => Math.abs(u) - Math.abs(v));
    for (const d of shifts) {
      const moved = [...p];
      moved[i - 1] = { x: a.x + nx * d, y: a.y + ny * d };
      moved[i] = { x: b.x + nx * d, y: b.y + ny * d };
      if (clear([p[i - 2]!, moved[i - 1]!, moved[i]!, p[i + 1]!], s, t)) return moved;
    }
    return undefined;
  };

  // The polyline with the leg `i` replaced by a detour through the corner graph, or `undefined`.
  const detour = (p: readonly Point[], i: number, s: Node, t: Node): Point[] | undefined => {
    const a = p[i - 1]!;
    const b = p[i]!;
    const finder = waysOf();
    const way = finder.corners.path(leave(a), leave(b));
    if (!way) return undefined;
    const mid = dedupe([a, ...finder.corners.pull(way), b]);
    if (!clear(mid, s, t)) return undefined;
    return [...p.slice(0, i - 1), ...mid, ...p.slice(i + 1)];
  };

  const changed = new Set<string>();
  const repairOne = (r: Route, s: Node, t: Node, e: Edge): Route => {
    let p = dedupe(r.points);
    if (p.length < 2) p = [...r.points];
    let snapped = 0;
    const first = p[0]!;
    const last = p[p.length - 1]!;
    const wantA = fixedPortPoint(s, e.source) ?? (pointBoxDistance(first, s.box) > TOLERANCE ? nearestOnBoundary(s.box, first) : undefined);
    const wantB = fixedPortPoint(t, e.target) ?? (pointBoxDistance(last, t.box) > TOLERANCE ? nearestOnBoundary(t.box, last) : undefined);
    if (wantA && dist(wantA, first) > TOLERANCE) {
      p[0] = wantA;
      snapped++;
    }
    if (wantB && dist(wantB, last) > TOLERANCE) {
      p[p.length - 1] = wantB;
      snapped++;
    }
    let fault = snapped > 0;
    let pushed = 0;
    let detoured = 0;
    let fixes = 0;
    let failed = false;
    for (let i = 1; i < p.length; ) {
      const hit = hitOf(p[i - 1]!, p[i]!, s, t);
      if (!hit) {
        i++;
        continue;
      }
      fault = true;
      if (++fixes > MAX_FIXES) {
        failed = true;
        break;
      }
      const moved = doPush && i >= 2 && i + 1 < p.length ? push(p, i, hit.box, s, t) : undefined;
      if (moved) {
        p = moved;
        pushed++;
        i++;
        continue;
      }
      const around = doDetour ? detour(p, i, s, t) : undefined;
      if (!around) {
        failed = true;
        break;
      }
      i += around.length - p.length + 1;
      p = around;
      detoured++;
    }
    if (!fault) return r;
    counts.faulty++;
    let whole: "rerouted" | "walked" | undefined;
    if (failed) {
      // The legs do not repair one by one. The step routes the whole route again from its two ends.
      const a = p[0]!;
      const b = p[p.length - 1]!;
      const finder = doReroute ? waysOf() : undefined;
      const way = finder?.corners.path(leave(a), leave(b));
      const again = way ? dedupe([a, ...finder!.corners.pull(way), b]) : undefined;
      if (again && clear(again, s, t)) {
        p = again;
        whole = "rerouted";
      } else {
        const walk = doWalk ? walkerOf().path(a, s, b, t) : undefined;
        if (walk && clear(walk, s, t)) {
          p = walk;
          whole = "walked";
        }
      }
      if (!whole) {
        counts.kept++;
        return r;
      }
      counts[whole]++;
    }
    counts.snapped += snapped;
    if (!whole) {
      counts.pushed += pushed;
      counts.detoured += detoured;
    }
    changed.add(r.edge);
    return { edge: r.edge, points: p };
  };

  const routeOf = new Map<string, Route>();
  for (const r of result.routes) if (!routeOf.has(r.edge)) routeOf.set(r.edge, r);
  const repaired = new Map<string, Route>();
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t || repaired.has(e.id)) continue;
    counts.routes++;
    const r = routeOf.get(e.id);
    if (r && r.points.length >= 2) {
      repaired.set(e.id, repairOne(r, s, t, e));
      continue;
    }
    counts.faulty++;
    const ps = placePlug(s, e.source, center(t.box));
    const pt = placePlug(t, e.target, center(s.box));
    let way: Point[] | undefined = waysOf().between(ps, pt, new Set<Node>([s, t]));
    if (!clear(way, s, t)) way = doWalk ? walkerOf().path(ps.point, s, pt.point, t) : undefined;
    if (!way || !clear(way, s, t)) {
      counts.kept++;
      continue;
    }
    counts.added++;
    changed.add(e.id);
    repaired.set(e.id, { edge: e.id, points: way });
  }
  // The routes keep the order of the result. A new route goes after them, in the order of the edges.
  const out: Route[] = [];
  const placed = new Set<string>();
  for (const r of result.routes) {
    const first = !placed.has(r.edge);
    placed.add(r.edge);
    out.push(first ? (repaired.get(r.edge) ?? r) : r);
  }
  for (const e of graph.edges) if (!placed.has(e.id) && repaired.has(e.id)) out.push(repaired.get(e.id)!);

  const final = new Map<string, Route>();
  for (const r of out) if (!final.has(r.edge)) final.set(r.edge, r);
  let runs: SharedRun[] | undefined;
  if (result.runs) {
    runs = [];
    for (const run of result.runs) {
      const edges = run.edges.filter((id) => {
        if (!changed.has(id)) return true;
        const r = final.get(id);
        const ok = r !== undefined && (holds(r.points, run.points) || holds(r.points, [...run.points].reverse()));
        if (!ok) counts.unbundled++;
        return ok;
      });
      if (edges.length === run.edges.length) runs.push(run);
      else if (edges.length >= 2) runs.push({ ...run, edges });
      else counts.unbundled += edges.length;
    }
  }
  let bundles: Bundle[] | undefined;
  if (result.bundles) {
    bundles = [];
    for (const b of result.bundles) {
      const edges = b.edges.filter((id) => {
        if (!changed.has(id)) return true;
        const r = final.get(id);
        const ok = r !== undefined && r.points.length >= b.trunk.length && b.trunk.every((q, i) => dist(q, r.points[i]!) <= TOLERANCE);
        if (!ok) counts.unbundled++;
        return ok;
      });
      if (edges.length === b.edges.length) bundles.push(b);
      else if (edges.length > 0) bundles.push({ ...b, edges });
    }
  }
  let levels: Level[] | undefined;
  if (result.levels) {
    levels = result.levels.map((level) => {
      const boxOf = new Map(level.items.map((it) => [it.id, it.box]));
      let touched = false;
      const links = level.links.map((l) => {
        const sb = boxOf.get(l.source);
        const tb = boxOf.get(l.target);
        const p = l.points;
        if (!sb || !tb || p.length < 2) return l;
        const a = onBoundary(p[0]!, sb) ? undefined : nearestOnBoundary(sb, p[0]!);
        const b = onBoundary(p[p.length - 1]!, tb) ? undefined : nearestOnBoundary(tb, p[p.length - 1]!);
        if (!a && !b) return l;
        touched = true;
        counts.linkEnds += (a ? 1 : 0) + (b ? 1 : 0);
        const points = [...p];
        if (a) points[0] = a;
        if (b) points[points.length - 1] = b;
        return { ...l, points };
      });
      return touched ? { ...level, links } : level;
    });
  }
  return {
    result: { ...result, routes: out, ...(runs ? { runs } : {}), ...(bundles ? { bundles } : {}), ...(levels ? { levels } : {}) },
    counts,
  };
}

/** This function gives a router that repairs the routes of `router` with `repairResult`. It keeps the name and the `maxNodes` of the router. */
export function withRepair(router: Router, options: RepairOptions = {}): Router {
  return { ...router, route: (graph: Graph): Result => repairResult(graph, router.route(graph), options).result };
}

/**
 * This function gives a router strategy that runs `strategy` and then the repair step (RULE-046) with `repair`.
 * The new strategy has the name `<name>+repair`, and the options and the schema of `strategy`. The strategy `strategy` does not change.
 */
export function repairStrategy<O extends object>(strategy: Strategy<"router", O>, repair: RepairOptions = {}): Strategy<"router", O> {
  return defineStrategy<"router", O>({
    step: "router",
    name: `${strategy.name}+repair`,
    describe: `${strategy.describe} Then one repair step fixes the breaks of the hard rules.`,
    defaults: { ...strategy.defaults } as O,
    ...(strategy.schema === undefined ? {} : { schema: strategy.schema }),
    ...(strategy.maxNodes === undefined ? {} : { maxNodes: strategy.maxNodes }),
    run: (graph: Graph, options: Readonly<O>): Result => repairResult(graph, strategy.run(graph, options), repair).result,
  });
}
