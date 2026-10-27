import type { CutOptions } from "../groups/cut/index.ts";
import type { KdOptions } from "../groups/kd/index.ts";
import type { KeyOptions } from "../groups/keys/index.ts";
import type { CorridorOptions } from "../highways/corridors/index.ts";
import type { CornersOptions } from "../routers/corners.ts";
import type { SectionsOptions } from "../routers/sections.ts";
import type { SharedOptions } from "../routers/shared.ts";
import type { TrunksOptions } from "../routers/trunks.ts";
import type { SectionOptions } from "../sections.ts";
import type { WayOptions } from "../ways.ts";
import type { RunOrder } from "../segments.ts";
import type { ClothoidStrategyOptions, HighwayStrategyOptions, LevelRoomPreset, RadiusOptions, RoomPreset, RouterPreset, SmoothStrategyOptions, TensionOptions } from "./builtins.ts";
import type { EnumOption, OptionSchema } from "./options.ts";

// The declarations of the options of the built-in strategies. Each `default` is the value that the function uses without the option.
// The test of the defaults runs each strategy with `optionDefaults` and with no option, and compares the output.

/** The options of the way finder (`WayOptions`), for each router that goes around the nodes. */
const WAY_SCHEMA: OptionSchema<WayOptions> = {
  margin: { type: "number", min: 1, max: 20, step: 1, default: 5, describe: "The distance from a box to the corners of the graph." },
  k: { type: "integer", min: 2, max: 16, step: 1, default: 8, describe: "The number of visible neighbours of each corner." },
  smooth: { type: "boolean", default: false, describe: "With `true`, a way in clear view uses the inflection rule, and the other ways get round corners." },
};

/** The declaration of the lane order of the shared ways of the routers `trunks` and `shared`. */
const LANE_ORDER: EnumOption<RunOrder> = {
  type: "enum",
  values: ["bundle", "run"],
  default: "bundle",
  describe: "With `bundle`, two edges keep one lane order on each shared way of their common stretch. With `run`, each shared way gets its order alone.",
};

/** The declaration of the lane order of the runs of the router `sections`. The default keeps the lane order of version 0.2.0. */
const RUN_LANE_ORDER: EnumOption<RunOrder> = { ...LANE_ORDER, default: "run" };

/** The declarations of the options of the routers `corners` and `corners-smooth`. */
export const CORNERS_SCHEMA: OptionSchema<RouterPreset<CornersOptions>> = {
  ...WAY_SCHEMA,
  plugs: {
    type: "enum",
    values: ["facing", "side"],
    default: "facing",
    describe: "With `facing`, a free plug faces the other end. With `side`, the search starts from the whole free side, and the plug goes where the way leaves (WILD-001).",
  },
  plugGap: {
    type: "number",
    min: 0,
    max: 24,
    step: 1,
    default: 0,
    describe: "With a gap above 0, the free plugs of a side keep their order and at least this gap (WILD-002). 0 keeps each plug where it is.",
  },
};

/** The declarations of the options of the router `trunks`. */
export const TRUNKS_SCHEMA: OptionSchema<RouterPreset<TrunksOptions>> = {
  ...WAY_SCHEMA,
  rule: { type: "function", describe: "The grouping rule. The edges from one plug with one key share a trunk." },
  split: { type: "number", min: 0.1, max: 0.9, step: 0.05, default: 0.5, describe: "The split point is at this share of the way to the center of the targets." },
  minSize: { type: "integer", min: 1, max: 8, step: 1, default: 2, describe: "A group with fewer edges stays unbundled." },
  laneOrder: LANE_ORDER,
  leave: {
    type: "enum",
    values: ["part", "split"],
    default: "part",
    describe: "With `part`, a lane leaves the trunk where its way parts from the other ways. With `split`, each lane leaves at the split point.",
  },
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
  laneOrder: LANE_ORDER,
};

/** The declarations of the options of the highway strategy `corridors` (HWY-031). */
export const CORRIDOR_SCHEMA: OptionSchema<CorridorOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  rho: { type: "number", min: 0.1, max: 0.8, step: 0.05, default: 0.3, describe: "Two edges join when their common links are this share of the shorter way, or longer." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
  hashes: { type: "integer", min: 16, max: 128, step: 16, scale: "log", marks: [16, 32, 64, 128], default: 64, describe: "The number of hash functions of the signature of a way." },
  bands: { type: "integer", min: 4, max: 32, step: 4, scale: "log", marks: [4, 8, 16, 32], default: 32, describe: "The number of bands of the signature. Two ways with one equal band are a candidate pair." },
  near: { type: "number", min: 0, max: 8, step: 1, default: 0, describe: "Two link ends nearer than this grid size are one point. With 0, only equal points are one point." },
  lane: { type: "number", min: 1, max: 16, step: 1, default: 4, describe: "The gap between two lanes. A common stretch shorter than the break-even overlap for this gap does not join two edges." },
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
  laneOrder: RUN_LANE_ORDER,
};

/** The declarations of the option of the curves `rounded` and `arc`. */
export const RADIUS_SCHEMA: OptionSchema<RadiusOptions> = {
  radius: { type: "number", min: 0, max: 48, step: 1, describe: "The radius of the corners." },
};

/** The declarations of the options of the curve `highway`. */
export const HIGHWAY_SCHEMA: OptionSchema<HighwayStrategyOptions> = {
  ...RADIUS_SCHEMA,
  minRadius: { type: "number", min: 0, max: 24, step: 1, describe: "The smallest radius of a lane at a bend of a bundle." },
  jog: {
    type: "enum",
    values: ["biarc", "cubic", "quintic"],
    default: "biarc",
    describe: "The shape of the S curve where a lane changes its offset. A `quintic` S curve has no jump of the curvature.",
  },
  jogPieces: { type: "integer", min: 1, max: 8, step: 1, default: 4, describe: "The number of cubic pieces of a `quintic` S curve." },
};

/** The declarations of the options of the curve `smooth`. */
export const SMOOTH_SCHEMA: OptionSchema<SmoothStrategyOptions> = {
  ...RADIUS_SCHEMA,
  smoothing: { type: "number", min: 0, max: 1, step: 0.05, describe: "The share of the turn of a corner in its two spirals. The value 0 gives the curve `arc`." },
};

/** The declarations of the options of the curve `clothoid`. */
export const CLOTHOID_SCHEMA: OptionSchema<ClothoidStrategyOptions> = {
  ...RADIUS_SCHEMA,
  spiral: { type: "number", min: 0, max: 1, step: 0.05, describe: "The share of the turn of a corner in its two clothoids. The value 0 gives the curve `arc`." },
  tolerance: { type: "number", min: 0.05, max: 1, step: 0.05, describe: "The largest distance from the cubic pieces to the true clothoid." },
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
  bends: {
    type: "object",
    describe: "The room for the bends of the bundles: a router that bundles, and the lane options of `highwayCurves`. Without it, the bends get no room.",
  },
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

/** The declarations of the limits of the tree of the grouping rules `kd` and `cut`. */
const SPLIT_TREE_SCHEMA: OptionSchema<Required<Pick<KdOptions, "cap" | "maxDepth" | "fanout">>> = {
  cap: { ...SECTION_SCHEMA.cap, describe: "The section limit. A section with more nodes splits." },
  maxDepth: SECTION_SCHEMA.maxDepth,
  fanout: { type: "integer", min: 2, max: 4, step: 2, default: 4, describe: "The number of children of a section. With 4, a section splits two times on one level." },
};

/** The declarations of the options of the grouping rule `kd`. */
export const KD_SCHEMA: OptionSchema<KdOptions> = {
  ...SPLIT_TREE_SCHEMA,
  line: { type: "enum", values: ["median", "middle", "slide"], default: "slide", describe: "The place of the line in the cell: the median node, the middle, or the middle that slides to the nearest node." },
  axis: { type: "enum", values: ["longer", "alternate"], default: "longer", describe: "The axis of each split: across the longer side of the cell, or x and y in turn." },
};

/** The declarations of the options of the grouping rule `cut`. */
export const CUT_SCHEMA: OptionSchema<CutOptions> = {
  ...SPLIT_TREE_SCHEMA,
  balance: { type: "number", min: 0.05, max: 0.5, step: 0.05, marks: [0.1, 0.25, 0.4], default: 0.25, describe: "The smallest share of the nodes in each part of a split." },
  objective: { type: "enum", values: ["ratio", "normalized", "sparsest"], default: "ratio", describe: "The cost of a line: the ratio cut, the normalized cut or the sparsest cut." },
  pull: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 0.5, 1, 2, 4], default: 0.5, describe: "The cost of a line grows with its distance from the middle of the cell, by this factor." },
  guard: { type: "boolean", default: true, describe: "With `true`, each section also tests the quadtree split, and keeps the split that cuts fewer edges." },
};
