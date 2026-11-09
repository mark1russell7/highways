// The measures of a sweep record (EXPLORER-1): the id of each measure in a record of `sweep.ts`, and its name in a screen record.
// The sweep writes the records, and `space-fits.ts` reads them. So both import this one table.

/** One measure of a sweep record: the id in the record, the name in a screen record, the label and the unit. Lower is better for each. */
export interface SweepMeasure {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly unit: string;
}

/** The measures of the routes. Each record has them. */
export const ROUTE_MEASURES: readonly SweepMeasure[] = Object.freeze([
  { id: "crossings", key: "route.crossings", label: "Crossings", unit: "count" },
  { id: "bends", key: "route.bends", label: "Bends for each route", unit: "count" },
  { id: "length", key: "route.ink", label: "Ink length", unit: "units" },
  { id: "ms", key: "ms", label: "Time in one process", unit: "ms" },
]);

/** The measures of the board that the screen of the step `whole` gives (M2, M3 and M5). A room record also has them. */
export const BOARD_MEASURES: readonly SweepMeasure[] = Object.freeze([
  { id: "order", key: "route.room.order", label: "Pairs of boxes with a changed order", unit: "count" },
  { id: "displacement", key: "route.room.displacement", label: "Mean move of a box, over the unit of the board", unit: "no unit" },
  { id: "distortion", key: "route.room.distortion", label: "Stress of the distances to the 4 nearest boxes", unit: "0 to 1" },
]);

/** The suffix of the id of a ratio measure. A ratio divides a value by the value of its strategy at the defaults on the same input. */
export const RATIO_SUFFIX = ".ratio";

/**
 * This function gives the name in a screen record of a measure id of a sweep record, or `undefined` for an unknown id.
 * The field `name` of `MEASURES` has the same names. The ratio `crossings.ratio` has the name of `crossings`.
 */
export function measureNameOf(id: string): string | undefined {
  const base = id.endsWith(RATIO_SUFFIX) ? id.slice(0, -RATIO_SUFFIX.length) : id;
  return [...ROUTE_MEASURES, ...BOARD_MEASURES].find((m) => m.id === base)?.key;
}
