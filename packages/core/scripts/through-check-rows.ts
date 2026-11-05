/**
 * This module makes the rows of the record `through-check/5`, with no side effect (THROUGH-CHECK).
 * The script `through-check.ts` writes them, and the gate `through-check.test.ts` makes them again and compares them with the record.
 * It keeps the routers and the lanes out of `src/bench/measures/through-check.ts`, so the imports of that module stay types only.
 * Each family of `highwaysRegistry()` runs at its defaults, for each router of `SCORED`, `OUTSIDE` and `SITE_ROUTERS`.
 * The board `INNER_BOARDS` is one more family, because no family has inner routes at its defaults.
 * A row of `lanes` holds the routes of `laneRoutes`, with each shared segment open, at the lane settings of the site, so it shows what `keepThrough` copies.
 * The routers of `OUTSIDE` do not mark `through`, so the record keeps them in `unmarkedRows`, apart from `rows`.
 * The routers of `SITE_ROUTERS` and `REPORT_ROUTERS` are report rows, and so are the rows of `INNER_BOARDS` and of `lanes`.
 */
import { BUNDLE_COUNTER, measureHighways } from "../src/bench/curves.ts";
import { crossingPairs, splitPairs, type EdgeLine, type PairSplit } from "../src/bench/measures/crossing-pairs.ts";
import { measureQuality } from "../src/bench/quality.ts";
import { checkRoutes, deciding, falseThrough, flagged, HAIRLINE, THROUGH_CLASSES, type RouteCheck, type ThroughClass, type ThroughContact } from "../src/bench/measures/through-check.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { curveSpace, sampleCurve } from "../src/curves/index.ts";
import { highwayCurves } from "../src/curves/highway/index.ts";
import { polylineLength } from "../src/geom.ts";
import type { Graph, Result, Route } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";
import { laneRoutes, runKey, segmentsOf, type SegmentGraph } from "../src/segments.ts";

/** The command that writes the record again, from the repository root. */
export const REGENERATE = "node packages/core/scripts/through-check.ts packages/core/scripts/data/through-check/record.json";
export const SCORED = ["corners", "trunks", "shared", "sections"];
export const OUTSIDE = ["straight", "plugs"];
/** The routers with a report row on the families. `shared-all` has the most lanes in a bundle, so it shows the largest cost of the room. */
export const REPORT_ROUTERS = ["shared-all"];
/** The settings of the router of the site (`packages/site/src/examples.ts`). The ladder of plugs is on. */
const SITE_SETTINGS = { margin: 20, stretch: 3, cap: 6 };
const SITE = sectionsRouter({ name: "sections-site", ...SITE_SETTINGS });
/** The same settings with the steps of the margin off. No drawing of the site has this router. */
const SITE_NO_LADDER = sectionsRouter({ name: "sections-site-no-ladder", ...SITE_SETTINGS, outSteps: false });
const SITE_ROUTERS = [SITE, SITE_NO_LADDER];
/** The lane settings of the site. */
export const LANES = { width: 5, maxWidth: 30 };
/** The options of the measure of the painted curves, as in `benchHighways`. The curves use the defaults of `highwayCurves`. */
const PAINT = { radius: 12, minRadius: 4 };
/**
 * The tolerance of the samples of a painted curve, for the crossings of the whole board. Over the 75 boards of `sections`, tolerances from 0.005 to 0.1 move the crossing points by 0.6 %.
 * The same tolerances move the pairs of edges by 0.1 %, so a small change of points tells less than the same change of pairs.
 */
const PAINT_SAMPLE = 0.02;
export const INNER_BOARDS = [
  { name: "frame-rows+inner", family: "frame-rows", dims: { inner: 4 } },
  { name: "frame-rows+inner12", family: "frame-rows", dims: { inner: 12 } },
];

/** The seeds of each inner board. The inner routes are few, so these boards take more seeds than the families. */
export const INNER_SEEDS = 10;
const SAMPLE = 3;
const UNMARKED_NOTE = "The routers straight and plugs do not mark through. Their flagged counts are outside each claim on through, and rows does not hold them.";

export interface ClassRow {
  routes: number;
  sample: string[];
  leastDepth: number;
  mostDepth: number;
}

/** The crossings of the lanes of one board, with the room of each way and with no room. */
export interface SeedCrossings {
  seed: number;
  /** The count of `measureQuality` on the polylines, which keeps one copy of each drawn segment. */
  laneCrossings: number;
  fullCrossings: number;
  /** The crossing points and the pairs of edges of the polylines. */
  polyline: PairSplit;
  /** The crossing points and the pairs of edges of the painted `highway` curves, over the whole board. */
  painted: PairSplit;
  /** The counts of `measureHighways` on the painted curves: two lanes of one bundle that cross in its body, and at its ends. */
  bundleBody: number;
  bundleEnds: number;
  fullBundleBody: number;
  fullBundleEnds: number;
}

/** The counts of one view of one router on one family. */
export interface Row {
  readonly router: string;
  readonly family: string;
  readonly view: "routes" | "lanes";
  routes: number;
  marked: number;
  flagged: number;
  falseThrough: number;
  partFalse: number;
  unnamed: number;
  hairline: number;
  hairlineClear: number;
  skipsFrame: number;
  inner: number;
  innerMarked: number;
  innerFlagged: number;
  innerFalse: number;
  innerUnnamed: number;
  spikes: number;
  innerSpikes: number;
  innerBends: number;
  innerLength: number;
  crossings: number;
  /** The lanes that carry the field `outOfRoom`. Only a row of `lanes` has a value over 0. */
  outOfRoom: number;
  /** The lanes of class `deep` with no field `outOfRoom`. */
  deepUnmarked: number;
  /** The flagged lanes with no field `outOfRoom`, on an edge that its closed route does not flag. So the lanes make this contact, and no mark tells it. */
  silentLanes: number;
  /** The summed length and bends of the lanes, with the room of each way. */
  laneLength: number;
  laneBends: number;
  /** The same sums with no room, as the lanes were before LANE-ROOM. */
  fullLength: number;
  fullBends: number;
  /** The crossings of the board with these lanes, and with the same lanes with no room. Each way has its own width, so a lane can cross more near a join. */
  laneCrossings: number;
  fullCrossings: number;
  /** The same crossings by seed, with the distinct pairs of edges and the painted curves. */
  bySeed: SeedCrossings[];
  classes: Partial<Record<ThroughClass, ClassRow>>;
  innerClasses: Partial<Record<ThroughClass, ClassRow>>;
  unnamedClasses: Partial<Record<ThroughClass, ClassRow>>;
}

/** This function adds one contact to a table of classes. */
function addClass(table: Partial<Record<ThroughClass, ClassRow>>, id: string, top: ThroughContact): void {
  const row = (table[top.class] ??= { routes: 0, sample: [], leastDepth: top.depth, mostDepth: top.depth });
  row.routes++;
  row.leastDepth = Math.min(row.leastDepth, top.depth);
  row.mostDepth = Math.max(row.mostDepth, top.depth);
  if (row.sample.length < SAMPLE) row.sample.push(id);
}

/** This function adds the checks of one board to a row. */
function addChecks(row: Row, seed: number, checks: readonly RouteCheck[]): void {
  for (const c of checks) {
    const id = `${seed}:${c.edge}`;
    if (c.hairline) row.hairline++;
    if (c.hairline && c.contacts.length === 0 && !c.marked) row.hairlineClear++;
    if (c.skipsFrame) row.skipsFrame++;
    if (c.inner) {
      row.inner++;
      if (c.spikes > 0) row.innerSpikes++;
      if (c.marked) row.innerMarked++;
      if (flagged(c)) {
        row.innerFlagged++;
        addClass(row.innerClasses, id, deciding(c)!);
      }
      if (falseThrough(c)) row.innerFalse++;
      if (c.unnamed.length > 0) row.innerUnnamed++;
      continue;
    }
    row.routes++;
    if (c.spikes > 0) row.spikes++;
    if (c.marked) row.marked++;
    if (falseThrough(c)) row.falseThrough++;
    if (c.falseNames.length > 0) row.partFalse++;
    if (c.unnamed.length > 0) {
      row.unnamed++;
      addClass(row.unnamedClasses, id, c.contacts.find((x) => c.unnamed.includes(x.box))!);
    }
    if (flagged(c)) {
      row.flagged++;
      addClass(row.classes, id, deciding(c)!);
    }
  }
}

/** This function gives the routes of a result with each shared segment open. The copy of `through` is the one that a result in place of segments gets. */
export function laneView(result: Result): readonly Route[] {
  const graph = segmentsOf(result);
  const open = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  return laneRoutes(result, open, LANES.width, LANES.maxWidth);
}

/** This function gives the painted curves of a board as sampled lines, and the counts of its bundles. */
function painted(board: Graph, graph: SegmentGraph, open: ReadonlySet<string>): { readonly lines: EdgeLine[]; readonly body: number; readonly ends: number } {
  const space = curveSpace(board.nodes.map((n) => n.box));
  const curves = highwayCurves(graph, open, LANES.width, { maxWidth: LANES.maxWidth, space });
  const bundle = measureHighways(graph, open, LANES.width, curves, { maxWidth: LANES.maxWidth, minRadius: PAINT.minRadius, ends: PAINT.radius });
  return { lines: curves.map((c) => ({ edge: c.edge, points: sampleCurve(c.segments, PAINT_SAMPLE) })), body: bundle.crossings, ends: bundle.endCrossings };
}

/** This function adds the marks, the length and the bends of the lanes of one board to a row of `lanes`. */
function addLaneShape(row: Row, seed: number, board: Graph, result: Result, view: readonly Route[], checks: readonly RouteCheck[], closed: readonly RouteCheck[]): void {
  const out = new Set(view.filter((r) => r.outOfRoom).map((r) => r.edge));
  const closedFlags = new Set(closed.filter(flagged).map((c) => c.edge));
  row.outOfRoom += out.size;
  for (const c of checks) {
    if (!flagged(c) || out.has(c.edge)) continue;
    if (deciding(c)!.class === "deep") row.deepUnmarked++;
    if (!closedFlags.has(c.edge)) row.silentLanes++;
  }
  const graph = segmentsOf(result);
  const open = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  const noRoom = { ...graph, segments: graph.segments.map(({ room: _room, ...s }) => s) };
  const full = laneRoutes(noRoom, open, LANES.width, LANES.maxWidth);
  for (const r of view) {
    row.laneLength += polylineLength(r.points);
    row.laneBends += r.points.length - 2;
  }
  for (const r of full) {
    row.fullLength += polylineLength(r.points);
    row.fullBends += r.points.length - 2;
  }
  const laneCrossings = measureQuality(board, { ...result, routes: [...view] }).crossings;
  const fullCrossings = measureQuality(board, { ...result, routes: full }).crossings;
  const [paint, paintFull] = [painted(board, graph, open), painted(board, noRoom, open)];
  row.laneCrossings += laneCrossings;
  row.fullCrossings += fullCrossings;
  row.bySeed.push({
    seed,
    laneCrossings,
    fullCrossings,
    polyline: splitPairs(crossingPairs(view), crossingPairs(full)),
    painted: splitPairs(crossingPairs(paint.lines), crossingPairs(paintFull.lines)),
    bundleBody: paint.body,
    bundleEnds: paint.ends,
    fullBundleBody: paintFull.body,
    fullBundleEnds: paintFull.ends,
  });
  row.laneLength = Math.round(row.laneLength * 1000) / 1000;
  row.fullLength = Math.round(row.fullLength * 1000) / 1000;
}

/** This function adds the bends and the length of the inner routes of one board to a row, and the crossings of the whole board. */
function addInnerShape(row: Row, graph: Graph, result: Result): void {
  const inner = result.routes.filter((r) => r.frame !== undefined);
  if (inner.length === 0) return;
  row.crossings += measureQuality(graph, result).crossings;
  for (const r of inner) {
    row.innerBends += Math.max(0, r.points.length - 2);
    row.innerLength = Math.round((row.innerLength + polylineLength(r.points)) * 1000) / 1000;
  }
}

const blank = (router: string, family: string, view: Row["view"]): Row => ({
  router,
  family,
  view,
  routes: 0,
  marked: 0,
  flagged: 0,
  falseThrough: 0,
  partFalse: 0,
  unnamed: 0,
  hairline: 0,
  hairlineClear: 0,
  skipsFrame: 0,
  inner: 0,
  innerMarked: 0,
  innerFlagged: 0,
  innerFalse: 0,
  innerUnnamed: 0,
  spikes: 0,
  innerSpikes: 0,
  innerBends: 0,
  innerLength: 0,
  crossings: 0,
  outOfRoom: 0,
  deepUnmarked: 0,
  silentLanes: 0,
  laneLength: 0,
  laneBends: 0,
  fullLength: 0,
  fullBends: 0,
  laneCrossings: 0,
  fullCrossings: 0,
  bySeed: [],
  classes: {},
  innerClasses: {},
  unnamedClasses: {},
});

/** The choice of a part of the record. Each default is all. */
export interface ThroughScope {
  readonly routers?: readonly string[] | undefined;
  readonly families?: readonly string[] | undefined;
  /** This function gets one line for each router on each family. */
  readonly log?: (line: string) => void;
}

/** This function gives the record `through-check/5` over `seeds` seeds. The counts are deterministic, and it reads no time. */
export function throughRecord(seeds: number, scope: ThroughScope = {}) {
  const reg = highwaysRegistry();
  const wanted = [...(scope.routers ?? [...SCORED, ...SITE_ROUTERS.map((r) => r.name), ...REPORT_ROUTERS]), ...OUTSIDE];
  const families = scope.families ?? [...HIGHWAYS_FAMILIES.map((f) => f.name), ...INNER_BOARDS.map((b) => b.name)];
  const rows: Row[] = [];
  const unmarkedRows: Row[] = [];
  for (const family of families) {
    const graphs: Graph[] = [];
    const innerBoard = INNER_BOARDS.find((b) => b.name === family);
    const count = innerBoard ? INNER_SEEDS : seeds;
    for (let seed = 0; seed < count; seed++) graphs.push(innerBoard ? reg.generate(innerBoard.family, seed, innerBoard.dims).graph : reg.generate(family, seed).graph);
    for (const name of wanted) {
      if (innerBoard && REPORT_ROUTERS.includes(name)) continue;
      const router = SITE_ROUTERS.find((r) => r.name === name) ?? ROUTERS.find((r) => r.name === name)!;
      const row = blank(name, family, "routes");
      const lanes = blank(name, family, "lanes");
      // A lane route has no field `frame`, so the board of inner routes has no row of lanes.
      const hasLanes = !OUTSIDE.includes(name) && innerBoard === undefined;
      graphs.forEach((graph, seed) => {
        const result = router.route(graph);
        const closed = checkRoutes(graph, result.routes);
        addChecks(row, seed, closed);
        addInnerShape(row, graph, result);
        if (hasLanes) {
          const view = laneView(result);
          const checks = checkRoutes(graph, view);
          addChecks(lanes, seed, checks);
          addLaneShape(lanes, seed, graph, result, view, checks, closed);
        }
      });
      (OUTSIDE.includes(name) ? unmarkedRows : rows).push(row);
      if (hasLanes) rows.push(lanes);
      scope.log?.(JSON.stringify({ router: name, family, routes: row.routes, marked: row.marked, flagged: row.flagged, falseThrough: row.falseThrough, lanesFlagged: lanes.flagged, lanesFalse: lanes.falseThrough }));
    }
  }
  return {
    schema: "through-check/5",
    bundleCounter: BUNDLE_COUNTER,
    seeds,
    size: "default",
    classes: THROUGH_CLASSES,
    hairline: HAIRLINE,
    scored: SCORED,
    unmarked: OUTSIDE,
    unmarkedNote: UNMARKED_NOTE,
    site: SITE.name,
    siteNoLadder: SITE_NO_LADDER.name,
    innerBoards: INNER_BOARDS,
    innerSeeds: INNER_SEEDS,
    lanes: LANES,
    rows,
    unmarkedRows,
  };
}
