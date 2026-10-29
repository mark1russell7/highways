import type { AreaOptions } from "../highways/areas/index.ts";
import type { ConfluentOptions, GroupScope } from "../highways/confluent/index.ts";
import type { CrossbarOptions } from "../highways/crossbars/index.ts";
import type { FrechetOptions } from "../highways/frechet/index.ts";
import type { MlsebOptions } from "../highways/mlseb/index.ts";
import type { PowerOptions } from "../highways/power/index.ts";
import type { SbebOptions } from "../highways/sbeb/index.ts";
import type { CutOptions } from "../groups/cut/index.ts";
import type { KdOptions } from "../groups/kd/index.ts";
import type { KeyOptions } from "../groups/keys/index.ts";
import type { HighwayBase } from "../highways/base.ts";
import type { CorridorOptions } from "../highways/corridors/index.ts";
import type { ConsensusOptions } from "../highways/consensus/index.ts";
import type { CubuOptions } from "../highways/cubu/index.ts";
import type { DiffusionOptions } from "../highways/diffusion/index.ts";
import type { DividedOptions } from "../highways/divided/index.ts";
import type { EdgePathOptions } from "../highways/edge-paths/index.ts";
import type { FdebOptions } from "../highways/fdeb/index.ts";
import type { FlowClusterOptions } from "../highways/flow-clusters/index.ts";
import type { FlowFieldOptions } from "../highways/flow-field/index.ts";
import type { GrowthOptions } from "../highways/growth/index.ts";
import type { GroupSpine } from "../highways/grouped.ts";
import type { HdbscanOptions } from "../highways/hdbscan/index.ts";
import type { HierarchyOptions } from "../highways/hierarchy/index.ts";
import type { HoughOptions } from "../highways/hough/index.ts";
import type { HubArcOptions } from "../highways/hub-arcs/index.ts";
import type { KdeebOptions } from "../highways/kdeeb/index.ts";
import type { LanesOptions } from "../highways/lanes/index.ts";
import type { LevelHighwayOptions } from "../highways/level-links/index.ts";
import type { LinkCommunityOptions } from "../highways/link-communities/index.ts";
import type { MeetOptions } from "../highways/meet/index.ts";
import type { MeshOptions } from "../highways/mesh/index.ts";
import type { MingleOptions } from "../highways/mingle/index.ts";
import type { NestedOptions } from "../highways/nested/index.ts";
import type { OdCellOptions } from "../highways/od-cells/index.ts";
import type { PHubOptions } from "../highways/p-hub/index.ts";
import type { QuickBundlesOptions } from "../highways/quickbundles/index.ts";
import type { ResistanceOptions } from "../highways/resistance/index.ts";
import type { RidgeOptions } from "../highways/ridges/index.ts";
import type { RoadClassOptions } from "../highways/road-classes/index.ts";
import type { ScaleSpaceOptions } from "../highways/scale-space/index.ts";
import type { GapOptions } from "../highways/gaps/index.ts";
import type { InterchangeOptions } from "../highways/interchanges/index.ts";
import type { KneeOptions } from "../highways/knee/index.ts";
import type { BronchialOptions } from "../highways/bronchial/index.ts";
import type { SearchOptions } from "../highways/search/index.ts";
import type { SteinerOptions } from "../highways/steiner/index.ts";
import type { StreetOptions } from "../highways/streets/index.ts";
import type { SelectOptions } from "../highways/select/index.ts";
import type { SoftKeyOptions } from "../highways/soft-keys/index.ts";
import type { SpectralOptions } from "../highways/spectral/index.ts";
import type { SpiralOptions } from "../highways/spiral/index.ts";
import type { StubOptions } from "../highways/stubs/index.ts";
import type { TerritoryOptions } from "../highways/territories/index.ts";
import type { TraclusOptions } from "../highways/traclus/index.ts";
import type { WeiszfeldOptions } from "../highways/weiszfeld/index.ts";
import type { WspdOptions } from "../highways/wspd/index.ts";
import type { ZipperOptions } from "../highways/zipper/index.ts";
import type { LaneStretchOptions } from "../lane-orders/stretch/index.ts";
import type { DepthLevelOptions } from "../levels/depths/index.ts";
import type { VenationOptions } from "../levels/venation/index.ts";
import type { BoardPortfolioOptions } from "../whole/portfolio/index.ts";
import type { CornersOptions } from "../routers/corners.ts";
import type { SectionsOptions } from "../routers/sections.ts";
import type { SharedOptions } from "../routers/shared.ts";
import { GROUP_RULE_NAMES, type GroupRuleName, type TrunksOptions } from "../routers/trunks.ts";
import type { SectionOptions } from "../sections.ts";
import type { WayOptions } from "../ways.ts";
import type { PipelineOptions } from "../whole/pipeline/index.ts";
import type { RunOrder } from "../segments.ts";
import type { ClothoidStrategyOptions, HighwayStrategyOptions, LevelRoomPreset, RadiusOptions, RoomPreset, RouterPreset, SmoothStrategyOptions, TensionOptions } from "./builtins.ts";
import type { EnumOption, NumberOption, OptionSchema } from "./options.ts";

// The declarations of the options of the built-in strategies. Each `default` is the value that the function uses without the option.
// The test of the defaults runs each strategy with `optionDefaults` and with no option, and compares the output.

/** The options of the way finder (`WayOptions`), for each router that goes around the nodes. */
const WAY_SCHEMA: OptionSchema<WayOptions> = {
  margin: { type: "number", min: 1, max: 20, step: 1, default: 5, describe: "The distance from a box to the corners of the graph." },
  k: { type: "integer", min: 2, max: 16, step: 1, default: 8, describe: "The number of visible neighbours of each corner." },
  smooth: { type: "boolean", default: false, describe: "With `true`, a way in clear view uses the inflection rule, and the other ways get round corners." },
};

/** The declarations of the options of the stretch order (LANE-STRETCH): the method and the passes of `sifting`. A generator can list each value. */
export const LANE_STRETCH_SCHEMA: OptionSchema<LaneStretchOptions> = {
  method: {
    type: "enum",
    values: ["none", "consensus", "periphery", "sifting"],
    default: "sifting",
    describe: "The order of each stretch: the order of each run alone, the order of the pair relation, the order of the largest run, or the order of the pair relation after sifting.",
  },
  passes: { type: "integer", min: 1, max: 4, step: 1, default: 2, describe: "The number of passes of the method `sifting`. In each pass, each edge moves to its best place." },
};

/**
 * The declaration of the grouping rule of the edges: a name of `GROUP_RULE_NAMES`. A new name of the list needs no change here.
 * The option also takes a rule of the caller (`custom`), so the old value form stays valid.
 * The `defaults` of a strategy keep the rule `byCollection`, and the declaration gives its name `collection` as its `default`.
 */
const EDGE_RULE: EnumOption<GroupRuleName> = { type: "enum", values: GROUP_RULE_NAMES, custom: "function", describe: "The grouping rule." };

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
  plug: { type: "strategy", step: "plugs", describe: "The plug rule: a strategy of the step `plugs`. Without it, the option `plugs` places the plugs." },
  plugOptions: { type: "object", describe: "The options of the strategy `plug`." },
  outside: {
    type: "enum",
    values: ["throw", "skip", "clamp"],
    default: "throw",
    describe: "The rule for a box outside the box of its frame: throw a `RangeError`, skip the box and its inner edges, or cut the box to the bounds.",
  },
  frameInset: {
    type: "number",
    min: 0,
    max: 20,
    step: 1,
    describe: "The distance from the walls of a frame to the bounds of its inner routes. Without a value, the inset is the margin.",
  },
};

/** The declarations of the options of the router `trunks`. */
export const TRUNKS_SCHEMA: OptionSchema<RouterPreset<TrunksOptions>> = {
  ...WAY_SCHEMA,
  rule: { ...EDGE_RULE, default: "collection", describe: "The grouping rule. The edges from one plug with one key share a trunk. With `all`, each edge has one key." },
  split: { type: "number", min: 0.1, max: 0.9, step: 0.05, default: 0.5, describe: "The split point is at this share of the way to the center of the targets." },
  minSize: { type: "integer", min: 1, max: 8, step: 1, default: 2, describe: "A group with fewer edges stays unbundled." },
  laneOrder: LANE_ORDER,
  leave: {
    type: "enum",
    values: ["part", "split"],
    default: "part",
    describe: "With `part`, a lane leaves the trunk where its way parts from the other ways. With `split`, each lane leaves at the split point.",
  },
  splitAt: {
    type: "enum",
    values: ["share", "gilbert"],
    default: "share",
    describe: "With `share`, the split point is at `split` of the way. With `gilbert`, it is where the flow cost is least (EDA-030).",
  },
  alpha: { type: "number", min: 0, max: 1, step: 0.05, default: 0.5, describe: "The exponent of the flow cost of the split `gilbert`. A smaller value moves the split toward the targets." },
  fan: {
    type: "enum",
    values: ["split", "tree"],
    default: "split",
    describe: "With `split`, the edges of a group share a trunk to a split point. With `tree`, they grow a balancing-factor tree (NAT-017).",
  },
  bf: { type: "number", min: 0, max: 1, step: 0.05, default: 0.4, describe: "The balancing factor of the fan `tree`. 0 gives the least ink, and a larger factor gives more direct routes." },
};

/** The declarations of the options of the router `shared` and of the highway strategy `shared-ways`. */
export const SHARED_SCHEMA: OptionSchema<RouterPreset<SharedOptions>> = {
  ...WAY_SCHEMA,
  rule: { ...EDGE_RULE, default: "collection", describe: "The edges with one key share their ways. With `collection`, the key is `data.collection`. With `all`, all edges share." },
  discount: {
    type: "number",
    min: 0.05,
    max: 1,
    step: 0.05,
    default: 0.5,
    describe: "The cost of a link that an edge with the same key uses already, as a share of its length.",
  },
  laneOrder: LANE_ORDER,
  cost: {
    type: "enum",
    values: ["fixed", "flow"],
    default: "fixed",
    describe: "With `fixed`, a shared link costs `discount` of its length. With `flow`, a link with `f` edges costs `len * f^alpha` (EDA-029).",
  },
  alpha: { type: "number", min: 0.1, max: 1, step: 0.05, default: 0.6, describe: "The exponent of the cost `flow`. A smaller value gives more sharing." },
  passes: { type: "integer", min: 1, max: 5, step: 1, default: 1, describe: "In each pass after the first, each edge finds its way again with the ways of the other edges fixed (HWY-039)." },
  order: {
    type: "enum",
    values: ["span", "shortest", "load", "input"],
    default: "span",
    describe: "The order of the edges of a key: the longest first, the shortest first, the most edges between two sections first, or the input order (NAT-024).",
  },
  reuse: {
    type: "number",
    min: 0,
    max: 2,
    step: 0.25,
    default: 0,
    describe: "With a value above 0, each later pass routes the edges again, and the busy links of the pass before cost less (HWY-005).",
  },
  reuseExponent: { type: "number", min: 0.5, max: 2, step: 0.25, default: 1, describe: "The exponent of the pull of the busy links of the option `reuse`." },
  capacity: {
    type: "number",
    min: 0,
    max: 10,
    step: 0.5,
    default: 0,
    describe: "With a value above 0, a link costs more for each lane that does not fit in the free space across it (HWY-016).",
  },
  laneWidth: { type: "number", min: 2, max: 8, step: 1, default: 4, describe: "The width of one lane, for the option `capacity`." },
  merge: {
    type: "enum",
    values: ["corner", "snell"],
    default: "corner",
    describe: "With `corner`, a route joins a run at a corner of the graph. With `snell`, it joins at the angle `acos(d)` (NAT-035).",
  },
  stretchOrder: {
    ...LANE_STRETCH_SCHEMA.method,
    default: "none",
    describe: "With `none`, each run gets its lane order alone. With the other values, the runs that follow each other share one order (LANE-STRETCH).",
  },
  siftPasses: LANE_STRETCH_SCHEMA.passes,
};

/** The declarations of the options of the router `shared-all`. It sets no rule, so all edges share. Thus its rule has no `default`. */
export const SHARED_ALL_SCHEMA: OptionSchema<RouterPreset<SharedOptions>> = {
  ...SHARED_SCHEMA,
  rule: { ...EDGE_RULE, describe: "The edges with one key share their ways. Without a rule, or with `all`, all edges share. With `collection`, the key is `data.collection`." },
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
  level: { type: "strategy", step: "levels", describe: "The level rule: a strategy of the step `levels`. Without it, the router uses the strategy `depths`." },
  levelOptions: { type: "object", describe: "The options of the strategy `level`. They go over the level options of the router." },
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

/** The declaration of the plan that a post step of the step `highway` changes (BUILD-W2B). */
const HIGHWAY_BASE: EnumOption<HighwayBase> = {
  type: "enum",
  values: ["none", "shared-ways", "corridors"],
  default: "shared-ways",
  describe: "The plan that the strategy changes: no highway, the highways of `shared-ways`, or the highways of `corridors`.",
};

/** The declarations of the options of the highway strategy `meet` (HWY-050). */
export const MEET_SCHEMA: OptionSchema<MeetOptions> = {
  from: HIGHWAY_BASE,
  near: { type: "number", min: 2, max: 40, step: 2, default: 8, describe: "A first route meets the spine where it is this distance from the spine, or nearer." },
  maxTurn: { type: "number", min: 10, max: 90, step: 5, default: 45, describe: "A first route meets the spine only where it runs at this angle to the spine, or less, in degrees." },
  minRun: { type: "number", min: 0, max: 80, step: 5, default: 10, describe: "A member keeps its places when the stretch where its first route meets the spine is shorter than this length." },
};

/** The declarations of the options of the highway strategy `weiszfeld` (HWY-043). */
export const WEISZFELD_SCHEMA: OptionSchema<WeiszfeldOptions> = {
  from: HIGHWAY_BASE,
  alpha: { type: "number", min: 0, max: 1, step: 0.1, default: 0.5, describe: "The weight of the trunk is `k^alpha` for `k` members." },
  steps: { type: "integer", min: 1, max: 50, step: 1, marks: [10, 20, 50], default: 20, describe: "The number of steps of Weiszfeld." },
};

/** The declarations of the options of the highway strategy `stubs` (HWY-015 with WILD-005). */
export const STUB_SCHEMA: OptionSchema<StubOptions> = {
  from: HIGHWAY_BASE,
  omega: { type: "number", min: 10, max: 60, step: 5, default: 30, describe: "The ends of one side of a box whose directions are in a window of this angle share a stub, in degrees." },
  sigma: { type: "number", min: 0.1, max: 0.4, step: 0.05, default: 0.25, describe: "The length of a stub is this share of the distance to the nearest other end." },
  ends: { type: "enum", values: ["source", "target", "both"], default: "both", describe: "The ends that get stubs." },
  minSize: { type: "integer", min: 2, max: 8, step: 1, default: 2, describe: "A stub has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `zipper` (NAT-022 with WILD-037). */
export const ZIPPER_SCHEMA: OptionSchema<ZipperOptions> = {
  from: HIGHWAY_BASE,
  near: { type: "number", min: 0.5, max: 3, step: 0.25, default: 1, describe: "Two legs zip when they are this distance apart or nearer, in units of the board." },
  maxAngle: { type: "number", min: 5, max: 30, step: 5, default: 15, describe: "Two legs zip when the angle between them is this value or less, in degrees." },
  adhesion: { type: "number", min: 0, max: 1, step: 0.1, default: 0.3, describe: "Two legs zip when this value times their overlap is more than the length that the zip adds." },
  minOverlap: { type: "number", min: 1, max: 5, step: 0.5, default: 1, describe: "Two legs zip when they overlap along this length or more, in units of the board." },
  passes: { type: "integer", min: 1, max: 5, step: 1, default: 1, describe: "The number of passes. Each pass routes the plan and zips the legs again." },
};

/** The declarations of the options of the highway strategy `level-links` (HWY-056 with WILD-034). */
export const LEVEL_HIGHWAY_SCHEMA: OptionSchema<LevelHighwayOptions> = {
  from: HIGHWAY_BASE,
  depth: { type: "integer", min: 1, max: 3, step: 1, default: 1, describe: "The depth of the level in the tree of sections." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A level link becomes a highway when this number of edges or more ride it." },
  stretch: { type: "number", min: 1.2, max: 2, step: 0.1, default: 1.5, describe: "An edge rides the link only when its way along the link is this many times its first route, or shorter." },
};

/** The declaration of the spine of a group of edges: the shared ways of the group, or one trunk between two terminals. */
const GROUP_SPINE: EnumOption<GroupSpine> = {
  type: "enum",
  values: ["shared", "trunk"],
  default: "shared",
  describe: "With `shared`, the edges of a group share their ways through the corner graph. With `trunk`, a group gets one trunk between two terminals.",
};

/** The declarations of the options of the highway strategy `quickbundles` (HWY-026). */
export const QUICKBUNDLES_SCHEMA: OptionSchema<QuickBundlesOptions> = {
  theta: { type: "number", min: 1, max: 10, step: 0.5, marks: [1.5, 3, 6], default: 3, describe: "An edge joins a cluster when its distance to the centroid is this value or less, in units of the board." },
  points: { type: "integer", min: 6, max: 24, step: 2, default: 12, describe: "The number of points of each line after the resampling." },
  line: { type: "enum", values: ["routes", "lines"], default: "routes", describe: "The line of each edge: its first route, or the straight line between its plugs." },
  order: { type: "enum", values: ["input", "length"], default: "input", describe: "The order of the edges in the pass: the order of the graph, or the longest line first." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A cluster with this number of edges or more gets highways." },
  spine: GROUP_SPINE,
};

/** The declarations of the options of the highway strategy `road-classes` (HWY-034 with EDA-050). */
export const ROAD_CLASS_SCHEMA: OptionSchema<RoadClassOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  quantile: { type: "number", min: 0.5, max: 0.99, step: 0.05, marks: [0.8, 0.9, 0.95], default: 0.9, describe: "A link is a highway link when its use is at this quantile of the use of the links, or higher." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway link and a highway have this number of edges or more." },
  discount: { type: "number", min: 0.1, max: 0.8, step: 0.1, default: 0.5, describe: "The second pass gives each highway link this discount, as a share of its length." },
};

/** The declarations of the options of the highway strategy `flow-field` (EDA-046 with HWY-037). */
export const FLOW_FIELD_SCHEMA: OptionSchema<FlowFieldOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  minFanIn: { type: "integer", min: 2, max: 10, step: 1, default: 2, describe: "An end with this number of edges or more on one side of its box gets a field." },
  end: { type: "enum", values: ["target", "source"], default: "target", describe: "The end that gets a field: the target of a fan-in, or the source of a fan-out." },
};

/** The declarations of the options of the highway strategy `wspd` (HWY-018). */
export const WSPD_SCHEMA: OptionSchema<WspdOptions> = {
  separation: { type: "number", min: 1, max: 8, step: 0.5, marks: [1, 2, 4], default: 2, describe: "The gap between the two sets of a pair is at least this value times the radius of the larger set." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 3, describe: "A pair with this number of edges or more gets a highway." },
  spine: { ...GROUP_SPINE, default: "trunk" },
};

/** The declarations of the options of the highway strategy `od-cells` (EDA-033 with WILD-032). */
export const OD_CELL_SCHEMA: OptionSchema<OdCellOptions> = {
  level: { type: "integer", min: 1, max: 4, step: 1, default: 2, describe: "The depth of the cells in the tree of sections." },
  minGroup: { type: "integer", min: 2, max: 8, step: 1, default: 3, describe: "A pair of cells with this number of edges or more gets a trunk." },
  legMax: { type: "number", min: 0.1, max: 1, step: 0.05, marks: [0.2, 0.3, 0.4], default: 0.3, describe: "An edge rides the trunk only when each of its legs is this share of the span or shorter." },
  spine: { ...GROUP_SPINE, default: "trunk" },
};

/** The declarations of the options of the highway strategy `select` (HWY-045). */
export const SELECT_SCHEMA: OptionSchema<SelectOptions> = {
  generators: { type: "list", default: ["corridors", "quickbundles", "wspd", "road-classes"], describe: "The highway strategies that propose the candidates." },
  lambda: { type: "number", min: 0, max: 4, step: 0.25, marks: [0.5, 1, 2], default: 1, describe: "The weight of the added length of the edges against the ink that a highway saves." },
  swaps: { type: "integer", min: 0, max: 5, step: 1, default: 2, describe: "The number of passes of the local search with one swap." },
};

/** The declarations of the options of the highway strategy `mingle` (HWY-003). */
export const MINGLE_SCHEMA: OptionSchema<MingleOptions> = {
  k: { type: "integer", min: 4, max: 16, step: 1, default: 8, describe: "Each bundle looks for a merge among this number of nearest bundles in 4D." },
  maxTurn: { type: "number", min: 20, max: 60, step: 5, marks: [20, 40, 60], default: 40, describe: "The largest turn of an edge at a meeting point, in degrees." },
  levels: { type: "integer", min: 1, max: 10, step: 1, default: 6, describe: "The number of levels of merges." },
  weight: { type: "number", min: 0.5, max: 1, step: 0.05, default: 1, describe: "The weight of the trunk in the ink. With 1, the trunk costs its length one time." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A bundle with this number of edges or more gets highways." },
  spine: { ...GROUP_SPINE, default: "trunk" },
};

/** The declarations of the options of the highway strategy `spiral` (HWY-017 with EDA-035). */
export const SPIRAL_SCHEMA: OptionSchema<SpiralOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  alpha: { type: "number", min: 10, max: 40, step: 5, marks: [15, 25, 35], default: 25, describe: "The spiral angle, in degrees: the largest angle between a branch and the line to the root." },
  minTargets: { type: "integer", min: 3, max: 20, step: 1, default: 4, describe: "A node with this number of edges or more gets a spiral tree." },
  arc: { type: "integer", min: 2, max: 8, step: 1, default: 4, describe: "The number of points of the arc of each branch." },
};

/** The declarations of the options of the highway strategy `flow-clusters` (HWY-023). */
export const FLOW_CLUSTER_SCHEMA: OptionSchema<FlowClusterOptions> = {
  tau: { type: "number", min: 0.1, max: 0.6, step: 0.05, marks: [0.2, 0.3, 0.45], default: 0.3, describe: "Two clusters join while their distance is this share of the length of the shorter edge, or less." },
  linkage: { type: "enum", values: ["average", "complete", "single"], default: "average", describe: "The distance of two clusters: the mean, the largest or the smallest distance of their edges." },
  directed: { type: "boolean", default: false, describe: "With this option, the source of one edge only compares with the source of the other edge." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A cluster with this number of edges or more gets highways." },
  spine: { ...GROUP_SPINE, default: "trunk" },
};

/** The declarations of the options of the highway strategy `traclus` (HWY-025). */
export const TRACLUS_SCHEMA: OptionSchema<TraclusOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  eps: { type: "number", min: 1, max: 6, step: 0.5, marks: [1, 2, 4], default: 2, describe: "Two segments are neighbours when their distance is this value or less, in units of the board." },
  minLns: { type: "integer", min: 2, max: 16, step: 1, default: 3, describe: "A cluster has segments of this number of edges or more." },
  wPerp: { type: "number", min: 0, max: 2, step: 0.25, default: 1, describe: "The weight of the perpendicular distance." },
  wPar: { type: "number", min: 0, max: 2, step: 0.25, default: 1, describe: "The weight of the parallel distance." },
  wTheta: { type: "number", min: 0, max: 2, step: 0.25, default: 1, describe: "The weight of the angle distance." },
  mdl: { type: "number", min: 0.5, max: 2, step: 0.25, default: 1, describe: "A route keeps a corner when the cost without it is more than this value times the cost with it." },
};

/** The declarations of the options of the highway strategy `diffusion` (HWY-020). */
export const DIFFUSION_SCHEMA: OptionSchema<DiffusionOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  a: { type: "number", min: 0, max: 0.5, step: 0.05, default: 0.25, describe: "The share of the density that each step takes from the links next to a link." },
  steps: { type: "integer", min: 0, max: 10, step: 1, default: 3, describe: "The number of steps of the diffusion." },
  lambda: { type: "number", min: 0, max: 2, step: 0.25, marks: [0.5, 1, 2], default: 1, describe: "The weight of the density in the cost of a link." },
  gamma: { type: "number", min: 0.5, max: 2, step: 0.25, default: 1, describe: "The power of the discount of a dense link." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `nested` (HWY-052). */
export const NESTED_SCHEMA: OptionSchema<NestedOptions> = {
  theta: QUICKBUNDLES_SCHEMA.theta,
  ratio: { type: "number", min: 1.5, max: 4, step: 0.5, default: 2, describe: "The scale of each level is this value times the scale of the next closer level." },
  levels: { type: "integer", min: 1, max: 6, step: 1, default: 3, describe: "The number of levels." },
  level: { type: "integer", min: 0, max: 5, step: 1, default: 0, describe: "The level of the plan. Level 0 is the closest level." },
  points: QUICKBUNDLES_SCHEMA.points,
  line: QUICKBUNDLES_SCHEMA.line,
  order: QUICKBUNDLES_SCHEMA.order,
  minSize: QUICKBUNDLES_SCHEMA.minSize,
  spine: GROUP_SPINE,
};

/** The declarations of the options of the highway strategy `lanes` (HWY-051). */
export const LANES_SCHEMA: OptionSchema<LanesOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  from: HIGHWAY_BASE,
  laneGap: { type: "number", min: 2, max: 8, step: 1, default: 4, describe: "The gap between two lanes." },
  maxWidth: { type: "number", min: 8, max: 64, step: 4, default: 32, describe: "The largest width of a highway." },
  depth: { type: "integer", min: 0, max: 5, step: 1, default: 3, describe: "The number of times that a highway can split, one half after the other." },
};

/** The declarations of the options of the highway strategy `growth` (HWY-055). */
export const GROWTH_SCHEMA: OptionSchema<GrowthOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  order: { type: "enum", values: ["length", "input"], default: "length", describe: "The order of the edges: the longest first route first, or the order of the graph." },
  share: { type: "number", min: 0.1, max: 1, step: 0.05, marks: [0.5], default: 0.5, describe: "The cost of the part on a spine, as a share of its length." },
  stretch: { type: "number", min: 1, max: 2, step: 0.05, marks: [1.3], default: 1.3, describe: "An edge joins a highway only when its way along it is this value times its first route or shorter." },
  extendLanes: { type: "integer", min: 2, max: 8, step: 1, default: 3, describe: "A spine end extends when this number of its lanes or more go on together." },
  extendRadius: { type: "number", min: 0.5, max: 6, step: 0.5, default: 2, describe: "The lanes go on together when their ends are this distance from their center or nearer, in units of the board." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway with this number of edges or more stays in the plan." },
};

/** The declarations of the options of the highway strategy `edge-paths` (HWY-012). */
export const EDGE_PATH_SCHEMA: OptionSchema<EdgePathOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  distortion: { type: "number", min: 1.1, max: 4, step: 0.1, marks: [1.5, 2, 3], default: 2, describe: "An edge takes a path of other edges only when the path is this many times its own length or less." },
  power: { type: "number", min: 1, max: 4, step: 0.5, default: 2, describe: "The weight of a link in the search is its length to this power." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `soft-keys` (HWY-019). */
export const SOFT_KEY_SCHEMA: OptionSchema<SoftKeyOptions> = {
  rule: { ...EDGE_RULE, default: "collection", describe: "The rule that gives the key of each edge. Two different keys add the distance `lambda`. With `all`, the keys add no distance." },
  lambda: { type: "number", min: 0, max: 2, step: 0.05, marks: [0, 0.25, 1], default: 0.25, describe: "The distance that two different keys add. A very large value keeps the keys apart." },
  tau: { type: "number", min: 0.1, max: 1.5, step: 0.05, marks: [0.3, 0.5, 1], default: 0.5, describe: "Two clusters join while their distance is this value or less." },
  attributes: { type: "list", default: [], describe: "The names of number fields of `data` that add a distance." },
  weight: { type: "number", min: 0, max: 2, step: 0.25, default: 1, describe: "The weight of each field of `attributes`." },
  linkage: { type: "enum", values: ["average", "complete", "single"], default: "average", describe: "The distance of two clusters: the mean, the largest or the smallest distance of their edges." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A cluster with this number of edges or more gets highways." },
  spine: { ...GROUP_SPINE, default: "shared" },
};

/** The declarations of the options of the highway strategy `hough` (HWY-024). */
export const HOUGH_SCHEMA: OptionSchema<HoughOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  dTheta: { type: "number", min: 2, max: 20, step: 1, marks: [4, 8, 12], default: 8, describe: "The width of the votes in the angle, in degrees." },
  dRho: { type: "number", min: 4, max: 40, step: 2, marks: [8, 12, 24], default: 12, describe: "The width of the votes in the offset, in units of the board." },
  minVotes: { type: "integer", min: 2, max: 16, step: 1, default: 3, describe: "A peak with fewer edges than this number is not a corridor." },
  orthogonal: { type: "boolean", default: false, describe: "With this option, the peaks are only horizontal or vertical lines." },
};

/** The declarations of the options of the highway strategy `ridges` (HWY-032). */
export const RIDGE_SCHEMA: OptionSchema<RidgeOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  source: { type: "enum", values: ["lines", "routes"], default: "lines", describe: "The lines of the density: the straight lines of the edges, or their first routes." },
  cell: { type: "number", min: 2, max: 32, step: 1, marks: [4, 8, 16], default: 8, describe: "The size of a cell of the density image, in units of the board." },
  bandwidth: { type: "number", min: 4, max: 64, step: 2, marks: [8, 16, 32], default: 16, describe: "The width of the blur of the density, in units of the board." },
  strength: { type: "number", min: 0, max: 1, step: 0.05, default: 0.15, describe: "A cell is part of a ridge only when its strength is this share of the largest strength or more." },
  minLength: { type: "number", min: 10, max: 300, step: 10, marks: [30, 60, 120], default: 60, describe: "A ridge has this length or more, in units of the board." },
  snap: { type: "number", min: 2, max: 64, step: 2, marks: [8, 16, 32], default: 16, describe: "An edge snaps to a ridge where it is this distance from the ridge or nearer." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A ridge with this number of edges or more gets a highway." },
};

/** The declarations of the options of the highway strategy `hdbscan` (HWY-028). */
export const HDBSCAN_SCHEMA: OptionSchema<HdbscanOptions> = {
  minClusterSize: { type: "integer", min: 2, max: 16, step: 1, default: 3, describe: "A cluster has this number of edges or more." },
  minSamples: { type: "integer", min: 1, max: 16, step: 1, default: 3, describe: "The core distance of an edge is the distance to its neighbour of this rank." },
  distance: { type: "enum", values: ["compatibility", "flow"], default: "compatibility", describe: "The distance of two edges: 1 less their compatibility, or the flow distance of the ends." },
  spine: { ...GROUP_SPINE, default: "trunk" },
};

/** The declarations of the options of the highway strategy `hub-arcs` (HWY-042). */
export const HUB_ARC_SCHEMA: OptionSchema<HubArcOptions> = {
  q: { type: "integer", min: 0, max: 64, step: 1, marks: [4, 12, 32], default: 12, describe: "The largest number of arcs." },
  alpha: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.3, 0.5, 0.8], default: 0.5, describe: "The cost of a length on an arc against a length off the arcs." },
  stretch: { type: "number", min: 1, max: 2, step: 0.05, marks: [1.25], default: 1.25, describe: "An edge rides an arc only when its way is this many times its first route or less." },
  swaps: { type: "integer", min: 0, max: 5, step: 1, default: 1, describe: "The number of passes of the local search with one swap." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "An arc with fewer edges than this number is not a highway." },
  generators: { type: "list", default: ["runs", "corridors", "road-classes"], describe: "The generators of the candidate arcs." },
};

/** The declarations of the options of the highway strategy `divided` (HWY-011). */
export const DIVIDED_SCHEMA: OptionSchema<DividedOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  from: HIGHWAY_BASE,
  rule: { type: "enum", values: ["right", "left"], default: "right", describe: "The side of the road of the traffic of each direction." },
  gap: { type: "number", min: 0, max: 4, step: 0.5, marks: [1, 2], default: 1, describe: "The gap between the two carriageways, in lanes." },
  laneWidth: { type: "number", min: 1, max: 12, step: 1, marks: [4], default: 4, describe: "The width of one lane, in units of the board." },
  minSize: { type: "integer", min: 1, max: 16, step: 1, default: 2, describe: "A highway divides only when each direction has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `hierarchy` (HWY-001). */
export const HIERARCHY_SCHEMA: OptionSchema<HierarchyOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  group: { type: "enum", values: ["quadtree", "kd", "cut"], default: "quadtree", describe: "The tree of sections that gives the hubs." },
  cap: { type: "integer", min: 1, max: 32, step: 1, marks: [4, 8, 16], default: 8, describe: "A section with more nodes splits." },
  beta: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.5, 0.85], default: 0.85, describe: "The pull of the hubs. The value 0 gives the straight line, and 1 goes through each hub." },
  hubs: {
    type: "integer",
    min: 0,
    max: 8,
    step: 1,
    special: [Infinity],
    default: Infinity,
    describe: "The largest number of hubs on each side of the lowest common section. `Infinity` uses each hub.",
  },
  snap: { type: "number", min: 0, max: 32, step: 2, marks: [8, 16], default: 8, describe: "The side of the grid that the hubs snap to, in units of the board." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `fdeb` (HWY-002 with RULE-002). */
export const FDEB_SCHEMA: OptionSchema<FdebOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  compatibility: { type: "number", min: 0.05, max: 1, step: 0.05, marks: [0.4, 0.6, 0.8], default: 0.6, describe: "Two edges attract each other when their compatibility is this value or more." },
  spring: { type: "number", min: 0, max: 0.5, step: 0.05, default: 0.1, describe: "The spring constant that keeps each edge smooth." },
  cycles: { type: "integer", min: 0, max: 7, step: 1, default: 5, describe: "The number of cycles. Each cycle doubles the points of each edge." },
  iterations: { type: "integer", min: 0, max: 200, step: 10, marks: [50], default: 50, describe: "The number of steps of the first cycle." },
  repulsion: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 1], default: 1, describe: "The weight of the push of the boxes. The value 0 turns it off." },
  pullLimit: {
    type: "number",
    min: 1,
    max: 3,
    step: 0.05,
    special: [Infinity],
    marks: [1.25, 1.5, Infinity],
    default: 1.25,
    describe: "An edge longer than this value times its straight line gets no pull. `Infinity` sets no budget.",
  },
  snap: { type: "number", min: 0, max: 32, step: 2, marks: [8, 16], default: 8, describe: "The side of the grid that the points of the edges snap to, in units of the board." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `mesh` (HWY-004). */
export const MESH_SCHEMA: OptionSchema<MeshOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  cell: { type: "number", min: 1, max: 16, step: 0.5, marks: [2, 4, 8], default: 4, describe: "The side of a cell of the mesh, in units of the boxes." },
  capacity: { type: "integer", min: 1, max: 32, step: 1, marks: [4, 8, 16], default: 8, describe: "A cluster of crossings has at most about this number of edges." },
  merge: { type: "number", min: 0, max: 4, step: 0.25, marks: [1], default: 1, describe: "Two clusters nearer than this value, in units of the boxes, become one." },
  angle: { type: "number", min: 0, max: 90, step: 5, marks: [30, 45], default: 45, describe: "A line crosses a segment of the mesh only within this angle in degrees to the main direction." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `kdeeb` (RULE-028 with HWY-006). */
export const KDEEB_SCHEMA: OptionSchema<KdeebOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  source: { type: "enum", values: ["lines", "routes"], default: "lines", describe: "The lines of the first density: the straight lines of the edges, or their first routes." },
  cell: { type: "number", min: 2, max: 32, step: 1, marks: [4, 8, 16], default: 8, describe: "The size of a cell of the density image, in units of the board." },
  bandwidth: { type: "number", min: 4, max: 64, step: 2, marks: [12, 24, 48], default: 24, describe: "The width of the kernel at the first step, in units of the board." },
  decay: { type: "number", min: 0.3, max: 1, step: 0.05, marks: [0.7], default: 0.7, describe: "Each step multiplies the width of the kernel by this value." },
  steps: { type: "integer", min: 0, max: 30, step: 1, marks: [10], default: 10, describe: "The number of steps." },
  smoothing: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.5], default: 0.5, describe: "The share of the smoothing of each polyline after each step." },
  mask: { type: "boolean", default: true, describe: "With `true`, the density is 0 in the boxes, so no ridge forms over a box." },
  snap: { type: "number", min: 0, max: 32, step: 2, marks: [8, 16], default: 8, describe: "The side of the grid that the points of the edges snap to, in units of the board." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `cubu` (HWY-007). */
export const CUBU_SCHEMA: OptionSchema<CubuOptions> = {
  ...KDEEB_SCHEMA,
  kernel: { type: "enum", values: ["separable", "fft"], default: "separable", describe: "The blur of the counts of the cells: a separable kernel (CUBu) or a Fourier transform (FFTEB)." },
  resample: { type: "number", min: 0, max: 32, step: 2, marks: [0, 8], default: 8, describe: "The spacing of the sample points after each step, in units of the board. The value 0 keeps the points." },
};

/** The declarations of the options of the highway strategy `mlseb` (HWY-008). */
export const MLSEB_SCHEMA: OptionSchema<MlsebOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  source: { type: "enum", values: ["lines", "routes"], default: "lines", describe: "The first lines of the edges: their straight lines, or their first routes." },
  radius: { type: "number", min: 0.25, max: 8, step: 0.25, marks: [1, 2, 4], default: 2, describe: "The radius of the fit at the first step, as a multiple of the median short side of the boxes." },
  decay: { type: "number", min: 0.3, max: 1, step: 0.05, marks: [0.8], default: 0.8, describe: "Each step multiplies the radius by this value." },
  steps: { type: "integer", min: 0, max: 20, step: 1, marks: [6], default: 6, describe: "The number of steps." },
  fit: { type: "enum", values: ["line", "parabola"], default: "line", describe: "The local fit of the moving least squares: a line, or a parabola along the line." },
  angleWeight: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 1], default: 1, describe: "The weight of the angle in the weight of a near point. The value 0 uses only the distance." },
  spacing: { type: "number", min: 2, max: 32, step: 1, marks: [8, 16], default: 8, describe: "The distance between two sample points of a line, in units of the board." },
  snap: { type: "number", min: 0, max: 32, step: 2, marks: [8, 16], default: 8, describe: "The side of the grid that the points of the edges snap to, in units of the board." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `sbeb` (HWY-009). */
export const SBEB_SCHEMA: OptionSchema<SbebOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  group: { type: "enum", values: ["quickbundles", "keys"], default: "quickbundles", describe: "The clusterer of the groups: `quickbundles`, or the key of each edge." },
  source: { type: "enum", values: ["lines", "routes"], default: "lines", describe: "The lines of the edges that make the shape: their straight lines, or their first routes." },
  radius: { type: "number", min: 0.25, max: 8, step: 0.25, marks: [1, 1.5, 3], default: 1.5, describe: "The radius of the shape of a group, as a multiple of the median short side of the boxes." },
  attraction: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.5], default: 0.5, describe: "The share of the move of each point to its target at each step." },
  steps: { type: "integer", min: 0, max: 20, step: 1, marks: [4], default: 4, describe: "The number of steps." },
  smoothing: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.5], default: 0.5, describe: "The share of the smoothing of each polyline after each step." },
  target: { type: "enum", values: ["skeleton", "mean"], default: "skeleton", describe: "The target of the points: the skeleton of the shape, or the mean line of the group." },
  cell: { type: "number", min: 1, max: 16, step: 1, marks: [4, 8], default: 4, describe: "The side of a cell of the image of the shape, in units of the board." },
  snap: { type: "number", min: 0, max: 32, step: 2, marks: [8, 16], default: 8, describe: "The side of the grid that the points of the edges snap to, in units of the board." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declarations of the options of the highway strategy `areas` (HWY-010). */
export const AREA_SCHEMA: OptionSchema<AreaOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  group: SBEB_SCHEMA.group,
  source: SBEB_SCHEMA.source,
  radius: SBEB_SCHEMA.radius,
  width: { type: "enum", values: ["spread", "count"], default: "spread", describe: "The half width of an area: the spread of the edges of the group, or the number of its lanes." },
  laneWidth: { type: "number", min: 1, max: 12, step: 1, marks: [4], default: 4, describe: "The width of one lane for the rule `count`, in units of the board." },
  cell: SBEB_SCHEMA.cell,
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A highway has this number of edges or more." },
};

/** The declaration of the limit of the legs of a trunk for the strategies `confluent` and `power`. */
const LEG_MAX: NumberOption = {
  type: "number",
  min: 0.1,
  max: 1,
  step: 0.05,
  special: [Infinity],
  marks: [0.3, 1, Infinity],
  default: 1,
  describe: "An edge rides the trunk only when each of its legs is this share of the trunk or shorter. `Infinity` sets no limit.",
};

/** The declaration of the edges that one group holds for the strategies `confluent` and `power`. */
const GROUP_SCOPE: EnumOption<GroupScope> = {
  type: "enum",
  values: ["collection", "all"],
  default: "all",
  describe: "The edges of one group: the edges of one collection, or each edge.",
};

/** The declarations of the options of the highway strategy `confluent` (HWY-013). */
export const CONFLUENT_SCHEMA: OptionSchema<ConfluentOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  minBiclique: { type: "integer", min: 2, max: 32, step: 1, marks: [4, 6, 9], default: 4, describe: "A biclique becomes a track when the product of the sizes of its two sets is this value or more." },
  scope: GROUP_SCOPE,
  spine: { ...GROUP_SPINE, default: "trunk" },
  legMax: LEG_MAX,
};

/** The declarations of the options of the highway strategy `power` (HWY-014). */
export const POWER_SCHEMA: OptionSchema<PowerOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  modules: { type: "enum", values: ["exact", "near"], default: "exact", describe: "The rule of a module: the same neighbours, or near neighbours by the Jaccard index." },
  jaccard: { type: "number", min: 0.3, max: 1, step: 0.05, marks: [0.6, 0.8], default: 0.8, describe: "With the rule `near`, a node joins a module at this Jaccard index or more." },
  minSaved: { type: "integer", min: 1, max: 16, step: 1, marks: [1, 2, 4], default: 2, describe: "A power edge becomes a highway when it saves this number of edges or more." },
  scope: GROUP_SCOPE,
  spine: { ...GROUP_SPINE, default: "trunk" },
  legMax: LEG_MAX,
};

/** The declarations of the options of the highway strategy `crossbars` (HWY-022). */
export const CROSSBAR_SCHEMA: OptionSchema<CrossbarOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  from: HIGHWAY_BASE,
  tolerance: { type: "number", min: 0, max: 45, step: 1, marks: [5, 15, 30], default: 15, describe: "Two segments are parallel when the angle between them is this value or less, in degrees." },
  minBar: { type: "integer", min: 1, max: 8, step: 1, marks: [2, 3], default: 2, describe: "Each side of a crossbar has this number of edges or more." },
  reach: { type: "number", min: 0.5, max: 8, step: 0.5, marks: [2, 3, 4], default: 3, describe: "The crossings of one crossbar are this distance or nearer to its first crossing, as a multiple of the median short side of the boxes." },
};

/** The declarations of the options of the highway strategy `frechet` (HWY-027). */
export const FRECHET_SCHEMA: OptionSchema<FrechetOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  eps: { type: "number", min: 0.1, max: 4, step: 0.1, marks: [0.5, 1, 2], default: 1, describe: "The largest discrete Fréchet distance in a bundle, as a multiple of the median short side of the boxes." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A bundle has this number of edges or more." },
  minLength: { type: "number", min: 0.5, max: 16, step: 0.5, marks: [2, 4], default: 2, describe: "The reference part of a bundle is this length or longer, as a multiple of the median short side of the boxes." },
  step: { type: "number", min: 0.1, max: 2, step: 0.1, marks: [0.5], default: 0.5, describe: "The distance between two samples of a route, as a multiple of the median short side of the boxes." },
  stride: { type: "integer", min: 1, max: 8, step: 1, marks: [1, 2, 4], default: 2, describe: "A search starts at each sample of this number along each route." },
};

/** The declarations of the options of the highway strategy `spectral` (HWY-029). */
export const SPECTRAL_SCHEMA: OptionSchema<SpectralOptions> = {
  c0: { type: "number", min: 0.05, max: 0.95, step: 0.05, marks: [0.3, 0.5, 0.7], default: 0.5, describe: "Two edges are a pair of the graph only when their compatibility is this value or more." },
  clusters: { type: "integer", min: 0, max: 32, step: 1, default: 0, describe: "The number of clusters of each part of the graph. The value 0 lets the largest eigengap choose it." },
  kMax: { type: "integer", min: 2, max: 32, step: 1, marks: [8, 16], default: 16, describe: "The eigengap chooses at most this number of clusters in each part of the graph." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A cluster with this number of edges or more gets highways." },
  spine: { ...GROUP_SPINE, default: "trunk" },
};

/** The declarations of the options of the highway strategy `resistance` (HWY-021). */
export const RESISTANCE_SCHEMA: OptionSchema<ResistanceOptions> = {
  ...SPECTRAL_SCHEMA,
  projections: { type: "integer", min: 1, max: 64, step: 1, marks: [8, 16, 32], default: 16, describe: "The number of random projections of the estimate of the resistance." },
  weight: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.5, 1], default: 0.5, describe: "The weight of the resistance. A pair gets the weight `C (1 - weight R_e R_f)`." },
  sparsify: { type: "boolean", default: false, describe: "With `true`, an edge with a resistance of 0.99 or more (a bridge) gets no pair." },
};

/** The declarations of the options of the highway strategy `link-communities` (HWY-030). */
export const LINK_COMMUNITY_SCHEMA: OptionSchema<LinkCommunityOptions> = {
  threshold: { type: "number", min: 0, max: 1, step: 0.05, marks: [0, 0.3, 0.5], default: 0, describe: "The cut of the tree of the edges. The value 0 cuts at the best partition density." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A community with this number of edges or more gets highways, after the check of the geometry." },
  spread: { type: "number", min: 1, max: 20, step: 1, marks: [3, 6, 12], default: 6, describe: "The largest distance of an end of an edge to the Weber point of its end of the community, in units of the board." },
  spine: GROUP_SPINE,
};

/** The declarations of the options of the highway strategy `territories` (HWY-033). */
export const TERRITORY_SCHEMA: OptionSchema<TerritoryOptions> = {
  radius: { type: "number", min: 1, max: 20, step: 0.5, marks: [2, 4, 8], default: 4, describe: "The radius of a group of points, in units of the board." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A flow between two cells becomes a highway when this number of edges or more cross it." },
  points: { type: "enum", values: ["plugs", "bends", "both"], default: "both", describe: "The characteristic points: the plugs, the bends of the first routes, or both." },
};

/** The declarations of the options of the highway strategy `consensus` (HWY-035). */
export const CONSENSUS_SCHEMA: OptionSchema<ConsensusOptions> = {
  members: { type: "list", default: ["corridors", "quickbundles", "wspd", "road-classes"], describe: "The finders that vote." },
  cut: { type: "number", min: 0.1, max: 0.9, step: 0.05, marks: [0.3, 0.5, 0.7], default: 0.5, describe: "Two clusters join while their distance `1 - A` is below this value." },
  linkage: { type: "enum", values: ["average", "single"], default: "average", describe: "The linkage of the clusters: the mean distance of the pairs, or the nearest pair." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A cluster with this number of edges or more gets highways." },
  spine: GROUP_SPINE,
};

/** The declarations of the options of the highway strategy `p-hub` (HWY-041). */
export const P_HUB_SCHEMA: OptionSchema<PHubOptions> = {
  p: { type: "integer", min: 0, max: 32, step: 1, marks: [0, 4, 8], default: 0, describe: "The number of hubs. The value 0 gives the root of the number of nodes, rounded." },
  alpha: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.2, 0.5, 0.8], default: 0.5, describe: "The cost of a length on a link between two hubs against a length off the links." },
  allocation: { type: "enum", values: ["single", "multiple"], default: "single", describe: "The allocation: each node to its nearest hub, or each edge to its best pair of hubs." },
  candidates: { type: "enum", values: ["corners", "sections"], default: "corners", describe: "The candidate points of the hubs: the corners of the corner graph, or the centres of the sections." },
  detour: { type: "number", min: 1, max: 3, step: 0.05, marks: [1.25, 1.5], default: 1.25, describe: "An edge rides a link only when its way through the two hubs is this many times its first route or less." },
  swaps: { type: "integer", min: 0, max: 4, step: 1, default: 1, describe: "The number of passes of the local search with one swap of a hub." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A link with fewer edges than this number is not a highway." },
};

/** The declarations of the options of the highway strategy `scale-space` (HWY-053). */
export const SCALE_SPACE_SCHEMA: OptionSchema<ScaleSpaceOptions> = {
  theta: { type: "number", min: 0.5, max: 6, step: 0.5, marks: [1.5, 3], default: 1.5, describe: "The first scale, in units of the board." },
  ratio: { type: "number", min: 1.1, max: 3, step: 0.1, marks: [1.5, 2], default: Math.SQRT2, describe: "The scale of each next scale is this value times the scale before it." },
  scales: { type: "integer", min: 2, max: 16, step: 1, marks: [4, 8], default: 8, describe: "The number of scales." },
  level: { type: "integer", min: 0, max: 15, step: 1, marks: [2, 4, 6], default: 2, describe: "The scale of the plan, from 0 (the first scale)." },
  p0: { type: "number", min: 0, max: 3, step: 0.1, marks: [0.3, 0.6, 1.2], default: 0.6, describe: "A cluster gets highways only when its persistence (the log of the ratio of its last scale to its first scale) is this value or more." },
  points: { type: "integer", min: 6, max: 24, step: 2, default: 12, describe: "The number of points of each line after the resampling." },
  line: { type: "enum", values: ["routes", "lines"], default: "routes", describe: "The line of each edge: its first route, or the straight line between its plugs." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A cluster with this number of edges or more gets highways." },
  spine: GROUP_SPINE,
};

/** The declarations of the options of the level strategy `depths`: the limits of the level links, and the depths that get a level. */
export const DEPTHS_SCHEMA: OptionSchema<DepthLevelOptions> = {
  margin: WAY_SCHEMA.margin,
  k: WAY_SCHEMA.k,
  tightMargin: SECTIONS_SCHEMA.tightMargin,
  plugInset: SECTIONS_SCHEMA.plugInset,
  throughCost: SECTIONS_SCHEMA.throughCost,
  levels: SECTIONS_SCHEMA.levels,
};

/** The declarations of the options of the whole strategy `pipeline`. */
export const PIPELINE_SCHEMA: OptionSchema<PipelineOptions> = {
  router: { type: "strategy", step: "router", describe: "The router. A highway plan takes its place." },
  routerOptions: { type: "object", describe: "The options of the router." },
  highway: { type: "strategy", step: "highway", describe: "The highway strategy. With it, the plan and `follow` give the routes. Without it, the router routes." },
  highwayOptions: { type: "object", describe: "The options of the highway strategy." },
  group: { type: "strategy", step: "group", describe: "The grouping rule of a router that reads one, for example `sections`." },
  groupOptions: { type: "object", describe: "The options of the grouping rule." },
  plugs: { type: "strategy", step: "plugs", describe: "The plug rule of a router that reads one, for example `corners`." },
  plugOptions: { type: "object", describe: "The options of the plug rule." },
  levels: { type: "strategy", step: "levels", describe: "The level rule of a router that reads one, for example `sections`." },
  levelOptions: { type: "object", describe: "The options of the level rule." },
  room: { type: "strategy", step: "room", describe: "The room strategy. With it, the gaps of the board open before the routes. Without it, the board stays." },
  roomOptions: { type: "object", describe: "The options of the room strategy." },
};

/** The declarations of the options of the highway strategy `steiner` (HWY-036 with EDA-015). */
export const STEINER_SCHEMA: OptionSchema<SteinerOptions> = {
  group: { type: "enum", values: ["source", "key"], default: "source", describe: "The groups of the trees: the edges from one source node, or the edges of one collection." },
  method: { type: "enum", values: ["one-steiner", "spanning"], default: "one-steiner", describe: "The method of the tree: the iterated 1-Steiner method, or the spanning tree of the terminals." },
  maxGroup: { type: "integer", min: 3, max: 32, step: 1, marks: [8, 12, 16], default: 12, describe: "A group with more terminals than this number gets the spanning tree alone." },
  metric: { type: "enum", values: ["rectilinear", "octilinear"], default: "rectilinear", describe: "The metric of the tree: two directions or four directions." },
  detour: { type: "number", min: 1, max: 3, step: 0.05, marks: [1.25, 1.5, 2], default: 1.5, describe: "An edge rides the tree only when its path in the tree is this many times its first route or less." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A stretch of a tree with fewer edges than this number is not a highway." },
};

/** The declarations of the options of the highway strategy `gaps` (HWY-057). */
export const GAP_SCHEMA: OptionSchema<GapOptions> = {
  minSize: { type: "integer", min: 2, max: 16, step: 1, marks: [2, 3, 6], default: 3, describe: "A street with fewer edges than this number (the demand) is not a highway." },
  discount: { type: "number", min: 0.1, max: 0.8, step: 0.05, marks: [0.3, 0.5, 0.7], default: 0.5, describe: "The cost of a length on a street against a length off the streets." },
  detour: { type: "number", min: 1, max: 2, step: 0.05, marks: [1.2, 1.3, 1.5], default: 1.3, describe: "An edge rides a street only when its way along the street is this many times its first route or less." },
  source: { type: "enum", values: ["room", "corners"], default: "room", describe: "The source of the streets: the gaps of the room step, or the lines through the corners." },
};

/** The declarations of the options of the highway strategy `streets` (HWY-058). */
export const STREET_SCHEMA: OptionSchema<StreetOptions> = {
  detour: { type: "number", min: 1, max: 1.5, step: 0.05, marks: [1.1, 1.2, 1.3], default: 1.2, describe: "A street covers an edge when the way of the edge along it is this many times its first route or less." },
  minGain: { type: "number", min: 1, max: 8, step: 0.25, marks: [1.5, 2, 4], default: 2, describe: "The cover stops when the best street gives less gain: the length that its edges ride over its length." },
  maxStreets: { type: "integer", min: 4, max: 64, step: 4, marks: [16, 32], default: 32, describe: "The largest number of streets." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A street with fewer new edges than this number is not a highway." },
  source: { type: "enum", values: ["room", "corners"], default: "corners", describe: "The source of the streets: the gaps of the room step, or the lines through the corners." },
};

/** The declarations of the options of the highway strategy `search` (HWY-059). */
export const SEARCH_SCHEMA: OptionSchema<SearchOptions> = {
  from: { type: "enum", values: ["corridors", "quickbundles", "wspd", "road-classes", "flow-field", "od-cells", "shared-ways"], default: "corridors", describe: "The plan where the search starts." },
  pool: { type: "list", default: ["quickbundles", "road-classes"], describe: "The generators of the highways that the move `add` takes." },
  evaluations: { type: "integer", min: 0, max: 400, step: 4, marks: [0, 16, 64], default: 16, describe: "The number of plans that the search measures. The value 0 gives the start plan." },
  temperature: { type: "number", min: 0, max: 0.2, step: 0.005, marks: [0, 0.02, 0.05], default: 0.02, describe: "The first temperature of the annealing, on the scale of the score." },
  inkWeight: { type: "number", min: 0, max: 4, step: 0.25, marks: [1], default: 1, describe: "The weight of the ink that the routes save (B1)." },
  stretchWeight: { type: "number", min: 0, max: 4, step: 0.25, marks: [0.5], default: 0.5, describe: "The weight of the 0.95 quantile of the stretch (B3)." },
  ambiguityWeight: { type: "number", min: 0, max: 4, step: 0.25, marks: [0.5], default: 0.5, describe: "The weight of the ambiguity (B4)." },
  angleWeight: { type: "number", min: 0, max: 4, step: 0.25, marks: [0.25], default: 0.25, describe: "The weight of the largest merge angle (B6), divided by 180 degrees." },
  seed: { type: "integer", min: 0, max: 1000, step: 1, default: 1, describe: "The seed of the moves." },
};

/** The declarations of the options of the highway strategy `interchanges` (HWY-060). */
export const INTERCHANGE_SCHEMA: OptionSchema<InterchangeOptions> = {
  from: { type: "enum", values: ["corridors", "shared-ways"], default: "corridors", describe: "The plan that gives the highways of the network." },
  changeCost: { type: "number", min: 0, max: 8, step: 0.5, marks: [0, 2, 4], default: 2, describe: "The cost of a change between two highways, in units of the board." },
  interchanges: { type: "integer", min: 1, max: 32, step: 1, marks: [4, 16], default: 16, describe: "The largest number of interchanges." },
  perEdge: { type: "integer", min: 1, max: 3, step: 1, default: 2, describe: "The largest number of highways on the way of one edge." },
  radius: { type: "number", min: 0.5, max: 8, step: 0.5, marks: [1, 2, 4], default: 2, describe: "Two highways get an interchange where they come this near, in units of the board." },
  discount: { type: "number", min: 0.1, max: 1, step: 0.05, marks: [0.3, 0.5, 0.7], default: 0.5, describe: "The cost of a length on a highway against a length off the highways." },
  detour: { type: "number", min: 1, max: 3, step: 0.05, marks: [1.25, 1.5, 2], default: 1.5, describe: "An edge rides the network only when its way is this many times its first route or less." },
};

/** The declarations of the options of the highway strategy `knee` (NAT-018). */
export const KNEE_SCHEMA: OptionSchema<KneeOptions> = {
  sweep: { type: "integer", min: 5, max: 21, step: 1, marks: [5, 11, 21], default: 11, describe: "The number of points of the sweep of the balancing factor." },
  rule: { type: "enum", values: ["chord", "weights"], default: "chord", describe: "The rule that picks one tree: the knee of the chord, or the least weighted sum." },
  ink: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.25, 0.5, 0.75], default: 0.5, describe: "The weight of the ink in the rule `weights`. The rest of the weight goes to the path length." },
  detour: { type: "number", min: 1, max: 3, step: 0.05, marks: [1.25, 1.5, 2], default: 1.5, describe: "An edge rides the tree only when its path in the tree is this many times its first route or less." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A stretch of a tree with fewer edges than this number is not a highway." },
};

/** The declarations of the options of the highway strategy `bronchial` (NAT-019). */
export const BRONCHIAL_SCHEMA: OptionSchema<BronchialOptions> = {
  split: { type: "enum", values: ["count", "weight", "gap"], default: "count", describe: "The rule that splits the targets of a tip in two: by count, by weight, or at the widest gap." },
  share: { type: "number", min: 0.3, max: 0.7, step: 0.05, marks: [0.3, 0.5, 0.7], default: 0.5, describe: "The share of the distance to the center of the targets that a branch grows." },
  smallest: { type: "integer", min: 1, max: 3, step: 1, default: 1, describe: "A set with this number of targets or fewer stops the splits." },
  detour: { type: "number", min: 1, max: 3, step: 0.05, marks: [1.25, 1.5, 2], default: 1.5, describe: "An edge rides the tree only when its path in the tree is this many times its first route or less." },
  minSize: { type: "integer", min: 2, max: 16, step: 1, default: 2, describe: "A stretch of a tree with fewer edges than this number is not a highway." },
};

/** The declarations of the options of the level strategy `venation` (NAT-016): the options of `depths`, and the options of the backbone. */
export const VENATION_SCHEMA: OptionSchema<VenationOptions> = {
  ...DEPTHS_SCHEMA,
  backbone: { type: "enum", values: ["rng", "gabriel"], default: "rng", describe: "The graph of the backbone: the relative neighbourhood graph, or the Gabriel graph." },
  discount: { type: "number", min: 0, max: 0.8, step: 0.05, marks: [0, 0.4, 0.8], default: 0.4, describe: "The share of the cost of a backbone link that a later level link saves when an earlier link uses it." },
  detour: { type: "number", min: 1, max: 3, step: 0.05, marks: [1.25, 1.5, 2], default: 1.5, describe: "A level link takes its way on the backbone only when that way is this many times its direct link or less." },
  maxItems: { type: "integer", min: 10, max: 2000, step: 10, marks: [100, 400, 1000], default: 400, describe: "A level with more items than this number keeps the links of `depths`." },
};

/** The declarations of the options of the whole strategy `board-portfolio` (WILD-045). */
export const BOARD_PORTFOLIO_SCHEMA: OptionSchema<BoardPortfolioOptions> = {
  settings: { type: "integer", min: 3, max: 12, step: 1, marks: [3, 4, 8, 12], default: 4, describe: "The number of settings that the portfolio tries, from the start of its list." },
  crossings: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 1, 2], default: 1, describe: "The weight of the crossings (R1) in the score." },
  detour: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 1, 2], default: 1, describe: "The weight of the median detour (R5) in the score." },
  ink: { type: "number", min: 0, max: 4, step: 0.25, marks: [0, 1, 2], default: 1, describe: "The weight of the ink saved (B1) in the score." },
  budget: { type: "number", min: 0, max: 10, step: 0.1, marks: [0, 1, 10], default: 0, describe: "The time budget in seconds. The value 0 sets no budget." },
};
