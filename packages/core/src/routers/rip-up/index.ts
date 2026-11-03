import { goesOutAndBack } from "../../bench/links.ts";
import { rng } from "../../fixtures.ts";
import { dist, segmentsCross, type Point } from "../../geom.ts";
import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { sharedRouter, type SharedSearch, type Way } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The ways that a round of `rip-up` takes off: the ways with a fault, or also the ways that cross them. */
export type RipUpScope = "fault" | "neighbours";

/** The order of the new searches of a round of `rip-up`: the largest fault first, or a seeded order. */
export type RipUpOrder = "fault" | "seed";

/** The options of the router `rip-up` (EDA-010: rip-up and reroute after the first pass). */
export interface RipUpOptions {
  /** The number of rounds, from 1 to 5. The default is 2. */
  readonly rounds: number;
  /** The ways that a round takes off. The default is `neighbours`. */
  readonly scope: RipUpScope;
  /** The order of the new searches. The default is `fault`. */
  readonly order: RipUpOrder;
  /** The seed of the order `seed`, from 0 to 99. The default is 0. */
  readonly seed: number;
  /** The price of each edge of another key on a link, from 0 to 2. The default is 0.5. */
  readonly beta: number;
  /** The discount of a link that an edge of the same key uses, from 0 to 0.9. The default is 0.5. */
  readonly gamma: number;
  /** The price of one crossing with a way of another key, as a length, from 0 to 64. The default is 16. An out-and-back way costs 4 times this price. */
  readonly cross: number;
}

/** The default options of the router `rip-up`. */
export const RIP_UP_DEFAULTS: Readonly<RipUpOptions> = Object.freeze({ rounds: 2, scope: "neighbours", order: "fault", seed: 0, beta: 0.5, gamma: 0.5, cross: 16 });

/** The declarations of the options of the router `rip-up` (EDA-010). */
export const RIP_UP_SCHEMA: OptionSchema<RipUpOptions> = {
  rounds: { type: "integer", min: 1, max: 5, step: 1, marks: [1, 2, 3, 5], default: 2, describe: "The number of rounds of rip-up and reroute." },
  scope: { type: "enum", values: ["fault", "neighbours"], default: "neighbours", describe: "The ways that a round takes off: the ways with a fault, or also the ways that cross them." },
  order: { type: "enum", values: ["fault", "seed"], default: "fault", describe: "The order of the new searches: the largest fault first, or a seeded order." },
  seed: { type: "integer", min: 0, max: 99, step: 1, default: 0, describe: "The seed of the order seed." },
  beta: { type: "number", min: 0, max: 2, step: 0.05, marks: [0, 0.5, 1, 2], default: 0.5, describe: "The price of each edge of another key on a link." },
  gamma: { type: "number", min: 0, max: 0.9, step: 0.05, marks: [0, 0.5, 0.9], default: 0.5, describe: "The discount of a link that an edge of the same key uses." },
  cross: { type: "number", min: 0, max: 64, step: 1, marks: [0, 8, 16, 32, 64], default: 16, describe: "The price of one crossing with a way of another key, as a length." },
};

/** A segment of a way in the grid of `SegmentGrid`. */
interface Piece {
  readonly a: Point;
  readonly b: Point;
  readonly way: number;
}

/** A grid of the segments of the ways. Each segment is in each cell of its bounding box. */
class SegmentGrid {
  readonly #cells = new Map<number, Piece[]>();
  readonly #size: number;
  readonly #of = new Map<number, { pieces: Piece[]; keys: number[] }>();
  #stamp = 0;
  readonly #seen = new Map<Piece, number>();

  constructor(size: number) {
    this.#size = size;
  }

  /** This method gives the keys of the cells of the bounding box of the segment from `a` to `b`. */
  #keys(a: Point, b: Point): number[] {
    const s = this.#size;
    const x0 = Math.floor(Math.min(a.x, b.x) / s);
    const x1 = Math.floor(Math.max(a.x, b.x) / s);
    const y0 = Math.floor(Math.min(a.y, b.y) / s);
    const y1 = Math.floor(Math.max(a.y, b.y) / s);
    const out: number[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push((x + 32768) * 65536 + (y + 32768));
    return out;
  }

  /** This method puts the segments of the way `w`, with the points `seq`, in the grid. */
  add(w: number, seq: readonly Point[]): void {
    const pieces: Piece[] = [];
    const keys: number[] = [];
    for (let i = 1; i < seq.length; i++) {
      const p: Piece = { a: seq[i - 1]!, b: seq[i]!, way: w };
      pieces.push(p);
      for (const k of this.#keys(p.a, p.b)) {
        let list = this.#cells.get(k);
        if (!list) this.#cells.set(k, (list = []));
        list.push(p);
        keys.push(k);
      }
    }
    this.#of.set(w, { pieces, keys });
  }

  /** This method takes the segments of the way `w` out of the grid. */
  remove(w: number): void {
    const own = this.#of.get(w);
    if (!own) return;
    for (const k of own.keys) {
      const list = this.#cells.get(k);
      if (!list) continue;
      const kept = list.filter((p) => p.way !== w);
      if (kept.length > 0) this.#cells.set(k, kept);
      else this.#cells.delete(k);
    }
    this.#of.delete(w);
  }

  /** This method gives the ways of the segments that cross the segment from `a` to `b`, once for each crossing. */
  crossing(a: Point, b: Point): number[] {
    const stamp = ++this.#stamp;
    const out: number[] = [];
    for (const k of this.#keys(a, b)) {
      for (const p of this.#cells.get(k) ?? []) {
        if (this.#seen.get(p) === stamp) continue;
        this.#seen.set(p, stamp);
        if (segmentsCross(a, b, p.a, p.b)) out.push(p.way);
      }
    }
    return out;
  }
}

/**
 * This function rips up and reroutes the ways of `shared` with a fault (EDA-010, after the rip-up and reroute of Nair 1987).
 * A fault is a crossing with a way of another key, or a way that goes out and back (`goesOutAndBack`).
 * Each round takes off the ways with a fault, and with the scope `neighbours` also the ways that cross them.
 * The ways get new searches in the order of the round, with the other ways fixed. A link costs `max(0.05, 1 + beta × others - gamma × same)` times its length,
 * plus `cross` for each crossing with a way of another key. A round stays only when the total cost of all the ways falls.
 */
export function ripUpWays(ways: readonly Way[], search: SharedSearch, options: Partial<RipUpOptions> = {}): void {
  const o = { ...RIP_UP_DEFAULTS, ...options };
  const n = search.corners;
  const found = ways.filter((w) => w.found && w.ids.length >= 2);
  if (found.length < 2) return;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const w of found) {
    for (const p of w.seq) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
  }
  const grid = new SegmentGrid(Math.max(16, Math.max(x1 - x0, y1 - y0) / 48));
  found.forEach((w, i) => grid.add(i, w.seq));
  const use = new Map<number, Map<string, number>>();
  const change = (w: Way, by: number): void => {
    for (let i = 1; i < w.ids.length; i++) {
      const a = w.ids[i - 1]!;
      const b = w.ids[i]!;
      if (a >= n || b >= n) continue;
      const k = search.link(a, b);
      let m = use.get(k);
      if (!m) use.set(k, (m = new Map()));
      const next = (m.get(w.key) ?? 0) + by;
      if (next > 0) m.set(w.key, next);
      else m.delete(w.key);
    }
  };
  for (const w of found) change(w, 1);
  const factor = (i: number, j: number, key: string): number => {
    let others = 0;
    let same = 0;
    for (const [k, c] of use.get(search.link(i, j)) ?? []) {
      if (k === key) same = 1;
      else others += c;
    }
    return Math.max(0.05, 1 + o.beta * others - o.gamma * same);
  };
  /** This function gives the ways of other keys that the segment from `a` to `b` of the way `self` crosses. */
  const crossers = (self: number, a: Point, b: Point): number[] => grid.crossing(a, b).filter((v) => v !== self && found[v]!.key !== found[self]!.key);
  const crossingsOf = (i: number): number[] => {
    const seq = found[i]!.seq;
    const out: number[] = [];
    for (let s = 1; s < seq.length; s++) out.push(...crossers(i, seq[s - 1]!, seq[s]!));
    return out;
  };
  const priceOf = (w: Way): number => {
    let p = 0;
    for (let i = 1; i < w.seq.length; i++) {
      const a = w.ids[i - 1]!;
      const b = w.ids[i]!;
      const d = dist(w.seq[i - 1]!, w.seq[i]!);
      p += a < n && b < n ? d * factor(a, b, w.key) : d;
    }
    return p;
  };
  const total = (): number => {
    let sum = 0;
    let crossings = 0;
    for (let i = 0; i < found.length; i++) {
      const w = found[i]!;
      sum += priceOf(w) + (goesOutAndBack(w.seq) ? 4 * o.cross : 0);
      crossings += crossingsOf(i).length;
    }
    // Each crossing counts once for each of its two ways.
    return sum + (o.cross * crossings) / 2;
  };
  const floor = Math.max(0.05, 1 - o.gamma);
  const points = search.points;
  const random = rng(Math.floor(o.seed) * 2654435761 + 1);
  for (let round = 0; round < Math.max(1, Math.floor(o.rounds)); round++) {
    const weight = new Map<number, number>();
    const near = new Map<number, Set<number>>();
    for (let i = 0; i < found.length; i++) {
      const hits = crossingsOf(i);
      const back = goesOutAndBack(found[i]!.seq) ? 4 : 0;
      if (hits.length + back > 0) weight.set(i, hits.length + back);
      near.set(i, new Set(hits));
    }
    if (weight.size === 0) break;
    const chosen = new Set(weight.keys());
    if (o.scope === "neighbours") for (const i of weight.keys()) for (const j of near.get(i)!) chosen.add(j);
    let list = [...chosen].sort((a, b) => a - b);
    if (o.order === "seed") {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j]!, list[i]!];
      }
    } else list = list.sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0) || a - b);
    const before = total();
    const saved = list.map((i) => ({ i, seq: found[i]!.seq, ids: found[i]!.ids }));
    for (const i of list) {
      change(found[i]!, -1);
      grid.remove(i);
    }
    for (const i of list) {
      const w = found[i]!;
      // The crossings of each link, for this search. The other ways do not change during the search.
      const memo = new Map<number, number>();
      const crossPrice = (a: number, b: number): number => {
        if (!points || o.cross <= 0) return 0;
        const k = search.link(a, b);
        let c = memo.get(k);
        if (c === undefined) memo.set(k, (c = o.cross * crossers(i, points[a]!, points[b]!).length));
        return c;
      };
      const next = search.find(w, (a, b, d) => d * factor(a, b, w.key) + crossPrice(a, b), floor);
      if (next) {
        w.seq = next.seq;
        w.ids = next.ids;
      }
      change(w, 1);
      grid.add(i, w.seq);
    }
    if (total() < before - 1e-9) continue;
    for (const { i, seq, ids } of saved) {
      const w = found[i]!;
      change(w, -1);
      grid.remove(i);
      w.seq = seq;
      w.ids = ids;
      change(w, 1);
      grid.add(i, seq);
    }
    break;
  }
}

/**
 * This function makes the router `rip-up` (EDA-010). It is the router `shared`, then the rounds of `ripUpWays`.
 * The runs and the bundles come from the ways after the rounds.
 */
export function ripUpRouter(options: Partial<RipUpOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...RIP_UP_DEFAULTS, ...options };
  return sharedRouter({ name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) }, undefined, {
    refine: (ways, search) => ripUpWays(ways, search, o),
  });
}

/**
 * The router strategy `rip-up` (EDA-010), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const ripUpStrategy: Strategy<"router", RipUpOptions> = defineStrategy({
  step: "router",
  name: "rip-up",
  describe: "Rip-up and reroute (EDA-010). The ways of `shared` with a crossing or an out-and-back fault get new searches, and a round stays when the cost falls.",
  defaults: { ...RIP_UP_DEFAULTS },
  schema: RIP_UP_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<RipUpOptions>): Result => ripUpRouter({ ...o, name: "rip-up", rule: byCollection }).route(graph),
});
