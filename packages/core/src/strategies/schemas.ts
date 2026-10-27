import type { KeyOptions } from "../groups/keys/index.ts";
import type { CornersOptions } from "../routers/corners.ts";
import type { SectionsOptions } from "../routers/sections.ts";
import type { SharedOptions } from "../routers/shared.ts";
import type { TrunksOptions } from "../routers/trunks.ts";
import type { SectionOptions } from "../sections.ts";
import type { HighwayStrategyOptions, LevelRoomPreset, RadiusOptions, RoomPreset, RouterPreset, TensionOptions } from "./builtins.ts";
import type { OptionSchema } from "./options.ts";

// The declarations of the options of the built-in strategies. Each `default` is the value that the function uses without the option.
// The test of the defaults runs each strategy with `optionDefaults` and with no option, and compares the output.

/** The options of the way finder (`WayOptions`), for each router that goes around the nodes. */
const WAY_SCHEMA: OptionSchema<RouterPreset<CornersOptions>> = {
  margin: { type: "number", min: 1, max: 20, step: 1, default: 5, describe: "The distance from a box to the corners of the graph." },
  k: { type: "integer", min: 2, max: 16, step: 1, default: 8, describe: "The number of visible neighbours of each corner." },
  smooth: { type: "boolean", default: false, describe: "With `true`, a way in clear view uses the inflection rule, and the other ways get round corners." },
};

/** The declarations of the options of the routers `corners` and `corners-smooth`. */
export const CORNERS_SCHEMA: OptionSchema<RouterPreset<CornersOptions>> = WAY_SCHEMA;

/** The declarations of the options of the router `trunks`. */
export const TRUNKS_SCHEMA: OptionSchema<RouterPreset<TrunksOptions>> = {
  ...WAY_SCHEMA,
  rule: { type: "function", describe: "The grouping rule. The edges from one plug with one key share a trunk." },
  split: { type: "number", min: 0.1, max: 0.9, step: 0.05, default: 0.5, describe: "The split point is at this share of the way to the center of the targets." },
  minSize: { type: "integer", min: 1, max: 8, step: 1, default: 2, describe: "A group with fewer edges stays unbundled." },
};

/** The declarations of the options of the routers `shared` and `shared-all`. */
export const SHARED_SCHEMA: OptionSchema<RouterPreset<SharedOptions>> = {
  ...WAY_SCHEMA,
  rule: { type: "function", describe: "The edges with one key share their ways. Without a rule, all edges share." },
  discount: {
    type: "number",
    min: 0.05,
    max: 1,
    step: 0.05,
    default: 0.5,
    describe: "The cost of a link that an edge with the same key uses already, as a share of its length.",
  },
};

/** The declarations of the limits of the tree of sections (`SectionOptions`). */
export const SECTION_SCHEMA: OptionSchema<Required<SectionOptions>> = {
  cap: { type: "integer", min: 1, max: 32, step: 1, scale: "log", marks: [4, 6, 8, 12, 16], default: 8, describe: "The section limit. A section with more nodes splits in four." },
  maxDepth: { type: "integer", min: 1, max: 32, step: 1, default: 16, describe: "The depth limit of the tree." },
  collapse: { type: "integer", min: 1, max: 64, step: 1, default: 32, describe: "A cell shrinks to one quarter at most this many times without a split." },
};

/** The declarations of the options of the routers `sections` and `sections-tree`. */
export const SECTIONS_SCHEMA: OptionSchema<RouterPreset<SectionsOptions>> = {
  ...WAY_SCHEMA,
  ...SECTION_SCHEMA,
  hubs: {
    type: "integer",
    min: 0,
    max: 8,
    step: 1,
    special: [Infinity],
    default: Infinity,
    describe: "The number of hubs on each side of the lowest common section that a way passes. `Infinity` passes each hub.",
  },
  stretch: {
    type: "number",
    min: 1,
    max: 4,
    step: 0.25,
    special: [Infinity],
    marks: [1.25, 1.5, 2, 3, Infinity],
    default: 2,
    describe: "The hub limit. A way through the hubs is at most this many times the straight line. `Infinity` keeps each such way.",
  },
  stretchPad: { type: "number", min: 0, max: 16, step: 1, default: 4, describe: "A way through the hubs can be this many margins longer than the hub limit." },
  hubSlack: {
    type: "number",
    min: 0,
    max: 320,
    step: 10,
    special: [Infinity],
    marks: [0, 40, 80, 160, Infinity],
    default: 80,
    describe: "A way skips a hub that is this many units farther from the target than the way was before.",
  },
  tightMargin: { type: "number", min: 0, max: 5, step: 0.5, default: 1, describe: "The margin of the second corner graph of the level links." },
  plugInset: { type: "number", min: 0, max: 12, step: 1, default: 6, describe: "A plug of a level link stays this far from the corners of its side." },
  throughCost: {
    type: "number",
    min: 0,
    max: 16,
    step: 1,
    marks: [0, 2, 4, 8, 16],
    default: 8,
    describe: "The cost of a level link through a far box, in mean box sizes. The value 0 gives the links of version 0.1.5.",
  },
  group: { type: "strategy", step: "group", describe: "The grouping rule: a strategy of the step `group`. Without it, the router uses the quadtree." },
  groupOptions: { type: "object", describe: "The options of the strategy `group`." },
  levels: { type: "list", describe: "The depths of the tree that get a level with groups. Without it, each depth gets a level." },
};

/** The declarations of the option of the curves `rounded` and `arc`. */
export const RADIUS_SCHEMA: OptionSchema<RadiusOptions> = {
  radius: { type: "number", min: 0, max: 48, step: 1, describe: "The radius of the corners." },
};

/** The declarations of the options of the curve `highway`. */
export const HIGHWAY_SCHEMA: OptionSchema<HighwayStrategyOptions> = {
  ...RADIUS_SCHEMA,
  minRadius: { type: "number", min: 0, max: 24, step: 1, describe: "The smallest radius of a lane at a bend of a bundle." },
};

/** The declarations of the option of the curve `spline`. */
export const TENSION_SCHEMA: OptionSchema<TensionOptions> = {
  tension: { type: "number", min: 0, max: 1, step: 0.05, describe: "The tension of the spline, from 0 (the spline) to 1 (the polyline)." },
};

/** The declarations of the options of the room strategies: the options of `roomDemand`, without the method. */
export const ROOM_SCHEMA: OptionSchema<RoomPreset> = {
  gutter: { type: "number", min: 0, max: 32, step: 1, marks: [4, 8, 12, 16], default: 8, describe: "The smallest width of each gap." },
  spacing: { type: "number", min: 1, max: 12, step: 1, marks: [2, 4, 6, 8], default: 4, describe: "The width of one lane: the distance between two lines that run side by side." },
  maxGrowth: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    special: [Infinity],
    marks: [0, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.25, 0.3, 0.35, 0.5, Infinity],
    default: Infinity,
    describe: "The largest growth of the board on each axis, as a share of its size. `Infinity` sets no limit.",
  },
  router: { type: "object", describe: "The router of the method `routes`. Without it, the links go as the links of a zoom level." },
  lanes: { type: "enum", values: ["link", "count"], default: "link", describe: "With `count`, a link takes one lane for each of its edges. With `link`, a link takes one lane." },
  snap: { type: "number", min: 0, max: 4, step: 0.25, default: 0.5, describe: "Two box edges nearer than this distance make one boundary of the sweep." },
  passes: { type: "integer", min: 1, max: 4, step: 1, marks: [1, 2], default: 1, describe: "The number of passes of the demand. Each pass after the first finds the lanes on the open board." },
};

/** The declarations of the options of the room strategy `levels`. They are the options of the room, the levels with room and the limits of the quadtree. */
export const LEVEL_ROOM_SCHEMA: OptionSchema<LevelRoomPreset> = {
  ...ROOM_SCHEMA,
  depths: { type: "list", describe: "The depths of the tree that get room. Without it, each depth with groups gets room." },
  nodes: { type: "boolean", default: false, describe: "With `true`, the last level, with each node alone, also gets room." },
  board: { type: "enum", values: ["shared", "each"], default: "shared", describe: "With `shared`, each level uses the board of the nearest level. With `each`, each level has its own board." },
  ...SECTION_SCHEMA,
};

/** The declarations of the options of the grouping rule `keys`. */
export const KEY_SCHEMA: OptionSchema<KeyOptions> = {
  key: { type: "function", describe: "This function gives the key of the group of each node." },
  split: { type: "object", describe: "With these limits of the quadtree, a large group splits into cells. Without them, each group is one leaf." },
};
