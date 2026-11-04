import { dist } from "../../geom.ts";
import type { Route } from "../../model.ts";

/** The overlap of the routes of a result (B11 of MEAS0). */
export interface RouteOverlap {
  /** The share of the length of all routes on a piece of a line with two routes or more, from 0 to 1. Lower is better. */
  readonly share: number;
  /** The most routes on one piece of a line. A board with no routes gives 0. Lower is better. */
  readonly peak: number;
}

/** One leg of a route on an axis line. */
interface Leg {
  readonly lo: number;
  readonly hi: number;
  readonly route: number;
}

/**
 * This function gives the overlap of the routes (B11 of MEAS0). It reads the legs on the axes, and it finds legs that overlap in part.
 * The ink measure B1 reads only segments with the same two ends, and it gives credit for shared length. This measure gives the cost.
 * A router with lanes draws its shared lines apart, so this measure counts for a router with no lanes.
 */
export function routeOverlap(routes: readonly Route[]): RouteOverlap {
  const lines = new Map<string, Leg[]>();
  let length = 0;
  const add = (key: string, a: number, b: number, route: number): void => {
    const list = lines.get(key) ?? [];
    list.push({ lo: Math.min(a, b), hi: Math.max(a, b), route });
    lines.set(key, list);
  };
  routes.forEach((r, route) => {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]!;
      const b = r.points[i]!;
      length += dist(a, b);
      if (a.x === b.x && a.y !== b.y) add(`x${a.x}`, a.y, b.y, route);
      else if (a.y === b.y && a.x !== b.x) add(`y${a.y}`, a.x, b.x, route);
    }
  });
  let shared = 0;
  let peak = routes.length > 0 ? 1 : 0;
  for (const legs of lines.values()) {
    const events = legs.flatMap((l) => [{ at: l.lo, route: l.route, step: 1 }, { at: l.hi, route: l.route, step: -1 }]).sort((p, q) => p.at - q.at);
    const open = new Map<number, number>();
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      const left = (open.get(e.route) ?? 0) + e.step;
      if (left === 0) open.delete(e.route);
      else open.set(e.route, left);
      const next = events[i + 1];
      if (next === undefined || next.at === e.at) continue;
      if (open.size >= 2) shared += (next.at - e.at) * open.size;
      peak = Math.max(peak, open.size);
    }
  }
  return { share: length > 0 ? shared / length : 0, peak };
}

/** The routers that have no lanes, so each route on a shared line lies on top of the others. Only these routers get the limits of B11. */
export const NO_LANES_ROUTERS: readonly string[] = Object.freeze(["seams"]);

/** The router that gives the base of the limits of B11. Each limit compares two results on one input. */
export const OVERLAP_BASE = "corners";

/** The limits of B11, as the largest rise over the base router on one input. A board can have overlap with no fault of the router, so a limit is not absolute. */
export const OVERLAP_LIMITS: readonly { readonly id: string; readonly name: string; readonly rise: number }[] = Object.freeze([
  { id: "B11 share", name: "route.overlap.share", rise: 0.1 },
  { id: "B11 peak", name: "route.overlap.peak", rise: 2 },
]);

/** One record of a screen, with the fields that a limit of B11 reads. */
export interface OverlapRecord {
  readonly strategy: string;
  readonly input: string;
  readonly measures: Readonly<Record<string, number>>;
  readonly skipped?: unknown;
}

/** One limit of B11 for one strategy. The label is `over` when one input or more passes the limit. */
export interface OverlapLimitRow {
  readonly strategy: string;
  readonly guard: string;
  readonly measure: string;
  readonly base: string;
  readonly limit: number;
  readonly worst: number;
  readonly worstInput: string;
  readonly over: number;
  readonly of: number;
  readonly families: readonly string[];
  readonly label: "within" | "over";
}

/**
 * This function gives a row for each limit of B11 and each router with no lanes in the records. The verdict of a guard measure compares a strategy with the default.
 * These rows compare it with the base router, on one input at a time. A record with no value stops the function, so a missing measure cannot pass a limit.
 */
export function overlapLimitRows(records: readonly OverlapRecord[], familyOf: (input: string) => string): OverlapLimitRow[] {
  const strategies = NO_LANES_ROUTERS.filter((s) => records.some((r) => r.strategy === s));
  const rows: OverlapLimitRow[] = [];
  for (const strategy of strategies) {
    for (const { id, name, rise } of OVERLAP_LIMITS) {
      const base = new Map(records.filter((r) => r.strategy === OVERLAP_BASE && r.skipped === undefined).map((r) => [r.input, r.measures[name]]));
      const own = records.filter((r) => r.strategy === strategy && r.skipped === undefined);
      if (own.length === 0) throw new Error(`The strategy ${strategy} has no records for the limit ${id}.`);
      let worst = Number.NEGATIVE_INFINITY;
      let worstInput = "";
      let over = 0;
      const families = new Set<string>();
      for (const r of own) {
        const a = r.measures[name];
        const b = base.get(r.input);
        if (a === undefined || b === undefined) throw new Error(`The limit ${id} has no value for ${strategy} or ${OVERLAP_BASE} on ${r.input}.`);
        const up = a - b;
        if (up > worst) {
          worst = up;
          worstInput = r.input;
        }
        if (up > rise) {
          over++;
          families.add(familyOf(r.input));
        }
      }
      rows.push({ strategy, guard: id, measure: name, base: OVERLAP_BASE, limit: rise, worst, worstInput, over, of: own.length, families: [...families].sort(), label: over > 0 ? "over" : "within" });
    }
  }
  return rows;
}
