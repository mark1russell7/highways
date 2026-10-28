// The settings of the gap screen of RESCREEN-M3A: each built highway strategy and each option of waves 1 to 3, on the boards `tiny-uniform`.
// The exact reference of W3B (run 40602860476) gives the optimum B1 of these boards at the stretch caps 1.1, 1.25 and 1.5.
// Each strategy here is a router. For each board, it writes one line to stderr: its B1, its max B3 stretch and its mixed flag.
// The flag is 1 when a shared segment holds edges of two collections. The screen gives no max of B3, so the line gives it.
// Start: `pnpm screen --step router --module scripts/screens/rescreen-m3a-gap.ts --families tiny-uniform`.
import { inkSaved } from "../../src/bench/measures/bundles.ts";
import { polylineLength } from "../../src/geom.ts";
import { highwayRouter } from "../../src/highways/router.ts";
import { sharedWaysPlan } from "../../src/highways/shared-ways/index.ts";
import type { Graph, Result, Router } from "../../src/model.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { highwayStrategies, STRATEGIES } from "../../src/strategies/builtins.ts";
import { asRouter, defineStrategy, getStrategy, type Strategy } from "../../src/strategies/model.ts";
import * as w1b from "./build-w1b.ts";
import * as w1c from "./build-w1c.ts";
import * as w2a from "./build-w2a.ts";
import * as w2b from "./build-w2b.ts";
import * as w2c from "./build-w2c.ts";
import * as w3a from "./build-w3a.ts";
import * as w3b from "./build-w3b.ts";
import * as w3bRouter from "./build-w3b-router.ts";
import * as w3c from "./build-w3c.ts";
import * as w3e from "./build-w3e.ts";

const corners = asRouter(getStrategy(STRATEGIES, "router", "corners"));
const base = new WeakMap<Graph, Map<string, number>>();
const logged = new Set<string>();

/** This function gives the key of a board: its node count, its edge count and the place of its first node. */
function boardOf(graph: Graph): string {
  return `${graph.nodes.length}/${graph.edges.length}/${graph.nodes[0]?.box.x ?? ""},${graph.nodes[0]?.box.y ?? ""}`;
}

/** This function gives the length of the route of `corners` for each edge of a graph. */
function baseLengths(graph: Graph): Map<string, number> {
  let m = base.get(graph);
  if (!m) {
    m = new Map(corners.route(graph).routes.map((r) => [r.edge, polylineLength(r.points)]));
    base.set(graph, m);
  }
  return m;
}

/** This function writes the line of a result to stderr, one time for each strategy and board, and gives the result. */
function report(name: string, graph: Graph, result: Result): Result {
  const board = boardOf(graph);
  if (logged.has(`${name} ${board}`)) return result;
  logged.add(`${name} ${board}`);
  const lengths = baseLengths(graph);
  let max = 1;
  for (const r of result.routes) {
    const b = lengths.get(r.edge);
    if (b === undefined || b <= 1 || r.points.length < 2) continue;
    max = Math.max(max, polylineLength(r.points) / b);
  }
  const key = new Map(graph.edges.map((e) => [e.id, byCollection(e) ?? `#${e.id}`]));
  const shared = [...(result.runs ?? []).map((r) => r.edges), ...(result.bundles ?? []).map((b) => b.edges)];
  const mixed = shared.some((edges) => new Set(edges.map((e) => key.get(e))).size > 1);
  process.stderr.write(`GAP ${name} board=${board} B1=${inkSaved(result.routes)} max=${max} mixed=${mixed ? 1 : 0}\n`);
  return result;
}

/** This function gives a router strategy with the name `name` that routes with `router` and writes its line. */
function loggingRouter(name: string, describe: string, router: Router): Strategy<"router", object> {
  return defineStrategy({ step: "router", name, describe, defaults: {}, schema: {}, maxNodes: 10_000, run: (graph: Graph) => report(name, graph, router.route(graph)) });
}

/** This function gives a highway or router strategy as a router strategy that writes its line. It gives `undefined` for another value. */
function wrap(value: unknown, name?: string): Strategy<"router", object> | undefined {
  const s = value as { step?: string; name?: unknown; describe?: string; run?: unknown };
  if (typeof s !== "object" || s === null || typeof s.run !== "function" || typeof s.name !== "string") return undefined;
  if (s.step === "highway") return loggingRouter(name ?? s.name, s.describe ?? "", highwayRouter(value as Strategy<"highway", object>));
  if (s.step === "router") return loggingRouter(name ?? s.name, s.describe ?? "", asRouter(value as Strategy<"router", object>));
  return undefined;
}

// The baselines: `shared-ways-all` for the rule `all` (as in W3B), and the routers `shared` and `shared-all`.
export const sharedWaysAll = loggingRouter("shared-ways-all", "The router `shared-all` as a plan.", highwayRouter(defineStrategy({ step: "highway", name: "shared-ways-all", describe: "", defaults: {}, schema: {}, run: (input) => sharedWaysPlan(input, {}) })));
export const gapShared = wrap(getStrategy(STRATEGIES, "router", "shared"), "gap-shared");
export const gapSharedAll = wrap(getStrategy(STRATEGIES, "router", "shared-all"), "gap-shared-all");

// Each built-in highway strategy, with its defaults. The name has the prefix `hw:`, because the screen refuses the name of a built-in.
export const hwKeys = wrap(highwayStrategies["keys"], "hw:keys");
export const hwSharedWays = wrap(highwayStrategies["shared-ways"], "hw:shared-ways");
export const hwCorridors = wrap(highwayStrategies["corridors"], "hw:corridors");
export const hwMeet = wrap(highwayStrategies["meet"], "hw:meet");
export const hwWeiszfeld = wrap(highwayStrategies["weiszfeld"], "hw:weiszfeld");
export const hwStubs = wrap(highwayStrategies["stubs"], "hw:stubs");
export const hwZipper = wrap(highwayStrategies["zipper"], "hw:zipper");
export const hwLevelLinks = wrap(highwayStrategies["level-links"], "hw:level-links");
export const hwQuickbundles = wrap(highwayStrategies["quickbundles"], "hw:quickbundles");
export const hwRoadClasses = wrap(highwayStrategies["road-classes"], "hw:road-classes");
export const hwFlowField = wrap(highwayStrategies["flow-field"], "hw:flow-field");
export const hwWspd = wrap(highwayStrategies["wspd"], "hw:wspd");
export const hwOdCells = wrap(highwayStrategies["od-cells"], "hw:od-cells");
export const hwSelect = wrap(highwayStrategies["select"], "hw:select");
export const hwMingle = wrap(highwayStrategies["mingle"], "hw:mingle");
export const hwSpiral = wrap(highwayStrategies["spiral"], "hw:spiral");
export const hwFlowClusters = wrap(highwayStrategies["flow-clusters"], "hw:flow-clusters");
export const hwTraclus = wrap(highwayStrategies["traclus"], "hw:traclus");
export const hwDiffusion = wrap(highwayStrategies["diffusion"], "hw:diffusion");
export const hwNested = wrap(highwayStrategies["nested"], "hw:nested");
export const hwLanes = wrap(highwayStrategies["lanes"], "hw:lanes");
export const hwGrowth = wrap(highwayStrategies["growth"], "hw:growth");
export const hwEdgePaths = wrap(highwayStrategies["edge-paths"], "hw:edge-paths");
export const hwSoftKeys = wrap(highwayStrategies["soft-keys"], "hw:soft-keys");
export const hwHough = wrap(highwayStrategies["hough"], "hw:hough");
export const hwRidges = wrap(highwayStrategies["ridges"], "hw:ridges");
export const hwHdbscan = wrap(highwayStrategies["hdbscan"], "hw:hdbscan");
export const hwHubArcs = wrap(highwayStrategies["hub-arcs"], "hw:hub-arcs");
export const hwMlseb = wrap(highwayStrategies["mlseb"], "hw:mlseb");
export const hwSbeb = wrap(highwayStrategies["sbeb"], "hw:sbeb");
export const hwAreas = wrap(highwayStrategies["areas"], "hw:areas");
export const hwConfluent = wrap(highwayStrategies["confluent"], "hw:confluent");
export const hwPower = wrap(highwayStrategies["power"], "hw:power");
export const hwCrossbars = wrap(highwayStrategies["crossbars"], "hw:crossbars");
export const hwFrechet = wrap(highwayStrategies["frechet"], "hw:frechet");
export const hwCorridorsBreakeven = wrap(highwayStrategies["corridors+breakeven"], "hw:corridors+breakeven");
export const hwCorridorsStretch = wrap(highwayStrategies["corridors+stretch"], "hw:corridors+stretch");
export const hwCorridorsAmbiguity = wrap(highwayStrategies["corridors+ambiguity"], "hw:corridors+ambiguity");
export const hwCorridorsHysteresis = wrap(highwayStrategies["corridors+hysteresis"], "hw:corridors+hysteresis");
export const hwCorridorsIds = wrap(highwayStrategies["corridors+ids"], "hw:corridors+ids");

// Each option of waves 1 to 3. The name has the prefix of its wave, because two waves use the name `quickbundles-t6`.
export const w1bCornersSide = wrap(w1b.cornersSide, `w1b:${(w1b.cornersSide as { name: string }).name}`);
export const w1bCornersGap6 = wrap(w1b.cornersGap6, `w1b:${(w1b.cornersGap6 as { name: string }).name}`);
export const w1bCornersGap8 = wrap(w1b.cornersGap8, `w1b:${(w1b.cornersGap8 as { name: string }).name}`);
export const w1bCornersSideGap6 = wrap(w1b.cornersSideGap6, `w1b:${(w1b.cornersSideGap6 as { name: string }).name}`);
export const w1bCornersSideBend0 = wrap(w1b.cornersSideBend0, `w1b:${(w1b.cornersSideBend0 as { name: string }).name}`);
export const w1bCornersSideBend4 = wrap(w1b.cornersSideBend4, `w1b:${(w1b.cornersSideBend4 as { name: string }).name}`);
export const w1bCornersSideMost32 = wrap(w1b.cornersSideMost32, `w1b:${(w1b.cornersSideMost32 as { name: string }).name}`);
export const w1cSharedFlow05 = wrap(w1c.sharedFlow05, `w1c:${(w1c.sharedFlow05 as { name: string }).name}`);
export const w1cSharedFlow06 = wrap(w1c.sharedFlow06, `w1c:${(w1c.sharedFlow06 as { name: string }).name}`);
export const w1cSharedFlow07 = wrap(w1c.sharedFlow07, `w1c:${(w1c.sharedFlow07 as { name: string }).name}`);
export const w1cSharedFlow08 = wrap(w1c.sharedFlow08, `w1c:${(w1c.sharedFlow08 as { name: string }).name}`);
export const w1cSharedAllFlow05 = wrap(w1c.sharedAllFlow05, `w1c:${(w1c.sharedAllFlow05 as { name: string }).name}`);
export const w1cSharedAllFlow06 = wrap(w1c.sharedAllFlow06, `w1c:${(w1c.sharedAllFlow06 as { name: string }).name}`);
export const w1cSharedAllFlow07 = wrap(w1c.sharedAllFlow07, `w1c:${(w1c.sharedAllFlow07 as { name: string }).name}`);
export const w1cSharedAllFlow08 = wrap(w1c.sharedAllFlow08, `w1c:${(w1c.sharedAllFlow08 as { name: string }).name}`);
export const w1cSharedPasses3 = wrap(w1c.sharedPasses3, `w1c:${(w1c.sharedPasses3 as { name: string }).name}`);
export const w1cSharedAllPasses3 = wrap(w1c.sharedAllPasses3, `w1c:${(w1c.sharedAllPasses3 as { name: string }).name}`);
export const w1cSharedFlow06Passes3 = wrap(w1c.sharedFlow06Passes3, `w1c:${(w1c.sharedFlow06Passes3 as { name: string }).name}`);
export const w1cSharedAllFlow06Passes3 = wrap(w1c.sharedAllFlow06Passes3, `w1c:${(w1c.sharedAllFlow06Passes3 as { name: string }).name}`);
export const w1cSharedInput = wrap(w1c.sharedInput, `w1c:${(w1c.sharedInput as { name: string }).name}`);
export const w1cSharedLoad = wrap(w1c.sharedLoad, `w1c:${(w1c.sharedLoad as { name: string }).name}`);
export const w1cSharedShortest = wrap(w1c.sharedShortest, `w1c:${(w1c.sharedShortest as { name: string }).name}`);
export const w1cSharedAllInput = wrap(w1c.sharedAllInput, `w1c:${(w1c.sharedAllInput as { name: string }).name}`);
export const w1cSharedAllLoad = wrap(w1c.sharedAllLoad, `w1c:${(w1c.sharedAllLoad as { name: string }).name}`);
export const w1cSharedAllShortest = wrap(w1c.sharedAllShortest, `w1c:${(w1c.sharedAllShortest as { name: string }).name}`);
export const w1cSharedSnell = wrap(w1c.sharedSnell, `w1c:${(w1c.sharedSnell as { name: string }).name}`);
export const w1cSharedAllSnell = wrap(w1c.sharedAllSnell, `w1c:${(w1c.sharedAllSnell as { name: string }).name}`);
export const w1cSharedFlow06Snell = wrap(w1c.sharedFlow06Snell, `w1c:${(w1c.sharedFlow06Snell as { name: string }).name}`);
export const w1cSharedAllFlow06Snell = wrap(w1c.sharedAllFlow06Snell, `w1c:${(w1c.sharedAllFlow06Snell as { name: string }).name}`);
export const w1cTrunksGilbert03 = wrap(w1c.trunksGilbert03, `w1c:${(w1c.trunksGilbert03 as { name: string }).name}`);
export const w1cTrunksGilbert05 = wrap(w1c.trunksGilbert05, `w1c:${(w1c.trunksGilbert05 as { name: string }).name}`);
export const w1cTrunksGilbert07 = wrap(w1c.trunksGilbert07, `w1c:${(w1c.trunksGilbert07 as { name: string }).name}`);
export const w1cTrunksTree02 = wrap(w1c.trunksTree02, `w1c:${(w1c.trunksTree02 as { name: string }).name}`);
export const w1cTrunksTree04 = wrap(w1c.trunksTree04, `w1c:${(w1c.trunksTree04 as { name: string }).name}`);
export const w1cTrunksTree06 = wrap(w1c.trunksTree06, `w1c:${(w1c.trunksTree06 as { name: string }).name}`);
export const w1cTrunksTree08 = wrap(w1c.trunksTree08, `w1c:${(w1c.trunksTree08 as { name: string }).name}`);
export const w2aCorridorsBreakEven0 = wrap(w2a.corridorsBreakEven0, `w2a:${(w2a.corridorsBreakEven0 as { name: string }).name}`);
export const w2aSharedWaysBreakEven = wrap(w2a.sharedWaysBreakEven, `w2a:${(w2a.sharedWaysBreakEven as { name: string }).name}`);
export const w2aSharedWaysBreakEven0 = wrap(w2a.sharedWaysBreakEven0, `w2a:${(w2a.sharedWaysBreakEven0 as { name: string }).name}`);
export const w2aCorridorsStretch11 = wrap(w2a.corridorsStretch11, `w2a:${(w2a.corridorsStretch11 as { name: string }).name}`);
export const w2aCorridorsStretch15 = wrap(w2a.corridorsStretch15, `w2a:${(w2a.corridorsStretch15 as { name: string }).name}`);
export const w2aSharedWaysStretch = wrap(w2a.sharedWaysStretch, `w2a:${(w2a.sharedWaysStretch as { name: string }).name}`);
export const w2aCorridorsAmbiguityAny = wrap(w2a.corridorsAmbiguityAny, `w2a:${(w2a.corridorsAmbiguityAny as { name: string }).name}`);
export const w2aCorridorsAmbiguity03 = wrap(w2a.corridorsAmbiguity03, `w2a:${(w2a.corridorsAmbiguity03 as { name: string }).name}`);
export const w2aSharedWaysAmbiguity = wrap(w2a.sharedWaysAmbiguity, `w2a:${(w2a.sharedWaysAmbiguity as { name: string }).name}`);
export const w2aCorridorsMin3 = wrap(w2a.corridorsMin3, `w2a:${(w2a.corridorsMin3 as { name: string }).name}`);
export const w2aCorridorsHysteresis42 = wrap(w2a.corridorsHysteresis42, `w2a:${(w2a.corridorsHysteresis42 as { name: string }).name}`);
export const w2aSharedWaysHysteresis = wrap(w2a.sharedWaysHysteresis, `w2a:${(w2a.sharedWaysHysteresis as { name: string }).name}`);
export const w2aSharedWaysIds = wrap(w2a.sharedWaysIds, `w2a:${(w2a.sharedWaysIds as { name: string }).name}`);
export const w2aCorridorsStretchBreakEven = wrap(w2a.corridorsStretchBreakEven, `w2a:${(w2a.corridorsStretchBreakEven as { name: string }).name}`);
export const w2bMeetCorridors = wrap(w2b.meetCorridors, `w2b:${(w2b.meetCorridors as { name: string }).name}`);
export const w2bMeetNear4 = wrap(w2b.meetNear4, `w2b:${(w2b.meetNear4 as { name: string }).name}`);
export const w2bMeetNear16 = wrap(w2b.meetNear16, `w2b:${(w2b.meetNear16 as { name: string }).name}`);
export const w2bWeiszfeldCorridors = wrap(w2b.weiszfeldCorridors, `w2b:${(w2b.weiszfeldCorridors as { name: string }).name}`);
export const w2bWeiszfeldAlpha0 = wrap(w2b.weiszfeldAlpha0, `w2b:${(w2b.weiszfeldAlpha0 as { name: string }).name}`);
export const w2bWeiszfeldAlpha1 = wrap(w2b.weiszfeldAlpha1, `w2b:${(w2b.weiszfeldAlpha1 as { name: string }).name}`);
export const w2bStubsCorridors = wrap(w2b.stubsCorridors, `w2b:${(w2b.stubsCorridors as { name: string }).name}`);
export const w2bStubsNone = wrap(w2b.stubsNone, `w2b:${(w2b.stubsNone as { name: string }).name}`);
export const w2bStubsSource = wrap(w2b.stubsSource, `w2b:${(w2b.stubsSource as { name: string }).name}`);
export const w2bStubsOmega15 = wrap(w2b.stubsOmega15, `w2b:${(w2b.stubsOmega15 as { name: string }).name}`);
export const w2bZipperCorridors = wrap(w2b.zipperCorridors, `w2b:${(w2b.zipperCorridors as { name: string }).name}`);
export const w2bZipperNone = wrap(w2b.zipperNone, `w2b:${(w2b.zipperNone as { name: string }).name}`);
export const w2bZipperAdhesion1 = wrap(w2b.zipperAdhesion1, `w2b:${(w2b.zipperAdhesion1 as { name: string }).name}`);
export const w2bZipperNear2 = wrap(w2b.zipperNear2, `w2b:${(w2b.zipperNear2 as { name: string }).name}`);
export const w2bZipperPasses2 = wrap(w2b.zipperPasses2, `w2b:${(w2b.zipperPasses2 as { name: string }).name}`);
export const w2bLevelsCorridors = wrap(w2b.levelsCorridors, `w2b:${(w2b.levelsCorridors as { name: string }).name}`);
export const w2bLevelsNone = wrap(w2b.levelsNone, `w2b:${(w2b.levelsNone as { name: string }).name}`);
export const w2bLevelsDepth2 = wrap(w2b.levelsDepth2, `w2b:${(w2b.levelsDepth2 as { name: string }).name}`);
export const w2cQuickbundlesStretch = wrap(w2c.quickbundlesStretch, `w2c:${(w2c.quickbundlesStretch as { name: string }).name}`);
export const w2cRoadClassesStretch = wrap(w2c.roadClassesStretch, `w2c:${(w2c.roadClassesStretch as { name: string }).name}`);
export const w2cFlowFieldStretch = wrap(w2c.flowFieldStretch, `w2c:${(w2c.flowFieldStretch as { name: string }).name}`);
export const w2cWspdStretch = wrap(w2c.wspdStretch, `w2c:${(w2c.wspdStretch as { name: string }).name}`);
export const w2cOdCellsStretch = wrap(w2c.odCellsStretch, `w2c:${(w2c.odCellsStretch as { name: string }).name}`);
export const w2cSelectStretch = wrap(w2c.selectStretch, `w2c:${(w2c.selectStretch as { name: string }).name}`);
export const w2cZipperStretch = wrap(w2c.zipperStretch, `w2c:${(w2c.zipperStretch as { name: string }).name}`);
export const w2cZipperStretch115 = wrap(w2c.zipperStretch115, `w2c:${(w2c.zipperStretch115 as { name: string }).name}`);
export const w2cZipperStretch11 = wrap(w2c.zipperStretch11, `w2c:${(w2c.zipperStretch11 as { name: string }).name}`);
export const w2cLevelLinksStretch = wrap(w2c.levelLinksStretch, `w2c:${(w2c.levelLinksStretch as { name: string }).name}`);
export const w2cLevelLinksStretch11 = wrap(w2c.levelLinksStretch11, `w2c:${(w2c.levelLinksStretch11 as { name: string }).name}`);
export const w2cQuickTrunk = wrap(w2c.quickTrunk, `w2c:${(w2c.quickTrunk as { name: string }).name}`);
export const w2cQuickLines = wrap(w2c.quickLines, `w2c:${(w2c.quickLines as { name: string }).name}`);
export const w2cQuickTheta15 = wrap(w2c.quickTheta15, `w2c:${(w2c.quickTheta15 as { name: string }).name}`);
export const w2cQuickTheta6 = wrap(w2c.quickTheta6, `w2c:${(w2c.quickTheta6 as { name: string }).name}`);
export const w2cRoadsQ08 = wrap(w2c.roadsQ08, `w2c:${(w2c.roadsQ08 as { name: string }).name}`);
export const w2cRoadsDiscount03 = wrap(w2c.roadsDiscount03, `w2c:${(w2c.roadsDiscount03 as { name: string }).name}`);
export const w2cFieldSource = wrap(w2c.fieldSource, `w2c:${(w2c.fieldSource as { name: string }).name}`);
export const w2cWspdShared = wrap(w2c.wspdShared, `w2c:${(w2c.wspdShared as { name: string }).name}`);
export const w2cWspdS1 = wrap(w2c.wspdS1, `w2c:${(w2c.wspdS1 as { name: string }).name}`);
export const w2cWspdS4 = wrap(w2c.wspdS4, `w2c:${(w2c.wspdS4 as { name: string }).name}`);
export const w2cCellsLevel1 = wrap(w2c.cellsLevel1, `w2c:${(w2c.cellsLevel1 as { name: string }).name}`);
export const w2cCellsLevel3 = wrap(w2c.cellsLevel3, `w2c:${(w2c.cellsLevel3 as { name: string }).name}`);
export const w2cCellsShared = wrap(w2c.cellsShared, `w2c:${(w2c.cellsShared as { name: string }).name}`);
export const w2cSelectLambda05 = wrap(w2c.selectLambda05, `w2c:${(w2c.selectLambda05 as { name: string }).name}`);
export const w2cSelectLambda2 = wrap(w2c.selectLambda2, `w2c:${(w2c.selectLambda2 as { name: string }).name}`);
export const w2cSelectAll = wrap(w2c.selectAll, `w2c:${(w2c.selectAll as { name: string }).name}`);
export const w3aMingleStretch = wrap(w3a.mingleStretch, `w3a:${(w3a.mingleStretch as { name: string }).name}`);
export const w3aSpiralStretch = wrap(w3a.spiralStretch, `w3a:${(w3a.spiralStretch as { name: string }).name}`);
export const w3aFlowClustersStretch = wrap(w3a.flowClustersStretch, `w3a:${(w3a.flowClustersStretch as { name: string }).name}`);
export const w3aTraclusStretch = wrap(w3a.traclusStretch, `w3a:${(w3a.traclusStretch as { name: string }).name}`);
export const w3aDiffusionStretch = wrap(w3a.diffusionStretch, `w3a:${(w3a.diffusionStretch as { name: string }).name}`);
export const w3aMingleShared = wrap(w3a.mingleShared, `w3a:${(w3a.mingleShared as { name: string }).name}`);
export const w3aMingleTurn25 = wrap(w3a.mingleTurn25, `w3a:${(w3a.mingleTurn25 as { name: string }).name}`);
export const w3aMingleTurn60 = wrap(w3a.mingleTurn60, `w3a:${(w3a.mingleTurn60 as { name: string }).name}`);
export const w3aMingleLevels2 = wrap(w3a.mingleLevels2, `w3a:${(w3a.mingleLevels2 as { name: string }).name}`);
export const w3aSpiralAlpha15 = wrap(w3a.spiralAlpha15, `w3a:${(w3a.spiralAlpha15 as { name: string }).name}`);
export const w3aSpiralAlpha35 = wrap(w3a.spiralAlpha35, `w3a:${(w3a.spiralAlpha35 as { name: string }).name}`);
export const w3aSpiralTargets3 = wrap(w3a.spiralTargets3, `w3a:${(w3a.spiralTargets3 as { name: string }).name}`);
export const w3aFlowsShared = wrap(w3a.flowsShared, `w3a:${(w3a.flowsShared as { name: string }).name}`);
export const w3aFlowsTau015 = wrap(w3a.flowsTau015, `w3a:${(w3a.flowsTau015 as { name: string }).name}`);
export const w3aFlowsTau05 = wrap(w3a.flowsTau05, `w3a:${(w3a.flowsTau05 as { name: string }).name}`);
export const w3aFlowsComplete = wrap(w3a.flowsComplete, `w3a:${(w3a.flowsComplete as { name: string }).name}`);
export const w3aTraclusEps1 = wrap(w3a.traclusEps1, `w3a:${(w3a.traclusEps1 as { name: string }).name}`);
export const w3aTraclusEps4 = wrap(w3a.traclusEps4, `w3a:${(w3a.traclusEps4 as { name: string }).name}`);
export const w3aTraclusMin2 = wrap(w3a.traclusMin2, `w3a:${(w3a.traclusMin2 as { name: string }).name}`);
export const w3aDiffusionLambda3 = wrap(w3a.diffusionLambda3, `w3a:${(w3a.diffusionLambda3 as { name: string }).name}`);
export const w3aDiffusionWide = wrap(w3a.diffusionWide, `w3a:${(w3a.diffusionWide as { name: string }).name}`);
export const w3aDiffusionGamma2 = wrap(w3a.diffusionGamma2, `w3a:${(w3a.diffusionGamma2 as { name: string }).name}`);
export const w3bNestedL0 = wrap(w3b.nestedL0, `w3b:${(w3b.nestedL0 as { name: string }).name}`);
export const w3bNestedL1 = wrap(w3b.nestedL1, `w3b:${(w3b.nestedL1 as { name: string }).name}`);
export const w3bNestedL2 = wrap(w3b.nestedL2, `w3b:${(w3b.nestedL2 as { name: string }).name}`);
export const w3bFlatT6 = wrap(w3b.flatT6, `w3b:${(w3b.flatT6 as { name: string }).name}`);
export const w3bFlatT12 = wrap(w3b.flatT12, `w3b:${(w3b.flatT12 as { name: string }).name}`);
export const w3bLanesShared = wrap(w3b.lanesShared, `w3b:${(w3b.lanesShared as { name: string }).name}`);
export const w3bLanesCorridors = wrap(w3b.lanesCorridors, `w3b:${(w3b.lanesCorridors as { name: string }).name}`);
export const w3bLanesW16 = wrap(w3b.lanesW16, `w3b:${(w3b.lanesW16 as { name: string }).name}`);
export const w3bGrowthS03 = wrap(w3b.growthS03, `w3b:${(w3b.growthS03 as { name: string }).name}`);
export const w3bGrowthS07 = wrap(w3b.growthS07, `w3b:${(w3b.growthS07 as { name: string }).name}`);
export const w3bGrowthT12 = wrap(w3b.growthT12, `w3b:${(w3b.growthT12 as { name: string }).name}`);
export const w3bGrowthInput = wrap(w3b.growthInput, `w3b:${(w3b.growthInput as { name: string }).name}`);
export const w3bRouterSharedP2 = wrap(w3bRouter.sharedP2, `w3bRouter:${(w3bRouter.sharedP2 as { name: string }).name}`);
export const w3bRouterWindP2R05 = wrap(w3bRouter.windP2R05, `w3bRouter:${(w3bRouter.windP2R05 as { name: string }).name}`);
export const w3bRouterWindP2R1 = wrap(w3bRouter.windP2R1, `w3bRouter:${(w3bRouter.windP2R1 as { name: string }).name}`);
export const w3bRouterWindP2R2 = wrap(w3bRouter.windP2R2, `w3bRouter:${(w3bRouter.windP2R2 as { name: string }).name}`);
export const w3bRouterWindP3R1 = wrap(w3bRouter.windP3R1, `w3bRouter:${(w3bRouter.windP3R1 as { name: string }).name}`);
export const w3bRouterWindP2R1E2 = wrap(w3bRouter.windP2R1E2, `w3bRouter:${(w3bRouter.windP2R1E2 as { name: string }).name}`);
export const w3bRouterWindAllP2R1 = wrap(w3bRouter.windAllP2R1, `w3bRouter:${(w3bRouter.windAllP2R1 as { name: string }).name}`);
export const w3bRouterCap1 = wrap(w3bRouter.cap1, `w3bRouter:${(w3bRouter.cap1 as { name: string }).name}`);
export const w3bRouterCap3 = wrap(w3bRouter.cap3, `w3bRouter:${(w3bRouter.cap3 as { name: string }).name}`);
export const w3bRouterCap1Run = wrap(w3bRouter.cap1Run, `w3bRouter:${(w3bRouter.cap1Run as { name: string }).name}`);
export const w3bRouterCap1W6 = wrap(w3bRouter.cap1W6, `w3bRouter:${(w3bRouter.cap1W6 as { name: string }).name}`);
export const w3bRouterCapAll1 = wrap(w3bRouter.capAll1, `w3bRouter:${(w3bRouter.capAll1 as { name: string }).name}`);
export const w3cEdgePathsStretch = wrap(w3c.edgePathsStretch, `w3c:${(w3c.edgePathsStretch as { name: string }).name}`);
export const w3cSoftKeysStretch = wrap(w3c.softKeysStretch, `w3c:${(w3c.softKeysStretch as { name: string }).name}`);
export const w3cHoughStretch = wrap(w3c.houghStretch, `w3c:${(w3c.houghStretch as { name: string }).name}`);
export const w3cRidgesStretch = wrap(w3c.ridgesStretch, `w3c:${(w3c.ridgesStretch as { name: string }).name}`);
export const w3cHdbscanStretch = wrap(w3c.hdbscanStretch, `w3c:${(w3c.hdbscanStretch as { name: string }).name}`);
export const w3cHubArcsStretch = wrap(w3c.hubArcsStretch, `w3c:${(w3c.hubArcsStretch as { name: string }).name}`);
export const w3cEdgePathsK15 = wrap(w3c.edgePathsK15, `w3c:${(w3c.edgePathsK15 as { name: string }).name}`);
export const w3cEdgePathsK3 = wrap(w3c.edgePathsK3, `w3c:${(w3c.edgePathsK3 as { name: string }).name}`);
export const w3cSoftKeysLambda0 = wrap(w3c.softKeysLambda0, `w3c:${(w3c.softKeysLambda0 as { name: string }).name}`);
export const w3cSoftKeysHard = wrap(w3c.softKeysHard, `w3c:${(w3c.softKeysHard as { name: string }).name}`);
export const w3cSoftKeysTau1 = wrap(w3c.softKeysTau1, `w3c:${(w3c.softKeysTau1 as { name: string }).name}`);
export const w3cHoughOrthogonal = wrap(w3c.houghOrthogonal, `w3c:${(w3c.houghOrthogonal as { name: string }).name}`);
export const w3cHoughWide = wrap(w3c.houghWide, `w3c:${(w3c.houghWide as { name: string }).name}`);
export const w3cRidgesRoutes = wrap(w3c.ridgesRoutes, `w3c:${(w3c.ridgesRoutes as { name: string }).name}`);
export const w3cRidgesWide = wrap(w3c.ridgesWide, `w3c:${(w3c.ridgesWide as { name: string }).name}`);
export const w3cHdbscanFlow = wrap(w3c.hdbscanFlow, `w3c:${(w3c.hdbscanFlow as { name: string }).name}`);
export const w3cHdbscanMin2 = wrap(w3c.hdbscanMin2, `w3c:${(w3c.hdbscanMin2 as { name: string }).name}`);
export const w3cHubArcsQ4 = wrap(w3c.hubArcsQ4, `w3c:${(w3c.hubArcsQ4 as { name: string }).name}`);
export const w3cHubArcsAlpha03 = wrap(w3c.hubArcsAlpha03, `w3c:${(w3c.hubArcsAlpha03 as { name: string }).name}`);
export const w3eMlsebStretch = wrap(w3e.mlsebStretch, `w3e:${(w3e.mlsebStretch as { name: string }).name}`);
export const w3eSbebStretch = wrap(w3e.sbebStretch, `w3e:${(w3e.sbebStretch as { name: string }).name}`);
export const w3eAreasStretch = wrap(w3e.areasStretch, `w3e:${(w3e.areasStretch as { name: string }).name}`);
export const w3eConfluentStretch = wrap(w3e.confluentStretch, `w3e:${(w3e.confluentStretch as { name: string }).name}`);
export const w3ePowerStretch = wrap(w3e.powerStretch, `w3e:${(w3e.powerStretch as { name: string }).name}`);
export const w3eCrossbarsStretch = wrap(w3e.crossbarsStretch, `w3e:${(w3e.crossbarsStretch as { name: string }).name}`);
export const w3eFrechetStretch = wrap(w3e.frechetStretch, `w3e:${(w3e.frechetStretch as { name: string }).name}`);
