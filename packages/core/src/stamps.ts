/**
 * The rule of the stamps of the queries. A grid marks an item with the stamp of the current query.
 * The search of a corner graph and the search of a soft graph mark a corner in the same way.
 * Each query takes the next stamp, and the arrays of the marks hold 32-bit values.
 * A stamp above `STAMP_END` does not fit in such a value, so no mark equals it: a query then loses its marks.
 *
 * A session of a router keeps a grid and a corner graph for many routes, so a stamp can come to that end.
 * At `limit`, the owner of a stamp sets its marks to 0 and starts again at the stamp 1. The cost is one test for each query.
 */
export interface StampRule {
  /** The largest stamp of a query. The default is `STAMP_END`. A test lowers it, so that a few queries come to the limit. */
  limit: number;
  /** The number of times that a grid started its stamps again. */
  gridStarts: number;
  /** The number of times that a corner graph or a soft graph started the stamps of its search again. */
  searchStarts: number;
}

/** The largest value of an entry of an `Int32Array`. */
export const STAMP_END = 0x7fff_ffff;

/** The rule and its counts. The package does not export them. */
export const STAMPS: StampRule = { limit: STAMP_END, gridStarts: 0, searchStarts: 0 };
