import { arcCurve, type ArcOptions } from "../curves/arc/index.ts";
import { clothoidCurve, type ClothoidOptions } from "../curves/clothoid/index.ts";
import { highwayCurve, highwayCurves, type JogStyle, type LaneCurve } from "../curves/highway/index.ts";
import type { CurveSegment } from "../curves/model.ts";
import { roundedCurve, type RoundedOptions } from "../curves/rounded/index.ts";
import type { CurveSpace } from "../curves/space.ts";
import { smoothCurve, type SmoothOptions } from "../curves/smooth/index.ts";
import { splineCurve, type SplineOptions } from "../curves/spline/index.ts";
import { straightCurve } from "../curves/straight/index.ts";
import { CUT_DEFAULTS, cutGroups, type CutOptions } from "../groups/cut/index.ts";
import { KD_DEFAULTS, kdGroups, type KdOptions } from "../groups/kd/index.ts";
import { byDataGroup, keyGroups, type KeyOptions } from "../groups/keys/index.ts";
import { quadtreeGroups } from "../groups/quadtree/index.ts";
import { CORRIDOR_DEFAULTS, corridorPlan, type CorridorOptions } from "../highways/corridors/index.ts";
import { ambiguityGate, type AmbiguityGuardOptions } from "../highways/gates/ambiguity/index.ts";
import { breakEvenGate, type BreakEvenOptions } from "../highways/gates/breakeven/index.ts";
import { hysteresisGate, type HysteresisOptions } from "../highways/gates/hysteresis/index.ts";
import { stableIdGate, type StableIdOptions } from "../highways/gates/ids/index.ts";
import { gateStrategy } from "../highways/gates/model.ts";
import { stretchGate, type StretchOptions } from "../highways/gates/stretch/index.ts";
import { DIFFUSION_DEFAULTS, diffusionPlan, type DiffusionOptions } from "../highways/diffusion/index.ts";
import { FLOW_CLUSTER_DEFAULTS, flowClusterPlan, type FlowClusterOptions } from "../highways/flow-clusters/index.ts";
import { EDGE_PATH_DEFAULTS, edgePathPlan, type EdgePathOptions } from "../highways/edge-paths/index.ts";
import { HDBSCAN_DEFAULTS, hdbscanPlan, type HdbscanOptions } from "../highways/hdbscan/index.ts";
import { HOUGH_DEFAULTS, houghPlan, type HoughOptions } from "../highways/hough/index.ts";
import { HUB_ARC_DEFAULTS, hubArcPlan, type HubArcOptions } from "../highways/hub-arcs/index.ts";
import { DIVIDED_DEFAULTS, dividedPlan, type DividedOptions } from "../highways/divided/index.ts";
import { HIERARCHY_DEFAULTS, hierarchyPlan, type HierarchyOptions } from "../highways/hierarchy/index.ts";
import { FDEB_DEFAULTS, fdebPlan, type FdebOptions } from "../highways/fdeb/index.ts";
import { MESH_DEFAULTS, meshPlan, type MeshOptions } from "../highways/mesh/index.ts";
import { KDEEB_DEFAULTS, kdeebPlan, type KdeebOptions } from "../highways/kdeeb/index.ts";
import { CUBU_DEFAULTS, cubuPlan, type CubuOptions } from "../highways/cubu/index.ts";
import { MLSEB_DEFAULTS, mlsebPlan, type MlsebOptions } from "../highways/mlseb/index.ts";
import { SBEB_DEFAULTS, sbebPlan, type SbebOptions } from "../highways/sbeb/index.ts";
import { AREA_DEFAULTS, areaPlan, type AreaOptions } from "../highways/areas/index.ts";
import { CONFLUENT_DEFAULTS, confluentPlan, type ConfluentOptions } from "../highways/confluent/index.ts";
import { POWER_DEFAULTS, powerPlan, type PowerOptions } from "../highways/power/index.ts";
import { CROSSBAR_DEFAULTS, crossbarPlan, type CrossbarOptions } from "../highways/crossbars/index.ts";
import { FRECHET_DEFAULTS, frechetPlan, type FrechetOptions } from "../highways/frechet/index.ts";
import { SPECTRAL_DEFAULTS, spectralPlan, type SpectralOptions } from "../highways/spectral/index.ts";
import { RESISTANCE_DEFAULTS, resistancePlan, type ResistanceOptions } from "../highways/resistance/index.ts";
import { LINK_COMMUNITY_DEFAULTS, linkCommunityPlan, type LinkCommunityOptions } from "../highways/link-communities/index.ts";
import { TERRITORY_DEFAULTS, territoryPlan, type TerritoryOptions } from "../highways/territories/index.ts";
import { CONSENSUS_DEFAULTS, consensusPlan, type ConsensusOptions } from "../highways/consensus/index.ts";
import { P_HUB_DEFAULTS, pHubPlan, type PHubOptions } from "../highways/p-hub/index.ts";
import { SCALE_SPACE_DEFAULTS, scaleSpacePlan, type ScaleSpaceOptions } from "../highways/scale-space/index.ts";
import { RIDGE_DEFAULTS, ridgePlan, type RidgeOptions } from "../highways/ridges/index.ts";
import { SOFT_KEY_DEFAULTS, softKeyPlan, type SoftKeyOptions } from "../highways/soft-keys/index.ts";
import { FLOW_FIELD_DEFAULTS, flowFieldPlan, type FlowFieldOptions } from "../highways/flow-field/index.ts";
import { keysPlan, type KeysOptions } from "../highways/keys/index.ts";
import { LEVEL_HIGHWAY_DEFAULTS, levelHighwayPlan, type LevelHighwayOptions } from "../highways/level-links/index.ts";
import { MEET_DEFAULTS, meetPlan, type MeetOptions } from "../highways/meet/index.ts";
import { MINGLE_DEFAULTS, minglePlan, type MingleOptions } from "../highways/mingle/index.ts";
import type { HighwayInput } from "../highways/model.ts";
import { OD_CELL_DEFAULTS, odCellPlan, type OdCellOptions } from "../highways/od-cells/index.ts";
import { QUICKBUNDLES_DEFAULTS, quickBundlesPlan, type QuickBundlesOptions } from "../highways/quickbundles/index.ts";
import { NESTED_DEFAULTS, nestedPlan, type NestedOptions } from "../highways/nested/index.ts";
import { LANES_DEFAULTS, lanesPlan, type LanesOptions } from "../highways/lanes/index.ts";
import { GROWTH_DEFAULTS, growthPlan, type GrowthOptions } from "../highways/growth/index.ts";
import { ROAD_CLASS_DEFAULTS, roadClassPlan, type RoadClassOptions } from "../highways/road-classes/index.ts";
import { SELECT_DEFAULTS, selectPlan, type SelectOptions } from "../highways/select/index.ts";
import { sharedWaysPlan, type SharedWaysOptions } from "../highways/shared-ways/index.ts";
import { SPIRAL_DEFAULTS, spiralPlan, type SpiralOptions } from "../highways/spiral/index.ts";
import { STUB_DEFAULTS, stubPlan, type StubOptions } from "../highways/stubs/index.ts";
import { TRACLUS_DEFAULTS, traclusPlan, type TraclusOptions } from "../highways/traclus/index.ts";
import { WEISZFELD_DEFAULTS, weiszfeldPlan, type WeiszfeldOptions } from "../highways/weiszfeld/index.ts";
import { WSPD_DEFAULTS, wspdPlan, type WspdOptions } from "../highways/wspd/index.ts";
import { ZIPPER_DEFAULTS, zipperPlan, type ZipperOptions } from "../highways/zipper/index.ts";
import type { Graph, Result, Router } from "../model.ts";
import { roomDemand, type RoomMethod, type RoomOptions } from "../room/index.ts";
import { levelRoom, type LevelRoomOptions } from "../room/levels/index.ts";
import { cornersRouter, type CornersOptions } from "../routers/corners.ts";
import { plugsRouter } from "../routers/plugs.ts";
import { sectionsRouter, type SectionsOptions } from "../routers/sections.ts";
import { sharedRouter, type SharedOptions } from "../routers/shared.ts";
import { straightRouter } from "../routers/straight.ts";
import { byCollection, trunksRouter, type TrunksOptions } from "../routers/trunks.ts";
import { buildSections, SECTION_DEFAULTS, type SectionOptions } from "../sections.ts";
import { createRegistry, defineStrategy, type AnyStrategy, type CurveInput, type LaneBoard, type Registry, type Strategy } from "./model.ts";
import type { OptionSchema } from "./options.ts";
import { AREA_SCHEMA, CONFLUENT_SCHEMA, CROSSBAR_SCHEMA, FRECHET_SCHEMA, MLSEB_SCHEMA, POWER_SCHEMA, SBEB_SCHEMA } from "./schemas.ts";
import { CLOTHOID_SCHEMA, CORNERS_SCHEMA, CORRIDOR_SCHEMA, CONSENSUS_SCHEMA, CUBU_SCHEMA, CUT_SCHEMA, DIFFUSION_SCHEMA, DIVIDED_SCHEMA, EDGE_PATH_SCHEMA, FDEB_SCHEMA, FLOW_CLUSTER_SCHEMA, FLOW_FIELD_SCHEMA, GROWTH_SCHEMA, HDBSCAN_SCHEMA, HIERARCHY_SCHEMA, HIGHWAY_SCHEMA, HOUGH_SCHEMA, HUB_ARC_SCHEMA, KD_SCHEMA, KDEEB_SCHEMA, KEY_SCHEMA, LANES_SCHEMA, LEVEL_HIGHWAY_SCHEMA, LEVEL_ROOM_SCHEMA, LINK_COMMUNITY_SCHEMA, MEET_SCHEMA, MESH_SCHEMA, MINGLE_SCHEMA, NESTED_SCHEMA, OD_CELL_SCHEMA, P_HUB_SCHEMA, QUICKBUNDLES_SCHEMA, RADIUS_SCHEMA, RESISTANCE_SCHEMA, RIDGE_SCHEMA, ROAD_CLASS_SCHEMA, ROOM_SCHEMA, SCALE_SPACE_SCHEMA, SECTION_SCHEMA, SELECT_SCHEMA, SECTIONS_SCHEMA, SHARED_SCHEMA, SMOOTH_SCHEMA, SOFT_KEY_SCHEMA, SPECTRAL_SCHEMA, SPIRAL_SCHEMA, STUB_SCHEMA, TENSION_SCHEMA, TERRITORY_SCHEMA, TRACLUS_SCHEMA, TRUNKS_SCHEMA, WEISZFELD_SCHEMA, WSPD_SCHEMA, ZIPPER_SCHEMA } from "./schemas.ts";

/** The options of a router strategy: the options of its router, without the name and the limit of the benchmark. */
export type RouterPreset<O> = Omit<O, "name" | "maxNodes">;

/** This function makes a router strategy from a router factory and a preset of its options. Each call makes the router of its options. */
function routerStrategy<O extends object>(
  name: string,
  describe: string,
  maxNodes: number,
  defaults: O,
  make: (options: O & { readonly name: string }) => Router,
  schema: OptionSchema<O>,
): Strategy<"router", O> {
  return defineStrategy({ step: "router", name, describe, defaults, schema, maxNodes, run: (graph: Graph, options: Readonly<O>): Result => make({ ...options, name }).route(graph) });
}

/** This function makes a router strategy for a router without options. */
function fixedRouter(router: Router, describe: string): Strategy<"router", object> {
  return defineStrategy({ step: "router", name: router.name, describe, defaults: {}, schema: {}, run: (graph: Graph): Result => router.route(graph) });
}

/** The built-in router strategies, in the order of the benchmark. They route as the routers of `ROUTERS`. */
export const routerStrategies: {
  readonly straight: Strategy<"router", object>;
  readonly plugs: Strategy<"router", object>;
  readonly corners: Strategy<"router", RouterPreset<CornersOptions>>;
  readonly "corners-smooth": Strategy<"router", RouterPreset<CornersOptions>>;
  readonly trunks: Strategy<"router", RouterPreset<TrunksOptions>>;
  readonly shared: Strategy<"router", RouterPreset<SharedOptions>>;
  readonly "shared-all": Strategy<"router", RouterPreset<SharedOptions>>;
  readonly sections: Strategy<"router", RouterPreset<SectionsOptions>>;
  readonly "sections-tree": Strategy<"router", RouterPreset<SectionsOptions>>;
} = Object.freeze({
  straight: fixedRouter(straightRouter, "The control. Each edge is one straight line between its plugs."),
  plugs: fixedRouter(
    plugsRouter,
    "Each edge leaves its plug along the normal of the side and follows the curve of the inflection rule. It does not go around the nodes.",
  ),
  corners: routerStrategy<RouterPreset<CornersOptions>>(
    "corners",
    "Each edge goes around the nodes on a shortest path (A*) through a sparse visibility graph of the box corners.",
    10_000,
    {},
    cornersRouter,
    CORNERS_SCHEMA,
  ),
  "corners-smooth": routerStrategy<RouterPreset<CornersOptions>>(
    "corners-smooth",
    "The same paths as `corners`. A route in clear view follows the inflection rule, and the other routes get round corners.",
    10_000,
    { smooth: true },
    cornersRouter,
    CORNERS_SCHEMA,
  ),
  trunks: routerStrategy<RouterPreset<TrunksOptions>>(
    "trunks",
    "A rule puts edges in groups. The edges of a group leave one plug of one node on one trunk. At a split point, each edge goes on to its target.",
    10_000,
    { rule: byCollection },
    trunksRouter,
    TRUNKS_SCHEMA,
  ),
  shared: routerStrategy<RouterPreset<SharedOptions>>(
    "shared",
    "The edges of one collection share their ways through the corner graph. A link that the group uses already costs half.",
    10_000,
    { rule: byCollection },
    sharedRouter,
    SHARED_SCHEMA,
  ),
  "shared-all": routerStrategy<RouterPreset<SharedOptions>>("shared-all", "The same as `shared`, but all edges share their ways.", 10_000, {}, sharedRouter, SHARED_SCHEMA),
  sections: routerStrategy<RouterPreset<SectionsOptions>>(
    "sections",
    "A tree of sections, with a hub in each section. A long edge goes through the hubs, and a short edge goes directly.",
    100_000,
    {},
    sectionsRouter,
    SECTIONS_SCHEMA,
  ),
  "sections-tree": routerStrategy<RouterPreset<SectionsOptions>>(
    "sections-tree",
    "The same as `sections`, but without the limit of the stretch.",
    100_000,
    { stretch: Infinity },
    sectionsRouter,
    SECTIONS_SCHEMA,
  ),
});

/** The context of a curve input, without the keys that have no value. */
const contextOf = (input: CurveInput): Omit<CurveInput, "points"> => ({
  ...(input.startNormal ? { startNormal: input.startNormal } : {}),
  ...(input.endNormal ? { endNormal: input.endNormal } : {}),
  ...(input.space ? { space: input.space } : {}),
});

/** The options of the curve strategies `rounded` and `arc`. */
export interface RadiusOptions {
  /** The radius of the corners. The default is 12. */
  readonly radius: number;
}

/** The options of the curve strategy `spline`. */
export interface TensionOptions {
  /** The tension of the spline, from 0 (the spline) to 1 (the polyline). The default is 0. */
  readonly tension: number;
}

/**
 * The options of the curve strategy `highway`. The options `minRadius`, `jog` and `jogPieces` change only the lanes of a bundle.
 * So they change the curve only when the input has a `lane` on a board with open segments.
 */
export interface HighwayStrategyOptions {
  /** The radius of the center line of a bundle at a bend, and of each lone corner. The default is 12. */
  readonly radius: number;
  /** The smallest radius of a lane at a bend of a bundle. The default is 4. */
  readonly minRadius: number;
  /** The shape of the S curve where a lane changes its offset. The default is `biarc`. */
  readonly jog: JogStyle;
  /** The number of cubic pieces of a `quintic` S curve. The default is 4. */
  readonly jogPieces: number;
}

/** The curves of the lanes of each board, for the last options and the last free space. The strategy `highway` draws one lane in each call. */
const laneCurves = new WeakMap<LaneBoard, { readonly key: string; readonly space: CurveSpace | undefined; readonly curves: LaneCurve[] }>();

/**
 * This function gives the curve of one lane of a board with `highwayCurves` and each option of the strategy `highway`.
 * The lanes of a bundle bend as one. So the function draws all the lanes of the board one time, and keeps them for the next lane.
 */
function highwayLane(input: CurveInput & Required<Pick<CurveInput, "lane">>, o: Readonly<HighwayStrategyOptions>): CurveSegment[] {
  const { board, index } = input.lane;
  const key = JSON.stringify([o.radius, o.minRadius, o.jog, o.jogPieces]);
  let hit = laneCurves.get(board);
  if (!hit || hit.key !== key || hit.space !== input.space) {
    const curves = highwayCurves(board.graph, board.open, board.width, {
      radius: o.radius,
      minRadius: o.minRadius,
      jog: o.jog,
      jogPieces: o.jogPieces,
      ...(board.maxWidth === undefined ? {} : { maxWidth: board.maxWidth }),
      ...(input.space ? { space: input.space } : {}),
    });
    hit = { key, space: input.space, curves };
    laneCurves.set(board, hit);
  }
  const lane = hit.curves[index];
  return lane ? [...lane.segments] : highwayCurve(input.points, { radius: o.radius, ...(input.space ? { space: input.space } : {}) });
}

/** The options of the curve strategy `smooth`. */
export interface SmoothStrategyOptions {
  /** The radius of the arc of each corner. The default is 12. */
  readonly radius: number;
  /** The share of the turn of a corner in its two spirals, from 0 to 1. The default is 0.6. */
  readonly smoothing: number;
}

/** The options of the curve strategy `clothoid`. */
export interface ClothoidStrategyOptions {
  /** The radius of the arc of each corner. The default is 12. */
  readonly radius: number;
  /** The share of the turn of a corner in its two clothoids, from 0 to 1. The default is 0.5. */
  readonly spiral: number;
  /** The largest distance from the cubic pieces to the true clothoid. The default is 0.25. */
  readonly tolerance: number;
}

/**
 * The built-in curve strategies. The first six are in the order of `CURVE_TYPES`, and each one gives the same segments as `curveOf` with its type.
 * The strategy `highway` gives the curve of `arc` for one polyline. For a polyline with a `lane`, it bends the lanes of each bundle as one with `highwayCurves`.
 */
export const curveStrategies: {
  readonly straight: Strategy<"curve", object>;
  readonly rounded: Strategy<"curve", RadiusOptions>;
  readonly spline: Strategy<"curve", TensionOptions>;
  readonly arc: Strategy<"curve", RadiusOptions>;
  readonly smooth: Strategy<"curve", SmoothStrategyOptions>;
  readonly clothoid: Strategy<"curve", ClothoidStrategyOptions>;
  readonly highway: Strategy<"curve", HighwayStrategyOptions>;
} = Object.freeze({
  straight: defineStrategy({ step: "curve", name: "straight", describe: "The polyline as it is.", defaults: {}, schema: {}, run: (input: CurveInput) => straightCurve(input.points) }),
  rounded: defineStrategy({
    step: "curve",
    name: "rounded",
    describe: "A quadratic Bezier curve at each corner, as `roundCorners` draws it. The first and the last legs stay.",
    defaults: { radius: 12 },
    schema: RADIUS_SCHEMA,
    run: (input: CurveInput, o: Readonly<RadiusOptions>) => roundedCurve(input.points, { ...contextOf(input), radius: o.radius } satisfies RoundedOptions),
  }),
  spline: defineStrategy({
    step: "curve",
    name: "spline",
    describe: "A centripetal Catmull-Rom spline through each point. It does not overshoot or make loops in a piece.",
    defaults: { tension: 0 },
    schema: TENSION_SCHEMA,
    run: (input: CurveInput, o: Readonly<TensionOptions>) => splineCurve(input.points, { ...contextOf(input), tension: o.tension } satisfies SplineOptions),
  }),
  arc: defineStrategy({
    step: "curve",
    name: "arc",
    describe: "A circular arc at each corner, tangent to the two legs. The first and the last legs stay.",
    defaults: { radius: 12 },
    schema: RADIUS_SCHEMA,
    run: (input: CurveInput, o: Readonly<RadiusOptions>) => arcCurve(input.points, { ...contextOf(input), radius: o.radius } satisfies ArcOptions),
  }),
  smooth: defineStrategy({
    step: "curve",
    name: "smooth",
    describe: "A cubic spiral, an arc and a second cubic spiral at each corner, as the corner smoothing of Figma. The curvature has no jump.",
    defaults: { radius: 12, smoothing: 0.6 },
    schema: SMOOTH_SCHEMA,
    run: (input: CurveInput, o: Readonly<SmoothStrategyOptions>) =>
      smoothCurve(input.points, { ...(input.space ? { space: input.space } : {}), radius: o.radius, smoothing: o.smoothing } satisfies SmoothOptions),
  }),
  clothoid: defineStrategy({
    step: "curve",
    name: "clothoid",
    describe: "A clothoid, an arc and a second clothoid at each corner, as a transition curve of a road. Cubic pieces draw each clothoid.",
    defaults: { radius: 12, spiral: 0.5, tolerance: 0.25 },
    schema: CLOTHOID_SCHEMA,
    run: (input: CurveInput, o: Readonly<ClothoidStrategyOptions>) =>
      clothoidCurve(input.points, {
        ...(input.space ? { space: input.space } : {}),
        radius: o.radius,
        spiral: o.spiral,
        tolerance: o.tolerance,
      } satisfies ClothoidOptions),
  }),
  highway: defineStrategy({
    step: "curve",
    name: "highway",
    describe: "The lanes of a bundle bend as one, with concentric arcs at the lane spacing. One lane alone gets the curve of `arc`.",
    defaults: { radius: 12, minRadius: 4, jog: "biarc" as JogStyle, jogPieces: 4 },
    schema: HIGHWAY_SCHEMA,
    run: (input: CurveInput, o: Readonly<HighwayStrategyOptions>) =>
      input.lane ? highwayLane({ ...input, lane: input.lane }, o) : highwayCurve(input.points, { radius: o.radius, ...(input.space ? { space: input.space } : {}) }),
  }),
});

/** The options of a room strategy: the options of `roomDemand`, without the method. */
export type RoomPreset = Omit<RoomOptions, "method">;

const roomStrategy = (method: RoomMethod, describe: string): Strategy<"room", RoomPreset> =>
  defineStrategy<"room", RoomPreset>({ step: "room", name: method, describe, defaults: {}, schema: ROOM_SCHEMA, run: (input, o) => roomDemand(input.items, input.links, { ...o, method }) });

/** The options of the room strategy `levels`: the options of `levelRoom` without the method, and the limits of the quadtree. */
export type LevelRoomPreset = Omit<LevelRoomOptions, "method"> & SectionOptions;

/** The built-in room strategies: the methods of `roomDemand`, and the room of each zoom level (`levelRoom`). */
export const roomStrategies: {
  readonly routes: Strategy<"room", RoomPreset>;
  readonly lines: Strategy<"room", RoomPreset>;
  readonly levels: Strategy<"room", LevelRoomPreset>;
} = Object.freeze({
  routes: roomStrategy("routes", "The lanes of a gap are the most routes that run along it side by side, with each gap open to the gutter."),
  lines: roomStrategy("lines", "The lanes of a gap are the straight lines between the centers of the boxes that cross the gap."),
  levels: defineStrategy<"room", LevelRoomPreset>({
    step: "room",
    name: "levels",
    describe: "Each zoom level gets the gaps that its links need. The far levels open first, and a box moves with its parent.",
    defaults: {},
    schema: LEVEL_ROOM_SCHEMA,
    run: (input, o) => {
      const { cap, maxDepth, collapse, ...room } = o;
      const root = input.sections ?? buildSections(input.items, { cap: cap ?? SECTION_DEFAULTS.cap, maxDepth: maxDepth ?? SECTION_DEFAULTS.maxDepth, collapse: collapse ?? SECTION_DEFAULTS.collapse });
      return levelRoom(input.items, input.links, root, room).gaps;
    },
  }),
});

/** The built-in grouping rules: the strategies of the step `group`. The router `sections` makes its hubs and its zoom levels from their tree. */
export const groupStrategies: {
  readonly quadtree: Strategy<"group", Required<SectionOptions>>;
  readonly keys: Strategy<"group", KeyOptions>;
  readonly kd: Strategy<"group", Required<KdOptions>>;
  readonly cut: Strategy<"group", Required<CutOptions>>;
} = Object.freeze({
  quadtree: defineStrategy({
    step: "group",
    name: "quadtree",
    describe: "The cells of a quadtree of the plane. A cell with more than `cap` nodes splits in four. It is the default rule of the router `sections`.",
    defaults: { ...SECTION_DEFAULTS },
    schema: SECTION_SCHEMA,
    run: (graph: Graph, o: Readonly<Required<SectionOptions>>) => quadtreeGroups(graph, o),
  }),
  keys: defineStrategy({
    step: "group",
    name: "keys",
    describe: "One group for each key of the nodes. The default key is the string `data.group` of the node. A node without a key is a group alone.",
    defaults: { key: byDataGroup } as KeyOptions,
    schema: KEY_SCHEMA,
    run: (graph: Graph, o: Readonly<KeyOptions>) => keyGroups(graph, o),
  }),
  kd: defineStrategy({
    step: "group",
    name: "kd",
    describe: "The cells of a k-d tree of the plane. A cell with more than `cap` nodes splits in two with a line across one axis, and each half splits again.",
    defaults: { ...KD_DEFAULTS },
    schema: KD_SCHEMA,
    run: (graph: Graph, o: Readonly<Required<KdOptions>>) => kdGroups(graph, o),
  }),
  cut: defineStrategy({
    step: "group",
    name: "cut",
    describe: "A guillotine cut that reads the edges. Each line goes where it cuts the fewest edges for its balance, so the far view has fewer links.",
    defaults: { ...CUT_DEFAULTS },
    schema: CUT_SCHEMA,
    run: (graph: Graph, o: Readonly<Required<CutOptions>>) => cutGroups(graph, o),
  }),
});

/** The highway strategy `corridors` (HWY-031): the base of the built-in gates. */
const corridors: Strategy<"highway", CorridorOptions> = defineStrategy({
  step: "highway",
  name: "corridors",
  describe: "Corridor signatures. Edges whose first ways share long links make a cluster, found with MinHash. The longest common run of each cluster is its highway.",
  defaults: { ...CORRIDOR_DEFAULTS } as CorridorOptions,
  schema: CORRIDOR_SCHEMA,
  maxNodes: 10_000,
  run: (input: HighwayInput, o: Readonly<CorridorOptions>) => corridorPlan(input, o),
});

/**
 * The built-in highway strategies: the decisions of the routers `trunks` and `shared` as plans, and corridor signatures (HWY-031).
 * The strategies `corridors+<gate>` put a gate of BUILD-W2A after `corridors`: `breakeven` (HWY-047), `stretch` (HWY-048), `ambiguity` (HWY-049),
 * `hysteresis` (HWY-046) and `ids` (HWY-054). `gateStrategy` puts a gate after any other plan.
 * `follow` routes the edges along a plan, and `highwayRouter` gives a router that does both.
 */
export const highwayStrategies: {
  readonly keys: Strategy<"highway", KeysOptions>;
  readonly "shared-ways": Strategy<"highway", SharedWaysOptions>;
  readonly corridors: Strategy<"highway", CorridorOptions>;
  readonly meet: Strategy<"highway", MeetOptions>;
  readonly weiszfeld: Strategy<"highway", WeiszfeldOptions>;
  readonly stubs: Strategy<"highway", StubOptions>;
  readonly zipper: Strategy<"highway", ZipperOptions>;
  readonly "level-links": Strategy<"highway", LevelHighwayOptions>;
  readonly quickbundles: Strategy<"highway", QuickBundlesOptions>;
  readonly "road-classes": Strategy<"highway", RoadClassOptions>;
  readonly "flow-field": Strategy<"highway", FlowFieldOptions>;
  readonly wspd: Strategy<"highway", WspdOptions>;
  readonly "od-cells": Strategy<"highway", OdCellOptions>;
  readonly select: Strategy<"highway", SelectOptions>;
  readonly mingle: Strategy<"highway", MingleOptions>;
  readonly spiral: Strategy<"highway", SpiralOptions>;
  readonly "flow-clusters": Strategy<"highway", FlowClusterOptions>;
  readonly traclus: Strategy<"highway", TraclusOptions>;
  readonly diffusion: Strategy<"highway", DiffusionOptions>;
  readonly nested: Strategy<"highway", NestedOptions>;
  readonly lanes: Strategy<"highway", LanesOptions>;
  readonly growth: Strategy<"highway", GrowthOptions>;
  readonly "edge-paths": Strategy<"highway", EdgePathOptions>;
  readonly "soft-keys": Strategy<"highway", SoftKeyOptions>;
  readonly hough: Strategy<"highway", HoughOptions>;
  readonly ridges: Strategy<"highway", RidgeOptions>;
  readonly hdbscan: Strategy<"highway", HdbscanOptions>;
  readonly "hub-arcs": Strategy<"highway", HubArcOptions>;
  readonly divided: Strategy<"highway", DividedOptions>;
  readonly hierarchy: Strategy<"highway", HierarchyOptions>;
  readonly fdeb: Strategy<"highway", FdebOptions>;
  readonly mesh: Strategy<"highway", MeshOptions>;
  readonly kdeeb: Strategy<"highway", KdeebOptions>;
  readonly cubu: Strategy<"highway", CubuOptions>;
  readonly mlseb: Strategy<"highway", MlsebOptions>;
  readonly sbeb: Strategy<"highway", SbebOptions>;
  readonly areas: Strategy<"highway", AreaOptions>;
  readonly confluent: Strategy<"highway", ConfluentOptions>;
  readonly power: Strategy<"highway", PowerOptions>;
  readonly crossbars: Strategy<"highway", CrossbarOptions>;
  readonly frechet: Strategy<"highway", FrechetOptions>;
  readonly spectral: Strategy<"highway", SpectralOptions>;
  readonly resistance: Strategy<"highway", ResistanceOptions>;
  readonly "link-communities": Strategy<"highway", LinkCommunityOptions>;
  readonly territories: Strategy<"highway", TerritoryOptions>;
  readonly consensus: Strategy<"highway", ConsensusOptions>;
  readonly "p-hub": Strategy<"highway", PHubOptions>;
  readonly "scale-space": Strategy<"highway", ScaleSpaceOptions>;
  readonly "corridors+breakeven": Strategy<"highway", CorridorOptions & BreakEvenOptions>;
  readonly "corridors+stretch": Strategy<"highway", CorridorOptions & StretchOptions>;
  readonly "corridors+ambiguity": Strategy<"highway", CorridorOptions & AmbiguityGuardOptions>;
  readonly "corridors+hysteresis": Strategy<"highway", CorridorOptions & HysteresisOptions>;
  readonly "corridors+ids": Strategy<"highway", CorridorOptions & StableIdOptions>;
} = Object.freeze({
  keys: defineStrategy({
    step: "highway",
    name: "keys",
    describe: "The highways of the router `trunks`. The edges from one plug with one key share a trunk, and the edges that go on together share a run past it.",
    defaults: { rule: byCollection } as KeysOptions,
    schema: TRUNKS_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<KeysOptions>) => keysPlan(input, o),
  }),
  "shared-ways": defineStrategy({
    step: "highway",
    name: "shared-ways",
    describe: "The highways of the router `shared`. The edges of one key share their ways through the corner graph, and each shared stretch is a highway.",
    defaults: { rule: byCollection } as SharedWaysOptions,
    schema: SHARED_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<SharedWaysOptions>) => sharedWaysPlan(input, o),
  }),
  corridors,
  meet: defineStrategy({
    step: "highway",
    name: "meet",
    describe: "Meet points (HWY-050). Each member of the plan `from` joins its spine where its first route meets the spine, and leaves where they part.",
    defaults: { ...MEET_DEFAULTS } as MeetOptions,
    schema: MEET_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<MeetOptions>) => meetPlan(input, o),
  }),
  weiszfeld: defineStrategy({
    step: "highway",
    name: "weiszfeld",
    describe: "Weiszfeld meeting points (HWY-043). Each highway of the plan `from` gets the merge and split points with the least ink, with a weighted trunk.",
    defaults: { ...WEISZFELD_DEFAULTS } as WeiszfeldOptions,
    schema: WEISZFELD_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<WeiszfeldOptions>) => weiszfeldPlan(input, o),
  }),
  stubs: defineStrategy({
    step: "highway",
    name: "stubs",
    describe: "Stubs (HWY-015, WILD-005). The ends on one side of a box that go in near directions share one plug and one short stub.",
    defaults: { ...STUB_DEFAULTS } as StubOptions,
    schema: STUB_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<StubOptions>) => stubPlan(input, o),
  }),
  zipper: defineStrategy({
    step: "highway",
    name: "zipper",
    describe: "The axon zipper (NAT-022, WILD-037). Two near, nearly parallel legs zip into one line when the shared length is more than the jogs.",
    defaults: { ...ZIPPER_DEFAULTS } as ZipperOptions,
    schema: ZIPPER_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<ZipperOptions>) => zipperPlan(input, o),
  }),
  "level-links": defineStrategy({
    step: "highway",
    name: "level-links",
    describe: "Level links as highways (HWY-056, WILD-034). The edges between two items of a zoom level ride the link of the level.",
    defaults: { ...LEVEL_HIGHWAY_DEFAULTS } as LevelHighwayOptions,
    schema: LEVEL_HIGHWAY_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<LevelHighwayOptions>) => levelHighwayPlan(input, o),
  }),
  quickbundles: defineStrategy({
    step: "highway",
    name: "quickbundles",
    describe: "QuickBundles (HWY-026). One pass puts each edge in the nearest cluster of resampled lines. Each cluster gets highways.",
    defaults: { ...QUICKBUNDLES_DEFAULTS } as QuickBundlesOptions,
    schema: QUICKBUNDLES_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<QuickBundlesOptions>) => quickBundlesPlan(input, o),
  }),
  "road-classes": defineStrategy({
    step: "highway",
    name: "road-classes",
    describe: "Road classes (HWY-034, EDA-050). The links that most ways use become main roads, and a second pass routes the edges onto them.",
    defaults: { ...ROAD_CLASS_DEFAULTS } as RoadClassOptions,
    schema: ROAD_CLASS_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<RoadClassOptions>) => roadClassPlan(input, o),
  }),
  "flow-field": defineStrategy({
    step: "highway",
    name: "flow-field",
    describe: "A flow field for each target (EDA-046, HWY-037). The edges into one side of a box merge like streams on shortest ways to one root.",
    defaults: { ...FLOW_FIELD_DEFAULTS } as FlowFieldOptions,
    schema: FLOW_FIELD_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<FlowFieldOptions>) => flowFieldPlan(input, o),
  }),
  wspd: defineStrategy({
    step: "highway",
    name: "wspd",
    describe: "Well-separated pairs (HWY-018). The edges between the two sets of one pair share one highway.",
    defaults: { ...WSPD_DEFAULTS } as WspdOptions,
    schema: WSPD_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<WspdOptions>) => wspdPlan(input, o),
  }),
  "od-cells": defineStrategy({
    step: "highway",
    name: "od-cells",
    describe: "Origin and destination cells (EDA-033, WILD-032). The edges between two cells of a zoom level share one trunk.",
    defaults: { ...OD_CELL_DEFAULTS } as OdCellOptions,
    schema: OD_CELL_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<OdCellOptions>) => odCellPlan(input, o),
  }),
  select: defineStrategy({
    step: "highway",
    name: "select",
    describe: "Candidate generation and selection (HWY-045). Some strategies propose highways, and a greedy pass with swaps keeps the best set.",
    defaults: { ...SELECT_DEFAULTS } as SelectOptions,
    schema: SELECT_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<SelectOptions>) => selectPlan(input, o),
  }),
  mingle: defineStrategy({
    step: "highway",
    name: "mingle",
    describe: "MINGLE (HWY-003). Edges are points in 4D. Near bundles merge level by level while the merge saves ink, and each bundle gets one trunk.",
    defaults: { ...MINGLE_DEFAULTS } as MingleOptions,
    schema: MINGLE_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<MingleOptions>) => minglePlan(input, o),
  }),
  spiral: defineStrategy({
    step: "highway",
    name: "spiral",
    describe: "Spiral trees (HWY-017, EDA-035). The edges of a node with many edges branch on arcs of spirals, and each branch with two edges is a highway.",
    defaults: { ...SPIRAL_DEFAULTS } as SpiralOptions,
    schema: SPIRAL_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<SpiralOptions>) => spiralPlan(input, o),
  }),
  "flow-clusters": defineStrategy({
    step: "highway",
    name: "flow-clusters",
    describe: "Flow clusters (HWY-023). A hierarchical clustering puts the edges with near sources and near targets together, and each cluster gets highways.",
    defaults: { ...FLOW_CLUSTER_DEFAULTS } as FlowClusterOptions,
    schema: FLOW_CLUSTER_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<FlowClusterOptions>) => flowClusterPlan(input, o),
  }),
  traclus: defineStrategy({
    step: "highway",
    name: "traclus",
    describe: "TRACLUS (HWY-025). The first routes break into segments, and the dense clusters of near segments become highways.",
    defaults: { ...TRACLUS_DEFAULTS } as TraclusOptions,
    schema: TRACLUS_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<TraclusOptions>) => traclusPlan(input, o),
  }),
  diffusion: defineStrategy({
    step: "highway",
    name: "diffusion",
    describe: "Route-aware bundling (HWY-020). The density of the first ways diffuses on the corner graph, and dense links cost less in a second pass.",
    defaults: { ...DIFFUSION_DEFAULTS } as DiffusionOptions,
    schema: DIFFUSION_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<DiffusionOptions>) => diffusionPlan(input, o),
  }),
  nested: defineStrategy({
    step: "highway",
    name: "nested",
    describe: "Highways for each zoom level that nest (HWY-052). Each level puts the edges of each cluster of the level above in finer clusters.",
    defaults: { ...NESTED_DEFAULTS } as NestedOptions,
    schema: NESTED_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<NestedOptions>) => nestedPlan(input, o),
  }),
  lanes: defineStrategy({
    step: "highway",
    name: "lanes",
    describe: "Width, lanes and capacity (HWY-051). A highway that does not fit in its channels splits into two highways by lane order.",
    defaults: { ...LANES_DEFAULTS } as LanesOptions,
    schema: LANES_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<LanesOptions>) => lanesPlan(input, o),
  }),
  growth: defineStrategy({
    step: "highway",
    name: "growth",
    describe: "Local growth (HWY-055). Each edge, the longest first, joins the highway with the largest saving, or starts a highway.",
    defaults: { ...GROWTH_DEFAULTS } as GrowthOptions,
    schema: GROWTH_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<GrowthOptions>) => growthPlan(input, o),
  }),
  "edge-paths": defineStrategy({
    step: "highway",
    name: "edge-paths",
    describe: "Edge-path bundling (HWY-012). An edge with a short path of other edges follows their ways, and the shared stretches become highways.",
    defaults: { ...EDGE_PATH_DEFAULTS } as EdgePathOptions,
    schema: EDGE_PATH_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<EdgePathOptions>) => edgePathPlan(input, o),
  }),
  "soft-keys": defineStrategy({
    step: "highway",
    name: "soft-keys",
    describe: "Soft keys (HWY-019). The key of an edge adds a distance to the flow distance, and a hierarchical clustering makes the highways.",
    defaults: { ...SOFT_KEY_DEFAULTS } as SoftKeyOptions,
    schema: SOFT_KEY_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<SoftKeyOptions>) => softKeyPlan(input, o),
  }),
  hough: defineStrategy({
    step: "highway",
    name: "hough",
    describe: "Hough votes (HWY-024). The straight lines of the edges vote for corridors, and each peak of the votes becomes a highway.",
    defaults: { ...HOUGH_DEFAULTS } as HoughOptions,
    schema: HOUGH_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<HoughOptions>) => houghPlan(input, o),
  }),
  ridges: defineStrategy({
    step: "highway",
    name: "ridges",
    describe: "Ridges of the line density (HWY-032). The ridges of the blurred density of the edges become highways, and near edges snap to them.",
    defaults: { ...RIDGE_DEFAULTS } as RidgeOptions,
    schema: RIDGE_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<RidgeOptions>) => ridgePlan(input, o),
  }),
  hdbscan: defineStrategy({
    step: "highway",
    name: "hdbscan",
    describe: "HDBSCAN on edges (HWY-028). The density clusters of the edges that live over a long range become highways.",
    defaults: { ...HDBSCAN_DEFAULTS } as HdbscanOptions,
    schema: HDBSCAN_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<HdbscanOptions>) => hdbscanPlan(input, o),
  }),
  "hub-arcs": defineStrategy({
    step: "highway",
    name: "hub-arcs",
    describe: "Hub arc location (HWY-042). A greedy pass with swaps chooses at most q arcs from the candidates, and each edge rides its best arc.",
    defaults: { ...HUB_ARC_DEFAULTS } as HubArcOptions,
    schema: HUB_ARC_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<HubArcOptions>) => hubArcPlan(input, o),
  }),
  divided: defineStrategy({
    step: "highway",
    name: "divided",
    describe: "Divided edge bundling (HWY-011). Each highway of two-way traffic splits into two carriageways at an offset, one for each direction.",
    defaults: { ...DIVIDED_DEFAULTS } as DividedOptions,
    schema: DIVIDED_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<DividedOptions>) => dividedPlan(input, o),
  }),
  hierarchy: defineStrategy({
    step: "highway",
    name: "hierarchy",
    describe: "Hierarchical edge bundling (HWY-001). Each edge goes near the hubs of the sections between its two leaves, and the shared stretches become highways.",
    defaults: { ...HIERARCHY_DEFAULTS } as HierarchyOptions,
    schema: HIERARCHY_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<HierarchyOptions>) => hierarchyPlan(input, o),
  }),
  fdeb: defineStrategy({
    step: "highway",
    name: "fdeb",
    describe: "Force-directed edge bundling with a field of the boxes (HWY-002 with RULE-002). The bundled points snap back to legal ways.",
    defaults: { ...FDEB_DEFAULTS } as FdebOptions,
    schema: FDEB_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<FdebOptions>) => fdebPlan(input, o),
  }),
  mesh: defineStrategy({
    step: "highway",
    name: "mesh",
    describe: "A control mesh (HWY-004). The crossings of the edges with the mesh form clusters, and the edges of a cluster share its point.",
    defaults: { ...MESH_DEFAULTS } as MeshOptions,
    schema: MESH_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<MeshOptions>) => meshPlan(input, o),
  }),
  kdeeb: defineStrategy({
    step: "highway",
    name: "kdeeb",
    describe: "Density bundling with a mask of the free space (RULE-028 with HWY-006). The edges move up the density, and the ridges become highways.",
    defaults: { ...KDEEB_DEFAULTS } as KdeebOptions,
    schema: KDEEB_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<KdeebOptions>) => kdeebPlan(input, o),
  }),
  cubu: defineStrategy({
    step: "highway",
    name: "cubu",
    describe: "Fast density bundling (HWY-007). The steps of `kdeeb` with a separable blur or a Fourier transform of the counts of the cells.",
    defaults: { ...CUBU_DEFAULTS } as CubuOptions,
    schema: CUBU_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<CubuOptions>) => cubuPlan(input, o),
  }),
  mlseb: defineStrategy({
    step: "highway",
    name: "mlseb",
    describe: "Moving least squares bundling (HWY-008). Each point of an edge moves to a local fit of the near edges, and the bundled points snap back to legal ways.",
    defaults: { ...MLSEB_DEFAULTS } as MlsebOptions,
    schema: MLSEB_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<MlsebOptions>) => mlsebPlan(input, o),
  }),
  sbeb: defineStrategy({
    step: "highway",
    name: "sbeb",
    describe: "Skeleton-based edge bundling (HWY-009). The edges of a group move toward the skeleton of their shape, and the bundled points snap back to legal ways.",
    defaults: { ...SBEB_DEFAULTS } as SbebOptions,
    schema: SBEB_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<SbebOptions>) => sbebPlan(input, o),
  }),
  areas: defineStrategy({
    step: "highway",
    name: "areas",
    describe: "Image-based edge bundles (HWY-010). Each group of edges is one shaded area around the longest path of the skeleton of its shape.",
    defaults: { ...AREA_DEFAULTS } as AreaOptions,
    schema: AREA_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<AreaOptions>) => areaPlan(input, o),
  }),
  confluent: defineStrategy({
    step: "highway",
    name: "confluent",
    describe: "Confluent drawings (HWY-013). Each biclique of a greedy search is one track, with a merge junction and a split junction.",
    defaults: { ...CONFLUENT_DEFAULTS } as ConfluentOptions,
    schema: CONFLUENT_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<ConfluentOptions>) => confluentPlan(input, o),
  }),
  power: defineStrategy({
    step: "highway",
    name: "power",
    describe: "Edge compression with modules and power graphs (HWY-014). The edges between two modules are one power edge, and a large power edge is a highway.",
    defaults: { ...POWER_DEFAULTS } as PowerOptions,
    schema: POWER_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<PowerOptions>) => powerPlan(input, o),
  }),
  crossbars: defineStrategy({
    step: "highway",
    name: "crossbars",
    describe: "Bundled crossings (HWY-022). Two sets of edges that cross near one place cross as two bundles, at one place.",
    defaults: { ...CROSSBAR_DEFAULTS } as CrossbarOptions,
    schema: CROSSBAR_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<CrossbarOptions>) => crossbarPlan(input, o),
  }),
  frechet: defineStrategy({
    step: "highway",
    name: "frechet",
    describe: "Subtrajectory clusters by the discrete Fréchet distance (HWY-027). The parts of the first routes that stay near one reference part become highways.",
    defaults: { ...FRECHET_DEFAULTS } as FrechetOptions,
    schema: FRECHET_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<FrechetOptions>) => frechetPlan(input, o),
  }),
  spectral: defineStrategy({
    step: "highway",
    name: "spectral",
    describe: "Spectral clustering of the compatibility graph of the edges (HWY-029). The largest eigengap gives the number of clusters, and each cluster gets highways.",
    defaults: { ...SPECTRAL_DEFAULTS } as SpectralOptions,
    schema: SPECTRAL_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<SpectralOptions>) => spectralPlan(input, o),
  }),
  resistance: defineStrategy({
    step: "highway",
    name: "resistance",
    describe: "Spectral bundling with the effective resistance (HWY-021). A pair of two bridges of the graph gets a lower weight, then the clusters of `spectral` apply.",
    defaults: { ...RESISTANCE_DEFAULTS } as ResistanceOptions,
    schema: RESISTANCE_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<ResistanceOptions>) => resistancePlan(input, o),
  }),
  "link-communities": defineStrategy({
    step: "highway",
    name: "link-communities",
    describe: "Link communities on the line graph (HWY-030). The edges with a common node and similar neighbours form communities, and each community gets highways.",
    defaults: { ...LINK_COMMUNITY_DEFAULTS } as LinkCommunityOptions,
    schema: LINK_COMMUNITY_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<LinkCommunityOptions>) => linkCommunityPlan(input, o),
  }),
  territories: defineStrategy({
    step: "highway",
    name: "territories",
    describe: "Territory aggregation of flows (HWY-033). The plugs and bends form cells, and the strong flows between two neighbour cells become highways.",
    defaults: { ...TERRITORY_DEFAULTS } as TerritoryOptions,
    schema: TERRITORY_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<TerritoryOptions>) => territoryPlan(input, o),
  }),
  consensus: defineStrategy({
    step: "highway",
    name: "consensus",
    describe: "A consensus of clusterings (HWY-035). The finders vote on the pairs of edges, and the pairs that most finders agree on form the highways.",
    defaults: { ...CONSENSUS_DEFAULTS } as ConsensusOptions,
    schema: CONSENSUS_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<ConsensusOptions>) => consensusPlan(input, o),
  }),
  "p-hub": defineStrategy({
    step: "highway",
    name: "p-hub",
    describe: "Hub location with the p-hub median (HWY-041). The p-median of the plugs gives the hubs, and the links between two hubs become highways.",
    defaults: { ...P_HUB_DEFAULTS } as PHubOptions,
    schema: P_HUB_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<PHubOptions>) => pHubPlan(input, o),
  }),
  "scale-space": defineStrategy({
    step: "highway",
    name: "scale-space",
    describe: "A scale space with persistence (HWY-053). The clusters of edges that live over a long range of scales get highways at the scale of the plan.",
    defaults: { ...SCALE_SPACE_DEFAULTS } as ScaleSpaceOptions,
    schema: SCALE_SPACE_SCHEMA,
    maxNodes: 10_000,
    run: (input: HighwayInput, o: Readonly<ScaleSpaceOptions>) => scaleSpacePlan(input, o),
  }),
  "corridors+breakeven": gateStrategy(corridors, breakEvenGate),
  "corridors+stretch": gateStrategy(corridors, stretchGate),
  "corridors+ambiguity": gateStrategy(corridors, ambiguityGate),
  "corridors+hysteresis": gateStrategy(corridors, hysteresisGate),
  "corridors+ids": gateStrategy(corridors, stableIdGate),
});

/** The built-in strategies of each step, in order. A consumer adds its own: `createRegistry([...BUILT_IN_STRATEGIES, mine])`. */
export const BUILT_IN_STRATEGIES: readonly AnyStrategy[] = Object.freeze([
  ...Object.values(groupStrategies),
  ...Object.values(routerStrategies),
  ...Object.values(highwayStrategies),
  ...Object.values(curveStrategies),
  ...Object.values(roomStrategies),
]);

/** The registry of the built-in strategies. The benchmark and the site take their lists from it. */
export const STRATEGIES: Registry = createRegistry(BUILT_IN_STRATEGIES);
