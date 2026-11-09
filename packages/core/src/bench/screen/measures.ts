import type { Objective } from "../measures/pareto.ts";
import type { CompareSpec, MinEffect } from "./compare.ts";

/**
 * One measure of a record. `key` is the key of the measure in the values of `runSuite` and `compareStep`.
 * `name` is the name of the measure in a record of the form `layout-record/1`.
 */
export interface MeasureInfo {
  /** The key in the values of `runSuite` and `compareStep`, for example `R5.median`. */
  readonly key: string;
  /** The id of the measure in `docs/research/MEASURES.md` (MEAS0), for example `R5`. */
  readonly id: string;
  /** The name in a record: lowercase, with a dot after the stage, for example `route.detour.median`. */
  readonly name: string;
  readonly unit: string;
  readonly better: "lower" | "higher";
  /**
   * This value is `true` when the positions of the boxes alone can move the value, with the same router.
   * Then two values compare only on the same input. The value is `false` when the measure scores the routes or the curves for a fixed placement.
   */
  readonly placementDependent: boolean;
  /** The least value of the measure. `RANGES` gives it by the unit, or by the key for a row with its own range. */
  readonly min: number;
  /** The largest value of the measure. The value `Infinity` tells that the measure has no upper limit. */
  readonly max: number;
  /**
   * The smallest change that counts as better or worse in `compareMeasure` (WIN-RES). `MIN_EFFECTS` gives it by the unit, with its reason.
   * A measure without this field has the threshold `RECORD_EPS`.
   */
  readonly minEffect?: MinEffect;
  /** The definition of the measure in one or two sentences: what it counts, and when its value is good. The site shows it. */
  readonly definition?: string;
  /**
   * The name of the measure of 0 or 1 that tells that this value is an estimate from a sample (BENCH-PAIRS-HEAP).
   * A gate does not compare an estimate with a full count. `sameKind` applies this rule.
   */
  readonly estimatedBy?: string;
}

/** One rule of `MIN_EFFECTS`: the units, the minimum effect of a measure with one of these units, and the reason. */
export interface MinEffectRule {
  readonly units: readonly string[];
  /** The minimum effect. The value `undefined` gives the threshold `RECORD_EPS`. */
  readonly minEffect: MinEffect | undefined;
  readonly reason: string;
}

/**
 * The minimum effect of each measure of `MEASURES`, by the unit of the measure (WIN-RES).
 * Each unit of `MEASURES` is in one rule. The test of the module checks it.
 */
export const MIN_EFFECTS: readonly MinEffectRule[] = Object.freeze([
  {
    units: ["share"],
    minEffect: undefined,
    reason: "A share, or the mean of a flag of 0 or 1, has the precision of a written file. Thus the threshold is `RECORD_EPS`.",
  },
  {
    units: ["ratio", "IQR over the median", "no unit", "half turns for each route", "curvature times the unit of the board"],
    minEffect: undefined,
    reason: "A stretch or another value without a unit has the precision of a written file. Thus the threshold is `RECORD_EPS`.",
  },
  {
    units: ["count", "count for each edge", "count for each route"],
    minEffect: 0,
    reason: "A count or a mean of counts changes in steps. The threshold is `RECORD_EPS`, so a change of 1 counts.",
  },
  {
    units: ["units", "W"],
    minEffect: { rel: 0.01 },
    reason: "A length in pixels, or a length over the width `W` of the board, moves with each small move of a point. A change of 1% or less is not visible.",
  },
  {
    units: ["degrees"],
    minEffect: { rel: 0.01 },
    reason: "An angle is a continuous value of the geometry, as a length. A change of 1% or less is not visible.",
  },
]);

const MIN_EFFECT_BY_UNIT: ReadonlyMap<string, MinEffectRule> = new Map(MIN_EFFECTS.flatMap((r) => r.units.map((u) => [u, r] as const)));

/** One rule of `RANGES`: the range of the values of a measure, with the units or the keys that it applies to, and the reason. */
export interface RangeRule {
  /** The units of the rule. A rule with `keys` applies to those rows only, and it comes before the rule of their unit. */
  readonly units?: readonly string[];
  readonly keys?: readonly string[];
  readonly min: number;
  /** The largest value. `Infinity` tells that the measure has no upper limit. */
  readonly max: number;
  readonly reason: string;
}

/**
 * The range of each measure of `MEASURES`. A rule by key comes before the rule of the unit.
 * Each unit of `MEASURES` has a rule. The range test runs a screen of each step and checks each value of the records.
 */
export const RANGES: readonly RangeRule[] = Object.freeze([
  { units: ["share"], min: 0, max: 1, reason: "A share is a part of a whole, and a flag is 0 or 1." },
  {
    units: ["count", "count for each edge", "count for each route", "half turns for each route", "units", "W", "IQR over the median", "curvature times the unit of the board"],
    min: 0,
    max: Infinity,
    reason: "A count, a length, a turn and a spread are 0 or more, with no upper limit.",
  },
  { units: ["degrees"], min: 0, max: 180, reason: "An angle between two directions is from 0 to 180 degrees." },
  { units: ["ratio", "no unit"], min: 0, max: Infinity, reason: "A ratio of two lengths, two areas or two counts is 0 or more. A normalized length or energy is 0 or more." },
  { keys: ["R2.min"], min: 0, max: 90, reason: "The angle of a crossing is the acute angle of the two legs. No crossing gives 90." },
  { keys: ["R8.clearance"], min: 0, max: 40, reason: "The clearance of each route is capped at 40 units (`CLEARANCE_CAP`)." },
  {
    keys: ["R5.median", "R5.q95", "R5.mean", "B3.max", "gap.stretch", "M1.area"],
    min: 1,
    max: Infinity,
    reason: "A route is never shorter than the line between its ends, a max stretch starts at 1, and an open lane only grows the board.",
  },
  { keys: ["gap.cap", "gap.cap.collection", "gap.cap.all"], min: 1.1, max: 1.5, reason: "The cap of the stretch is one of the caps of the gap: 1.1, 1.25 or 1.5." },
  {
    keys: ["gap", "gap.collection", "gap.all"],
    min: -Infinity,
    max: Infinity,
    reason: "The share of the gap that a strategy closes is below 0 when it is worse than the baseline, and above 1 when it passes the optimum.",
  },
  { keys: ["Z8.order", "G9.ari", "G7.silhouette"], min: -1, max: 1, reason: "A rank correlation, an adjusted Rand index and a silhouette are from -1 to 1." },
  { keys: ["G1.modularity"], min: -0.5, max: 1, reason: "The modularity of a partition is from -0.5 to 1." },
]);

const RANGE_BY_KEY: ReadonlyMap<string, RangeRule> = new Map(RANGES.flatMap((r) => (r.keys ?? []).map((k) => [k, r] as const)));
const RANGE_BY_UNIT: ReadonlyMap<string, RangeRule> = new Map(RANGES.flatMap((r) => (r.units ?? []).map((u) => [u, r] as const)));

/** The key of the flag of an estimate for each measure that can come from a sample, by the key of the measure. */
const ESTIMATED_BY: Readonly<Record<string, string>> = {
  "R1.crossings": "R1.estimated",
  "R1.perEdge": "R1.estimated",
  "R1.pairs": "R1.pairsEstimated",
  "R1.pairsLow": "R1.pairsEstimated",
  "R1.pairsHigh": "R1.pairsEstimated",
};

/** The text of a row of `MEASURES`: the key, the id, the name, the unit, the better side and the placement dependence. */
type Row = readonly [key: string, id: string, name: string, unit: string, better: "lower" | "higher", placement: boolean, definition?: string];

const ROWS: readonly Row[] = [
  // The routes. A placement makes crossings, plugs on short sides and boxes that touch, so these measures depend on it.
  ["R1.crossings", "R1", "route.crossings", "count", "lower", true],
  ["R1.perEdge", "R1", "route.crossings.per-edge", "count for each edge", "lower", true],
  ["R1.estimated", "R1", "route.crossings.estimated", "share", "lower", true, "This value is 1 when the crossings come from a sample and not from a full count. A ratio across routers does not compare such a row with a full count."],
  ["R1.pairs", "R1", "route.crossings.pairs", "count", "lower", true, "The crossings between pairs of routes, including a shared vertex and a shared stretch that two routes leave on opposite sides. The partner of `route.crossings`: a bundle lowers the count of ink crossings by overlap."],
  ["R1.pairsEstimated", "R1", "route.crossings.pairs.estimated", "share", "lower", true, "This value is 1 when `route.crossings.pairs` has an estimate from a sample of the pairs of routes."],
  ["R1.pairsLow", "R1", "route.crossings.pairs.low", "count", "lower", true, "The low end of the 95% interval of `route.crossings.pairs`. It equals the count when the count reads all routes. The interval is too narrow when `route.crossings.pairs.contact-sampled` is 1."],
  ["R1.pairsHigh", "R1", "route.crossings.pairs.high", "count", "lower", true, "The high end of the 95% interval of `route.crossings.pairs`. It equals the count when the count reads all routes. The interval is too narrow when `route.crossings.pairs.contact-sampled` is 1."],
  ["R1.pairsContactSampled", "R1", "route.crossings.pairs.contact-sampled", "share", "lower", true, "This value is 1 when the contact crossings come from a sample of the pairs at shared vertices. The interval does not include the error of that sample."],
  ["R2.angle", "R2", "route.crossing-angle.mean", "share", "higher", true],
  ["R2.min", "R2", "route.crossing-angle.min", "degrees", "higher", true],
  ["R3.bends", "R3", "route.bends", "count for each route", "lower", false],
  ["R4.turn", "R4", "route.turn.mean", "half turns for each route", "lower", false],
  ["R4.max", "R4", "route.turn.max", "degrees", "lower", false],
  ["R5.median", "R5", "route.detour.median", "ratio", "lower", false],
  ["R5.q95", "R5", "route.detour.q95", "ratio", "lower", false],
  ["R5.mean", "R5", "route.detour.mean", "ratio", "lower", false],
  ["R6.worstDetour", "R6", "route.detour.max", "ratio", "lower", false],
  ["R7.backtrack", "R7", "route.backtrack", "share", "lower", false],
  ["R8.clearance", "R8", "route.clearance.mean", "units", "higher", true],
  ["R8.tight", "R8", "route.clearance.tight", "share", "lower", true],
  ["R9.through", "R9", "route.through", "count", "lower", true],
  ["R10.plugAngle", "R10", "route.plug-angle", "degrees", "lower", false],
  ["R11.min", "R11", "route.plug-spacing.min", "share", "higher", true],
  ["R11.q05", "R11", "route.plug-spacing.q05", "share", "higher", true],
  ["R13.outside", "R13", "route.outside", "count", "lower", false],
  ["R15.inflections", "R15", "route.inflections", "count for each route", "lower", false],
  // MEAS3A, for the steps `router` and `highway`. R12 is the share of the ink near a parallel leg of other edges. A narrow channel between boxes moves it.
  ["R12.share", "R12", "route.lane.separation", "share", "lower", true],
  ["R14.share", "R14", "route.orthogonality", "share", "higher", false],
  // BALANCE-STABILITY. R16 is the spread of the gaps between neighbor parallel legs of two edges, also when each gap is wide.
  ["R16.cv", "R16", "route.balance.cv", "no unit", "lower", true, "The spread of the gaps between parallel routes: the standard deviation of the gaps over their mean. A value of 0 is even."],
  ["R16.low", "R16", "route.balance.low", "share", "lower", true, "The share of the parallel overlap with a gap less than half of the median gap."],
  // PASS-GRID. R17 tells that a route went straight because the corner graph had no way. The hard rule R9 alone does not tell the reason.
  ["R17.noGraph", "R17", "route.no-graph", "count", "lower", true, "The count of the routes that are one straight line because the corner graph of the board has no way between their plugs. A value of 0 is good."],
  // PLUG-ROW-GAP. R18 reads the `rowHeight` of the ports, so a board without rows has no value.
  ["R18.fit", "R18", "route.row.fit", "share", "higher", true, "The share of the rows of the ports that fit on their walls, with no overlap of another row or plug. More is better."],
  ["R18.gap", "R18", "route.row.gap", "no unit", "higher", true, "The least distance of two neighbor plugs of one wall, in the mean height of their rows. A value of 1 or more leaves room for each row."],
  ["ink", "R1", "route.ink", "units", "lower", true],
  // The bundles.
  ["B1.inkSaved", "B1", "route.bundle.ink-saved", "share", "higher", false],
  ["B11.share", "B11", "route.overlap.share", "share", "lower", false, "The share of the length of all routes on a piece of a line with two routes or more. A good result for a router with no lanes is near the value of `corners`."],
  ["B11.peak", "B11", "route.overlap.peak", "count", "lower", false, "The most routes on one piece of a line. A good result for a router with no lanes is near the value of `corners`."],
  ["B4.ambiguity", "B4", "route.bundle.ambiguity", "share", "lower", false],
  ["B4.reach", "B4", "route.bundle.reach", "share", "lower", false],
  // B2, B3 and B6 score the shared ways of the routes for a fixed placement, as B1 does. B3 compares with the routes of `corners` on the same input.
  ["B2.share", "B2", "route.bundle.share", "share", "higher", false],
  ["B3.median", "B3", "route.bundle.stretch.median", "ratio", "lower", false],
  ["B3.q95", "B3", "route.bundle.stretch.q95", "ratio", "lower", false],
  ["B6.max", "B6", "route.bundle.merge-angle.max", "degrees", "lower", false],
  // MEAS2, on the inputs of `exact-v1`: the largest B3, the largest stretch of the exact model, and the gap closed (B10) to the exact optimum at the smallest cap at or above that stretch.
  ["B3.max", "B3", "route.bundle.stretch.max", "ratio", "lower", false],
  ["gap.stretch", "B3", "route.bundle.stretch.model.max", "ratio", "lower", false],
  ["gap.mixed", "B10", "route.bundle.gap-closed.mixed", "share", "lower", false],
  ["gap", "B10", "route.bundle.gap-closed", "ratio", "higher", false],
  ["gap.cap", "B10", "route.bundle.gap-closed.cap", "ratio", "lower", false],
  ["gap.collection", "B10", "route.bundle.gap-closed.collection", "ratio", "higher", false],
  ["gap.cap.collection", "B10", "route.bundle.gap-closed.cap.collection", "ratio", "lower", false],
  ["gap.all", "B10", "route.bundle.gap-closed.all", "ratio", "higher", false],
  ["gap.cap.all", "B10", "route.bundle.gap-closed.cap.all", "ratio", "lower", false],
  // MEAS3A, for the steps `router` and `highway`. B5, B8 and B9 read the runs and the trunks of the result. B8 is good or bad only in context, as B2.
  ["B5.crossings", "B5", "route.bundle.lane-crossings", "count", "lower", false],
  ["B7.ratio", "B7", "route.bundle.occupied-area", "ratio", "lower", false],
  ["B8.runs", "B8", "route.bundle.runs", "count", "lower", false],
  ["B8.median", "B8", "route.bundle.run-edges.median", "count", "higher", false],
  ["B8.max", "B8", "route.bundle.run-edges.max", "count", "higher", false],
  ["B9.median", "B9", "route.bundle.lane-fidelity.median", "ratio", "lower", false],
  ["B9.max", "B9", "route.bundle.lane-fidelity.max", "ratio", "lower", false],
  // M1 and M4 of the room, for the steps `router` and `highway`: the lanes of each shared segment open at `MEASURE_LANE_WIDTH`.
  // The step `room` of `runSuite` gives the same keys for the boards that a room strategy opens.
  ["M1.area", "M1", "route.lane.area", "ratio", "lower", false],
  ["M4.laneThrough", "M4", "route.lane.through", "count", "lower", true],
  // SCREEN-MEASURES: M2, M3 and M5 of the step `whole` compare the board of the output with the input board. A whole strategy without a room strategy gives 0.
  ["M2.order", "M2", "route.room.order", "count", "lower", false, "The number of pairs of boxes whose order or alignment on an axis changes when the boxes move. 0 is correct."],
  ["M3.displacement", "M3", "route.room.displacement", "no unit", "lower", false, "The mean distance that the center of a box moves, divided by the unit of the board."],
  ["M5.stress", "M5", "route.room.distortion", "share", "lower", false, "The stress of the distances from each box to its 4 nearest boxes, after the best change of scale. 0 is a board that only changes its scale."],
  // SCREEN-MEASURES: H3 is the symmetry of the routes on a board of fixed boxes.
  ["H3.share", "H3", "route.symmetry", "share", "higher", true, "The share of the routes that a mirror or a half turn of the board sends onto a route, for the best of the three maps."],
  // The order fragility (W3 of MEAS3, from WILD-056): the spread of a measure over random orders of the edges. The placement can move it.
  ["W3.crossings", "W3", "route.order.crossings", "IQR over the median", "lower", true],
  ["W3.detour", "W3", "route.order.detour", "IQR over the median", "lower", true],
  ["W3.inkSaved", "W3", "route.order.ink-saved", "IQR over the median", "lower", true],
  ["W3.ink", "W3", "route.order.ink", "IQR over the median", "lower", true],
  ["W3.changed", "W3", "route.order.changed", "share", "lower", true],
  ["W3.poa", "W3", "route.order.poa", "ratio", "lower", true],
  // The stability after the small change of `changeGraph`, and against the run on the base input of a variant.
  ["Z10.mean", "Z10", "route.stability.mean", "W", "lower", false],
  ["Z10.max", "Z10", "route.stability.max", "W", "lower", false],
  ["Z10.moved", "Z10", "route.stability.moved", "share", "lower", false],
  ["Z10.base.mean", "Z10", "route.stability.base.mean", "W", "lower", false],
  ["Z10.base.max", "Z10", "route.stability.base.max", "W", "lower", false],
  ["Z10.base.moved", "Z10", "route.stability.base.moved", "share", "lower", false],
  // The stability of a highway strategy over a sequence of seeded edits, with its plan before each edit (the screen option `edits`).
  ["Z10.edits.mean", "Z10", "route.stability.edits.mean", "W", "lower", false],
  ["Z10.edits.moved", "Z10", "route.stability.edits.moved", "share", "lower", false],
  ["Z10.churn", "Z10", "route.stability.highway-churn", "share", "lower", false],
  ["Z10.ids", "Z10", "route.stability.highway-ids", "share", "higher", false],
  // BALANCE-STABILITY. Z11 is the response to a move of one node by one unit. Z12 is the change of the routes with the next seed of a strategy.
  ["Z11.gain", "Z11", "route.stability.move.gain", "no unit", "lower", false, "The movement of all the routes after one node moves by one unit, for each edge of that node. A value of 1 is a local response."],
  ["Z11.spill", "Z11", "route.stability.move.spill", "share", "lower", false, "The share of the routes of other nodes that move after one node moves by one unit. A value of 0 is a local response."],
  ["Z12.mean", "Z12", "route.stability.seed.mean", "W", "lower", false, "The mean movement of the routes with the next seed of the strategy. A strategy without a seed has 0."],
  ["Z12.moved", "Z12", "route.stability.seed.moved", "share", "lower", false, "The share of the routes that move with the next seed of the strategy. A strategy without a seed has 0."],
  // The zoom levels and the groups. The default grouping rule reads the positions, so most of these measures depend on the placement.
  ["level-nesting", "Z6", "route.level.nesting", "count", "lower", false],
  // MEAS3A, for the steps `router`, `highway` and `group`. Z2 is the count of the hard rule `link-ends`. Z9 needs a result with zoom levels.
  ["Z2.linkEnds", "Z2", "route.level.link-ends", "count", "lower", false],
  ["Z9.mean", "Z9", "route.level.link-agreement", "no unit", "lower", true],
  ["Z3.through", "Z3", "route.level.through", "count", "lower", true],
  ["Z3.length", "Z3", "route.level.link-length", "units", "lower", true],
  ["Z4.farItems", "Z4", "route.level.far-items", "count", "lower", true],
  ["Z7.position", "Z7", "route.level.position", "no unit", "lower", true],
  ["Z8.order", "Z8", "route.level.order", "no unit", "higher", true],
  // SCREEN-MEASURES: Z1 is the count of the hard rule `counts-sum`, as Z2. Z5 is the ratio of the item counts from level to level.
  ["Z1.countsSum", "Z1", "route.level.counts-sum", "count", "lower", false, "The faults of the hard rule `counts-sum`: a level whose items miss a node, or whose links miss an edge. 0 is correct."],
  ["Z5.max", "Z5", "route.level.ratio.max", "ratio", "lower", true, "The largest ratio of the item counts of two levels in sequence. A large ratio is a sudden jump of the zoom."],
  [
    "Z5.spread",
    "Z5",
    "route.level.ratio.spread",
    "no unit",
    "lower",
    true,
    "The standard deviation of the log of the ratios of the item counts of the levels. 0 is a zoom with steps of equal size.",
  ],
  ["G1.modularity", "G1", "route.group.modularity", "no unit", "higher", true],
  ["G2.cut", "G2", "route.group.cut", "share", "lower", true],
  ["G6.balance", "G6", "route.group.balance", "share", "higher", true],
  ["G8.treeCost", "G8", "route.group.tree-cost", "share", "lower", true],
  ["G9.ari", "G9", "route.group.stability", "no unit", "higher", true],
  // SCREEN-MEASURES: G4, G5 and G7 read the boxes of the items of the levels.
  ["G4.fill", "G4", "route.group.fill", "share", "higher", true, "The mean share of the box of a group of the far view that the boxes of its nodes fill. A full group box is 1."],
  ["G5.overlaps", "G5", "route.group.overlaps", "count", "lower", true, "The number of pairs of items of one level whose boxes overlap. 0 is correct."],
  [
    "G7.silhouette",
    "G7",
    "route.group.silhouette",
    "no unit",
    "higher",
    true,
    "The mean silhouette of the nodes of the far view: how much nearer a node is to its group than to the nearest other group.",
  ],
  // The curves. A curve draws a fixed polyline, so no measure of a curve depends on the placement.
  ["C1.max", "C1", "route.curve.c1.max", "degrees", "lower", false],
  ["C1.share", "C1", "route.curve.c1.share", "share", "lower", false],
  ["C2.median", "C2", "route.curve.c2.median", "no unit", "lower", false],
  ["C2.max", "C2", "route.curve.c2.max", "no unit", "lower", false],
  ["C3.median", "C3", "route.curve.c3.median", "no unit", "lower", false],
  ["C3.q95", "C3", "route.curve.c3.q95", "no unit", "lower", false],
  // SCREEN-MEASURES: C4 is the change of the curvature along a curve. C8 is the distance of a curve from its route.
  ["C4.median", "C4", "route.curve.c4.median", "no unit", "lower", false, "The median curvature variation of the curves, without a unit. A circle or a straight line is 0. A sudden change of the curvature is large."],
  ["C4.q95", "C4", "route.curve.c4.q95", "no unit", "lower", false, "The 0.95 quantile of the curvature variation of the curves. It shows the worst curves."],
  ["C8.median", "C8", "route.curve.c8.median", "no unit", "lower", false, "The median Fréchet distance of a curve from the polyline of its route, divided by the unit of the board."],
  ["C8.max", "C8", "route.curve.c8.max", "no unit", "lower", false, "The largest Fréchet distance of a curve from the polyline of its route, divided by the unit of the board."],
  ["C5.peak", "C5", "route.curve.c5.peak", "curvature times the unit of the board", "lower", false],
  ["C6.length", "C6", "route.curve.c6.length", "ratio", "lower", false],
  ["curve-clear", "C7", "route.curve.rule.clear", "count", "lower", false],
  ["curve-ends", "C10", "route.curve.rule.ends", "count", "lower", false],
  ["curve-g1", "C1", "route.curve.rule.g1", "count", "lower", false],
  ["curve-simple", "C9", "route.curve.rule.simple", "count", "lower", false],
];

/**
 * The measures of the records of the stage `route`, with the placement dependence of each one.
 * A joint harness that moves the boxes and routes the edges reads `placementDependent`.
 * It compares a measure with the value `true` only between runs on the same input.
 */
export const MEASURES: readonly MeasureInfo[] = Object.freeze(
  ROWS.map(([key, id, name, unit, better, placementDependent, definition]) => {
    const rule = MIN_EFFECT_BY_UNIT.get(unit);
    if (!rule) throw new Error(`MEASURES: the unit "${unit}" of ${key} has no rule in MIN_EFFECTS`);
    const flag = ESTIMATED_BY[key];
    const estimatedBy = flag === undefined ? undefined : ROWS.find((r) => r[0] === flag)?.[2];
    if (flag !== undefined && estimatedBy === undefined) throw new Error(`MEASURES: the flag ${flag} of ${key} is not a row`);
    const range = RANGE_BY_KEY.get(key) ?? RANGE_BY_UNIT.get(unit);
    if (!range) throw new Error(`MEASURES: the unit "${unit}" of ${key} has no rule in RANGES`);
    const info: MeasureInfo = {
      key,
      id,
      name,
      unit,
      better,
      placementDependent,
      min: range.min,
      max: range.max,
      ...(definition === undefined ? {} : { definition }),
      ...(estimatedBy === undefined ? {} : { estimatedBy }),
    };
    return Object.freeze(rule.minEffect === undefined ? info : { ...info, minEffect: rule.minEffect });
  }),
);

/** This function gives the spec of a compare of a measure: its better side and its minimum effect. */
export function compareSpec(info: MeasureInfo): CompareSpec {
  return info.minEffect === undefined ? { direction: info.better } : { direction: info.better, minEffect: info.minEffect };
}

/**
 * This function tells if two values of the measure `info` are of one kind: two full counts, or two estimates (BENCH-PAIRS-HEAP).
 * `a` and `b` are the measures of two records by name. A missing flag is a full count.
 */
export function sameKind(info: MeasureInfo, a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  if (info.estimatedBy === undefined) return true;
  return (a[info.estimatedBy] ?? 0) === (b[info.estimatedBy] ?? 0);
}

/**
 * This function removes the value of the measure `info` from each record of an input and seed where the records do not have one kind.
 * Thus a verdict that pairs the records by input and seed does not pair an estimate with a full count.
 */
export function withoutMixedKinds<R extends { readonly input: string; readonly seed: number; readonly measures: Readonly<Record<string, number>> }>(
  records: readonly R[],
  info: MeasureInfo,
): R[] {
  const flag = info.estimatedBy;
  if (flag === undefined) return [...records];
  const kinds = new Map<string, Set<number>>();
  for (const r of records) {
    if (r.measures[info.name] === undefined) continue;
    const key = `${r.input}#${r.seed}`;
    const set = kinds.get(key) ?? new Set<number>();
    set.add(r.measures[flag] ?? 0);
    kinds.set(key, set);
  }
  return records.map((r) => {
    if ((kinds.get(`${r.input}#${r.seed}`)?.size ?? 0) < 2) return r;
    const { [info.name]: _dropped, ...measures } = r.measures;
    return { ...r, measures };
  });
}

const BY_KEY: ReadonlyMap<string, MeasureInfo> = new Map(MEASURES.map((m) => [m.key, m]));
const BY_NAME: ReadonlyMap<string, MeasureInfo> = new Map(MEASURES.map((m) => [m.name, m]));

/** This function gives the measure of a key of `runSuite` or `compareStep`, or `undefined` for a key that is not in `MEASURES`. */
export function measureByKey(key: string): MeasureInfo | undefined {
  return BY_KEY.get(key);
}

/** This function gives the measure of a name of a record, or `undefined` for a name that is not in `MEASURES`. */
export function measureByName(name: string): MeasureInfo | undefined {
  return BY_NAME.get(name);
}

/** This function gives the name of a key in a record. A key that is not in `MEASURES` gets the name `route.other.<key>`. */
export function measureName(key: string): string {
  return BY_KEY.get(key)?.name ?? `route.other.${key.toLowerCase()}`;
}

/** This function gives the objectives of a Pareto front by the names of a record, from objectives by the keys of `runSuite`. */
export function namedObjectives(objectives: readonly Objective[]): Objective[] {
  return objectives.map((o) => ({ key: measureName(o.key), better: o.better }));
}
