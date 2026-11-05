/**
 * This module makes the record `through-floor/1` (THROUGH-FLOOR). The record tells what the count `route.through` holds on the family `packed-grid`, and it reads the marked routes of `sections-site`.
 * Each row of a router splits its links by the test of `route.through` and by the touch of their end boxes. The router `seams` and the two walkers read 0, so the count is no floor of the board.
 * The seeds of `SEEN` were read before the partners of `route.through` were chosen. A claim rests only on the seeds of `FRESH`, so the record keeps the two parts apart.
 */
import { overlapOf } from "@mark1russell7/layout-contract";
import { measureRouteFaults } from "../src/bench/links.ts";
import { benchRun } from "../src/bench/run.ts";
import { dist, polylineLength, type Point } from "../src/geom.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { resolvePorts, splitFrames, type Graph, type Route, type Router } from "../src/model.ts";
import { ROUTERS, seamsRouter } from "../src/routers/index.ts";
import { CornerGraph } from "../src/visibility.ts";
import { OUT_STEPS, WayFinder } from "../src/ways.ts";
import { routerNamed } from "./control-wins-rows.ts";
import { SEEDS } from "./route-pairs-rows.ts";

/** The command that writes the record again. */
export const REGENERATE = "node packages/core/scripts/through-floor.ts packages/core/scripts/data/through-floor/record.json";
/** The version of the record. */
export const SCHEMA = "through-floor/1";
/** The only family where a real router reads `route.through` over a few routes. */
export const FAMILY = "packed-grid";
/** The routers of the rows. */
export const FLOOR_ROUTERS = ["straight", "corners", "shared", "shared-all", "sections", "sections-site", "seams", "border-walk", "border-walk-short"] as const;
/** The seeds that the record `control-wins/1` also reads. */
export const SEEN = { from: 0, to: SEEDS } as const;
/** The seeds that no earlier read saw. */
export const FRESH = { from: SEEDS, to: 24 } as const;
/** The seeds of the part of the record that the test reads again. */
export const SLICE = { from: 1, to: 2 } as const;
/** The margin of the router `sections-site`. */
const SITE_MARGIN = 20;
/** The number of visible neighbours of the plain way finder. */
const SITE_K = 8;

/** This function gives the router of a name of `FLOOR_ROUTERS`. */
function floorRouter(name: string): Router {
  if (name === "seams") return seamsRouter({ name });
  return ROUTERS.find((r) => r.name === name) ?? routerNamed(name);
}

/** This function tells if `route.through` counts one route. It calls the measure, so the record holds no second test. */
function isThrough(graph: Graph, route: Route): boolean {
  return measureRouteFaults(graph, { routes: [route] }).through > 0;
}

/** This function tells if the two end boxes of an edge touch or overlap. */
function endsTouch(graph: Graph, route: Route): boolean {
  const edge = graph.edges.find((e) => e.id === route.edge)!;
  const box = (id: string) => graph.nodes.find((n) => n.id === id)!.box;
  const { x, y } = overlapOf(box(edge.source.node), box(edge.target.node));
  return x >= 0 && y >= 0;
}

/** One router on the boards of a range of seeds. */
export interface FloorRow {
  readonly router: string;
  readonly links: number;
  /** The routes that `route.through` counts, and whose end boxes do not touch. */
  readonly hitAndApart: number;
  readonly hitAndTouch: number;
  readonly clearAndApart: number;
  readonly clearAndTouch: number;
  /** The routes with a bend that `route.through` counts. */
  readonly bentThrough: number;
  /** The routes that the router itself marks with the field `through`. */
  readonly flagged: number;
  /** The value `route.length`: the sum of the lengths of the routes. */
  readonly length: number;
}

/** This function gives one row for each router on the family, over a range of seeds. */
export function floorRows(seeds: { readonly from: number; readonly to: number }): FloorRow[] {
  const registry = highwaysRegistry();
  return FLOOR_ROUTERS.map((name) => {
    const router = floorRouter(name);
    const row = { router: name, links: 0, hitAndApart: 0, hitAndTouch: 0, clearAndApart: 0, clearAndTouch: 0, bentThrough: 0, flagged: 0, length: 0 };
    for (let seed = seeds.from; seed < seeds.to; seed++) {
      const board = registry.generate(FAMILY, seed).graph;
      for (const route of benchRun(router, FAMILY, board, 1).result.routes) {
        const hit = isThrough(board, route);
        const touch = endsTouch(board, route);
        row.links++;
        if (hit && !touch) row.hitAndApart++;
        if (hit && touch) row.hitAndTouch++;
        if (!hit && !touch) row.clearAndApart++;
        if (!hit && touch) row.clearAndTouch++;
        if (hit && route.points.length > 2) row.bentThrough++;
        if (route.through) row.flagged++;
        row.length += polylineLength(route.points);
      }
    }
    return row;
  });
}

/** The target of the family: the length that a real router pays for `route.through` 0, against the walkers. */
export interface FloorTarget {
  readonly seamsThrough: number;
  readonly seamsOverShort: number;
  readonly seamsOverWalk: number;
  readonly seamsOverCorners: number;
  readonly shortOverCorners: number;
}

/** This function gives the target from the rows of one range of seeds. */
export function floorTarget(rows: readonly FloorRow[]): FloorTarget {
  const of = (name: string): FloorRow => rows.find((r) => r.router === name)!;
  const seams = of("seams");
  return {
    seamsThrough: seams.hitAndApart + seams.hitAndTouch,
    seamsOverShort: seams.length / of("border-walk-short").length,
    seamsOverWalk: seams.length / of("border-walk").length,
    seamsOverCorners: seams.length / of("corners").length,
    shortOverCorners: of("border-walk-short").length / of("corners").length,
  };
}

/** The answer of each step of the ladder for the ends of one segment. */
export interface LadderStep {
  readonly step: number;
  readonly margin: number;
  readonly reaches: boolean;
}

/** One route of `sections-site` that goes through a box, and has a bend. */
export interface MarkedRoute {
  readonly family: string;
  readonly seed: number;
  readonly edge: string;
  readonly points: number;
  readonly through: readonly string[];
  /** The index of the first segment that goes through a box. */
  readonly segment: number;
  readonly segmentLength: number;
  /** This value is true when the segment starts or ends at a plug of the route. */
  readonly atPlug: boolean;
  /** This value is true when the segment has two free ends: then it is a piece between two hubs or a free point, and no plug limits its ends. */
  readonly betweenHubs: boolean;
  readonly ladder: readonly LadderStep[];
}

/** This function gives the answers of the ladder for two points, as the method `way` of `WayFinder` asks them for two free points. */
function ladderOf(graph: Graph, ways: WayFinder, from: Point, to: Point): LadderStep[] {
  return OUT_STEPS.map((scale, step) => {
    const margin = SITE_MARGIN * scale;
    const corners = step === 0 ? ways.corners : new CornerGraph(graph.nodes, ways.obstacles, { margin, k: SITE_K });
    return { step, margin, reaches: corners.path(from, to) !== undefined };
  });
}

/** The count of the routes of `sections-site` that `route.through` counts, on the seeds of `SEEN`, and the routes with a bend off the family. */
export interface MarkedRead {
  readonly counted: number;
  readonly onFamily: number;
  readonly onFamilyBent: number;
  readonly off: readonly MarkedRoute[];
}

/** This function reads the routes of `sections-site` that go through a box, over the families and the seeds of `SEEN`. */
export function markedRead(): MarkedRead {
  const registry = highwaysRegistry();
  const router = routerNamed("sections-site");
  const off: MarkedRoute[] = [];
  let [counted, onFamily, onFamilyBent] = [0, 0, 0];
  for (const family of HIGHWAYS_FAMILIES) {
    for (let seed = SEEN.from; seed < SEEN.to; seed++) {
      const board = registry.generate(family.name, seed).graph;
      const routes = benchRun(router, family.name, board, 1).result.routes.filter((route) => isThrough(board, route));
      counted += routes.length;
      if (family.name === FAMILY) {
        onFamily += routes.length;
        onFamilyBent += routes.filter((route) => route.points.length > 2).length;
        continue;
      }
      const { graph } = splitFrames(resolvePorts(board));
      const ways = new WayFinder(graph.nodes, { margin: SITE_MARGIN, k: SITE_K });
      for (const route of routes) {
        const p = route.points;
        const segment = p.findIndex((_, i) => i > 0 && isThrough(board, { edge: route.edge, points: [p[i - 1]!, p[i]!] }));
        const [a, b] = [p[segment - 1]!, p[segment]!];
        const atPlug = segment === 1 || segment === p.length - 1;
        off.push({
          family: family.name,
          seed,
          edge: route.edge,
          points: p.length,
          through: route.through ?? [],
          segment,
          segmentLength: dist(a, b),
          atPlug,
          betweenHubs: !atPlug,
          ladder: ladderOf(graph, ways, a, b),
        });
      }
    }
  }
  return { counted, onFamily, onFamilyBent, off };
}

/** This function gives the record. */
export function floorRecord() {
  const seen = floorRows(SEEN);
  const fresh = floorRows(FRESH);
  return {
    schema: SCHEMA,
    regenerate: REGENERATE,
    family: FAMILY,
    seen: { seeds: SEEN, rows: seen, target: floorTarget(seen) },
    fresh: { seeds: FRESH, rows: fresh, target: floorTarget(fresh) },
    marked: markedRead(),
    slice: floorRows(SLICE),
  };
}
