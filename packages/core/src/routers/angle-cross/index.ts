/**
 * The router `angle-cross` (WILD-025): angle-priced crossings, after the right angle crossings of Didimo, Eades and Liotta (2009).
 * A crossing costs less near a right angle. So a way that cannot avoid a crossing moves it to a steeper place when the price of the way falls.
 */
import { dist, segmentsCross, type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";
import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { sharedRouter, type SharedSearch, type Way } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `angle-cross` (WILD-025). */
export interface AngleCrossOptions {
  /** The base price of each crossing, from 0 to 50. The default is 10. */
  readonly alpha0: number;
  /** The price of a shallow crossing on top of the base price, from 0 to 100. The default is 40. */
  readonly alpha: number;
  /** The whole power of `1 - sin θ`, from 1 to 4. The default is 2. */
  readonly p: number;
  /** The number of rounds over the ways with crossings, from 1 to 5. The default is 1. */
  readonly rounds: number;
}

/** The default options of the router `angle-cross`. */
export const ANGLE_CROSS_DEFAULTS: Readonly<AngleCrossOptions> = Object.freeze({ alpha0: 10, alpha: 40, p: 2, rounds: 1 });

/** The declarations of the options of the router `angle-cross` (WILD-025). */
export const ANGLE_CROSS_SCHEMA: OptionSchema<AngleCrossOptions> = {
  alpha0: { type: "number", min: 0, max: 50, step: 1, marks: [0, 10, 50], default: 10, describe: "The base price of each crossing." },
  alpha: { type: "number", min: 0, max: 100, step: 1, marks: [0, 40, 100], default: 40, describe: "The price of a shallow crossing on top of the base price." },
  p: { type: "integer", min: 1, max: 4, step: 1, default: 2, describe: "The power of one less the sine of the crossing angle." },
  rounds: { type: "integer", min: 1, max: 5, step: 1, default: 1, describe: "The number of rounds over the ways with crossings." },
};

/**
 * This function gives the price of a crossing of the legs `ab` and `cd`: `alpha0 + alpha × (1 - sin θ)^p`.
 * The sine comes from the cross product, so the value does not depend on `Math.sin`.
 */
export function crossingPrice(a: Point, b: Point, c: Point, d: Point, o: Readonly<Pick<AngleCrossOptions, "alpha0" | "alpha" | "p">>): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;
  const sine = Math.min(1, Math.abs(ux * vy - uy * vx) / Math.max(1e-12, dist(a, b) * dist(c, d)));
  let rest = 1;
  for (let i = 0; i < Math.max(1, Math.floor(o.p)); i++) rest *= 1 - sine;
  return o.alpha0 + o.alpha * rest;
}

/** One leg of a way in the grid of the legs. A dead leg belongs to a way that moved, or to the way of the search. */
interface Leg {
  readonly a: Point;
  readonly b: Point;
  readonly edge: string;
  live: boolean;
}

/**
 * This function moves the crossings of the ways of `shared` to steeper angles (WILD-025).
 * The price of a way is its length plus the price of each crossing with a leg of another way. Each way with a crossing gets a new search with those prices.
 * The search goes through the corners, so a clear straight way can move too. A new way stays only when its price is lower.
 * The ways go in the order of their price of crossings, the largest first.
 */
export function angleCrossWays(ways: readonly Way[], search: SharedSearch, options: Partial<AngleCrossOptions> = {}): void {
  const o = { ...ANGLE_CROSS_DEFAULTS, ...options };
  const points = search.points;
  const through = search.through;
  if (!points || !through) return;
  const found = ways.filter((w) => w.found && w.seq.length >= 2);
  const grid = new Grid<Leg>(64);
  const legs = new Map<Way, Leg[]>();
  const lay = (w: Way): void => {
    const list: Leg[] = [];
    for (let i = 1; i < w.seq.length; i++) {
      const leg = { a: w.seq[i - 1]!, b: w.seq[i]!, edge: w.edge.id, live: true };
      list.push(leg);
      grid.addSegment(leg, leg.a, leg.b);
    }
    legs.set(w, list);
  };
  for (const w of found) lay(w);
  const crossPrice = (a: Point, b: Point): number => {
    let sum = 0;
    grid.querySegment(a, b, 0, (l) => {
      if (l.live && segmentsCross(a, b, l.a, l.b)) sum += crossingPrice(a, b, l.a, l.b, o);
    });
    return sum;
  };
  const extra = (seq: readonly Point[]): number => {
    let sum = 0;
    for (let i = 1; i < seq.length; i++) sum += crossPrice(seq[i - 1]!, seq[i]!);
    return sum;
  };
  const length = (seq: readonly Point[]): number => {
    let sum = 0;
    for (let i = 1; i < seq.length; i++) sum += dist(seq[i - 1]!, seq[i]!);
    return sum;
  };
  const setLive = (w: Way, live: boolean): void => {
    for (const l of legs.get(w) ?? []) l.live = live;
  };
  // The price of the crossings of a way, without its own legs.
  const extraOf = (w: Way): number => {
    setLive(w, false);
    const v = extra(w.seq);
    setLive(w, true);
    return v;
  };
  for (let round = 0; round < Math.max(1, Math.floor(o.rounds)); round++) {
    const ranked = found
      .map((w) => ({ w, price: extraOf(w) }))
      .filter((x) => x.price > 0)
      .sort((p, q) => q.price - p.price || (p.w.edge.id < q.w.edge.id ? -1 : p.w.edge.id > q.w.edge.id ? 1 : 0));
    let moved = 0;
    for (const { w } of ranked) {
      setLive(w, false);
      const before = length(w.seq) + extra(w.seq);
      const memo = new Map<number, number>();
      const cost = (i: number, j: number, d: number): number => {
        const k = search.link(i, j);
        let v = memo.get(k);
        if (v === undefined) memo.set(k, (v = crossPrice(points[i]!, points[j]!)));
        return d + v;
      };
      const next = through(w, cost, 1);
      if (next && length(next.seq) + extra(next.seq) < before - 1e-9) {
        w.seq = next.seq;
        w.ids = next.ids;
        w.held = true;
        lay(w);
        moved++;
      } else setLive(w, true);
    }
    if (moved === 0) break;
  }
}

/** This function makes the router `angle-cross` (WILD-025). It is the router `shared`, then the rounds of `angleCrossWays`. */
export function angleCrossRouter(options: Partial<AngleCrossOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  return sharedRouter({ name: options.name, ...(options.rule === undefined ? {} : { rule: options.rule }), ...(options.maxNodes === undefined ? {} : { maxNodes: options.maxNodes }) }, undefined, {
    refine: (ways, search) => angleCrossWays(ways, search, options),
  });
}

/**
 * The router strategy `angle-cross` (WILD-025), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const angleCrossStrategy: Strategy<"router", AngleCrossOptions> = defineStrategy({
  step: "router",
  name: "angle-cross",
  describe: "Angle-priced crossings (WILD-025). The ways of `shared` with crossings get a new search, and each crossing costs less near a right angle.",
  defaults: { ...ANGLE_CROSS_DEFAULTS },
  schema: ANGLE_CROSS_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<AngleCrossOptions>): Result => angleCrossRouter({ ...o, name: "angle-cross", rule: byCollection }).route(graph),
});
