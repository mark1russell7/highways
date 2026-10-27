import type { Objective } from "../measures/pareto.ts";

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
}

/** The text of a row of `MEASURES`: the key, the id, the name, the unit, the better side and the placement dependence. */
type Row = readonly [key: string, id: string, name: string, unit: string, better: "lower" | "higher", placement: boolean];

const ROWS: readonly Row[] = [
  // The routes. A placement makes crossings, plugs on short sides and boxes that touch, so these measures depend on it.
  ["R1.crossings", "R1", "route.crossings", "count", "lower", true],
  ["R1.perEdge", "R1", "route.crossings.per-edge", "count for each edge", "lower", true],
  ["R2.angle", "R2", "route.crossing-angle.mean", "0 to 1", "higher", true],
  ["R2.min", "R2", "route.crossing-angle.min", "degrees", "higher", true],
  ["R3.bends", "R3", "route.bends", "count for each route", "lower", false],
  ["R4.turn", "R4", "route.turn.mean", "half turns for each route", "lower", false],
  ["R4.max", "R4", "route.turn.max", "degrees", "lower", false],
  ["R5.median", "R5", "route.detour.median", "ratio", "lower", false],
  ["R5.q95", "R5", "route.detour.q95", "ratio", "lower", false],
  ["R5.mean", "R5", "route.detour.mean", "ratio", "lower", false],
  ["R6.worstDetour", "R6", "route.detour.max", "ratio", "lower", false],
  ["R7.backtrack", "R7", "route.backtrack", "0 to 1", "lower", false],
  ["R8.clearance", "R8", "route.clearance.mean", "units", "higher", true],
  ["R8.tight", "R8", "route.clearance.tight", "0 to 1", "lower", true],
  ["R9.through", "R9", "route.through", "count", "lower", true],
  ["R10.plugAngle", "R10", "route.plug-angle", "degrees", "lower", false],
  ["R11.min", "R11", "route.plug-spacing.min", "0 to 1", "higher", true],
  ["R11.q05", "R11", "route.plug-spacing.q05", "0 to 1", "higher", true],
  ["R13.outside", "R13", "route.outside", "count", "lower", false],
  ["R15.inflections", "R15", "route.inflections", "count for each route", "lower", false],
  ["ink", "R1", "route.ink", "units", "lower", true],
  // The bundles.
  ["B1.inkSaved", "B1", "route.bundle.ink-saved", "0 to 1", "higher", false],
  ["B4.ambiguity", "B4", "route.bundle.ambiguity", "0 to 1", "lower", false],
  // B2, B3 and B6 score the shared ways of the routes for a fixed placement, as B1 does. B3 compares with the routes of `corners` on the same input.
  ["B2.share", "B2", "route.bundle.share", "0 to 1", "higher", false],
  ["B3.median", "B3", "route.bundle.stretch.median", "ratio", "lower", false],
  ["B3.q95", "B3", "route.bundle.stretch.q95", "ratio", "lower", false],
  ["B6.max", "B6", "route.bundle.merge-angle.max", "degrees", "lower", false],
  // The order fragility (W3 of MEAS3, from WILD-056): the spread of a measure over random orders of the edges. The placement can move it.
  ["W3.crossings", "W3", "route.order.crossings", "IQR over the median", "lower", true],
  ["W3.detour", "W3", "route.order.detour", "IQR over the median", "lower", true],
  ["W3.inkSaved", "W3", "route.order.ink-saved", "IQR over the median", "lower", true],
  ["W3.ink", "W3", "route.order.ink", "IQR over the median", "lower", true],
  ["W3.changed", "W3", "route.order.changed", "0 to 1", "lower", true],
  ["W3.poa", "W3", "route.order.poa", "ratio", "lower", true],
  // The stability after the small change of `changeGraph`, and against the run on the base input of a variant.
  ["Z10.mean", "Z10", "route.stability.mean", "units of the board", "lower", false],
  ["Z10.max", "Z10", "route.stability.max", "units of the board", "lower", false],
  ["Z10.moved", "Z10", "route.stability.moved", "0 to 1", "lower", false],
  ["Z10.base.mean", "Z10", "route.stability.base.mean", "units of the board", "lower", false],
  ["Z10.base.max", "Z10", "route.stability.base.max", "units of the board", "lower", false],
  ["Z10.base.moved", "Z10", "route.stability.base.moved", "0 to 1", "lower", false],
  // The stability of a highway strategy over a sequence of seeded edits, with its plan before each edit (the screen option `edits`).
  ["Z10.edits.mean", "Z10", "route.stability.edits.mean", "units of the board", "lower", false],
  ["Z10.edits.moved", "Z10", "route.stability.edits.moved", "0 to 1", "lower", false],
  ["Z10.churn", "Z10", "route.stability.highway-churn", "0 to 1", "lower", false],
  ["Z10.ids", "Z10", "route.stability.highway-ids", "0 to 1", "higher", false],
  // The zoom levels and the groups. The default grouping rule reads the positions, so most of these measures depend on the placement.
  ["level-nesting", "Z6", "route.level.nesting", "count", "lower", false],
  ["Z3.through", "Z3", "route.level.through", "count", "lower", true],
  ["Z3.length", "Z3", "route.level.link-length", "units", "lower", true],
  ["Z4.farItems", "Z4", "route.level.far-items", "count", "lower", true],
  ["Z7.position", "Z7", "route.level.position", "no unit", "lower", true],
  ["Z8.order", "Z8", "route.level.order", "-1 to 1", "higher", true],
  ["G1.modularity", "G1", "route.group.modularity", "-0.5 to 1", "higher", true],
  ["G2.cut", "G2", "route.group.cut", "0 to 1", "lower", true],
  ["G6.balance", "G6", "route.group.balance", "0 to 1", "higher", true],
  ["G8.treeCost", "G8", "route.group.tree-cost", "0 to 1", "lower", true],
  ["G9.ari", "G9", "route.group.stability", "-1 to 1", "higher", true],
  // The curves. A curve draws a fixed polyline, so no measure of a curve depends on the placement.
  ["C1.max", "C1", "route.curve.c1.max", "degrees", "lower", false],
  ["C1.share", "C1", "route.curve.c1.share", "0 to 1", "lower", false],
  ["C2.median", "C2", "route.curve.c2.median", "no unit", "lower", false],
  ["C2.max", "C2", "route.curve.c2.max", "no unit", "lower", false],
  ["C3.median", "C3", "route.curve.c3.median", "no unit", "lower", false],
  ["C3.q95", "C3", "route.curve.c3.q95", "no unit", "lower", false],
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
export const MEASURES: readonly MeasureInfo[] = Object.freeze(ROWS.map(([key, id, name, unit, better, placementDependent]) => Object.freeze({ key, id, name, unit, better, placementDependent })));

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
