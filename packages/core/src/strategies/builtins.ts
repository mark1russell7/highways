import { arcCurve, type ArcOptions } from "../curves/arc/index.ts";
import { highwayCurve } from "../curves/highway/index.ts";
import { roundedCurve, type RoundedOptions } from "../curves/rounded/index.ts";
import { splineCurve, type SplineOptions } from "../curves/spline/index.ts";
import { straightCurve } from "../curves/straight/index.ts";
import { byDataGroup, keyGroups, type KeyOptions } from "../groups/keys/index.ts";
import { quadtreeGroups } from "../groups/quadtree/index.ts";
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
import { createRegistry, defineStrategy, type AnyStrategy, type CurveInput, type Registry, type Strategy } from "./model.ts";
import type { OptionSchema } from "./options.ts";
import { CORNERS_SCHEMA, HIGHWAY_SCHEMA, KEY_SCHEMA, LEVEL_ROOM_SCHEMA, RADIUS_SCHEMA, ROOM_SCHEMA, SECTION_SCHEMA, SECTIONS_SCHEMA, SHARED_SCHEMA, TENSION_SCHEMA, TRUNKS_SCHEMA } from "./schemas.ts";

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

/** The options of the curve strategy `highway`. */
export interface HighwayStrategyOptions {
  /** The radius of the center line of a bundle at a bend, and of each lone corner. The default is 12. */
  readonly radius: number;
  /** The smallest radius of a lane at a bend of a bundle. The default is 4. */
  readonly minRadius: number;
}

/**
 * The built-in curve strategies. The first four are in the order of `CURVE_TYPES`, and each one gives the same segments as `curveOf` with its type.
 * The strategy `highway` gives the curve of `arc` for one polyline. `highwayCurves` bends the lanes of a bundle as one.
 */
export const curveStrategies: {
  readonly straight: Strategy<"curve", object>;
  readonly rounded: Strategy<"curve", RadiusOptions>;
  readonly spline: Strategy<"curve", TensionOptions>;
  readonly arc: Strategy<"curve", RadiusOptions>;
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
  highway: defineStrategy({
    step: "curve",
    name: "highway",
    describe: "The lanes of a bundle bend as one, with concentric arcs at the lane spacing. One lane alone gets the curve of `arc`.",
    defaults: { radius: 12, minRadius: 4 },
    schema: HIGHWAY_SCHEMA,
    run: (input: CurveInput, o: Readonly<HighwayStrategyOptions>) => highwayCurve(input.points, { radius: o.radius, ...(input.space ? { space: input.space } : {}) }),
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
});

/** The built-in strategies of each step, in order. A consumer adds its own: `createRegistry([...BUILT_IN_STRATEGIES, mine])`. */
export const BUILT_IN_STRATEGIES: readonly AnyStrategy[] = Object.freeze([
  ...Object.values(groupStrategies),
  ...Object.values(routerStrategies),
  ...Object.values(curveStrategies),
  ...Object.values(roomStrategies),
]);

/** The registry of the built-in strategies. The benchmark and the site take their lists from it. */
export const STRATEGIES: Registry = createRegistry(BUILT_IN_STRATEGIES);
