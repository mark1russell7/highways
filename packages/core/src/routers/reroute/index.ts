import { dist, type Point } from "../../geom.ts";
import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { sharedRouter, type SharedSearch, type Way } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `reroute` (RULE-044: a corner graph with the prices of the rules, and rounds of rip-up and reroute). */
export interface RerouteOptions {
  /** The price of a link in a narrow channel, from 0 to 2. The default is 1. */
  readonly alpha: number;
  /** The price of each edge of another key on a link, from 0 to 2. The default is 0.5. */
  readonly beta: number;
  /** The discount of a link that an edge of the same key uses, from 0 to 2. The default is 0.5. */
  readonly gamma: number;
  /** The price of a turn, in units of `clearance`, from 0 to 2. The default is 0.25. */
  readonly tau: number;
  /** The number of rounds of rip-up and reroute, from 1 to 5. The default is 2. */
  readonly rounds: number;
  /** The share of the edges that each round rips up: the edges with the largest price over their direct length, from 0.05 to 0.3. The default is 0.15. */
  readonly q: number;
  /** A channel narrower than this width gets the price `alpha`, from 4 to 64. The default is 16. */
  readonly clearance: number;
}

/** The default options of the router `reroute`. */
export const REROUTE_DEFAULTS: Readonly<RerouteOptions> = Object.freeze({ alpha: 1, beta: 0.5, gamma: 0.5, tau: 0.25, rounds: 2, q: 0.15, clearance: 16 });

/** The declarations of the options of the router `reroute` (RULE-044). */
export const REROUTE_SCHEMA: OptionSchema<RerouteOptions> = {
  alpha: { type: "number", min: 0, max: 2, step: 0.05, marks: [0, 1, 2], default: 1, describe: "The price of a link in a narrow channel." },
  beta: { type: "number", min: 0, max: 2, step: 0.05, marks: [0, 0.5, 1], default: 0.5, describe: "The price of each edge of another key on a link." },
  gamma: { type: "number", min: 0, max: 2, step: 0.05, marks: [0, 0.5, 1], default: 0.5, describe: "The discount of a link that an edge of the same key uses." },
  tau: { type: "number", min: 0, max: 2, step: 0.05, marks: [0, 0.25, 1], default: 0.25, describe: "The price of a turn, in units of the clearance." },
  rounds: { type: "integer", min: 1, max: 5, step: 1, marks: [1, 2, 3, 5], default: 2, describe: "The number of rounds of rip-up and reroute." },
  q: { type: "number", min: 0.05, max: 0.3, step: 0.05, marks: [0.05, 0.15, 0.3], default: 0.15, describe: "The share of the edges that each round rips up: the edges with the largest price over their direct length." },
  clearance: { type: "number", min: 4, max: 64, step: 1, marks: [8, 16, 32], default: 16, describe: "A channel narrower than this width gets the price alpha." },
};

/** This function gives the number of turns of a way: the points where the direction changes by more than 1 degree. */
export function turnsOf(seq: readonly Point[]): number {
  let turns = 0;
  for (let i = 1; i + 1 < seq.length; i++) {
    const a = seq[i - 1]!;
    const b = seq[i]!;
    const c = seq[i + 1]!;
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const vx = c.x - b.x;
    const vy = c.y - b.y;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu <= 1e-9 || lv <= 1e-9) continue;
    if (Math.abs(ux * vy - uy * vx) > Math.sin(Math.PI / 180) * lu * lv || ux * vx + uy * vy < 0) turns++;
  }
  return turns;
}

/** The use of one link of the corner graph: the number of edges of each key on it. */
type LinkUse = Map<string, number>;

/**
 * This function rips up and reroutes the ways of `shared` (RULE-044, after the rip-up and reroute of PathFinder, McMurchie 1995).
 * The price factor of a link is `max(0.05, 1 + alpha × narrow + beta × others - gamma × same)`.
 * `narrow` is `max(0, 1 - width / clearance)`. `others` counts the edges of the other keys on the link.
 * `same` is 1 when an edge of the same key uses the link.
 * The price of a way is the sum of the price factor times the length of each link, plus `tau × clearance` for each turn.
 * Each round takes the share `q` of the ways with the largest price over their direct length. Each one gets a new search with the prices of the links.
 * The new way stays only when its price is lower. The search has no state for the turns, so only the comparison reads `tau`.
 */
export function rerouteWays(ways: readonly Way[], search: SharedSearch, options: Partial<RerouteOptions> = {}): void {
  const o = { ...REROUTE_DEFAULTS, ...options };
  const n = search.corners;
  const use = new Map<number, LinkUse>();
  const linksOf = (w: Way): number[] => {
    const out: number[] = [];
    for (let i = 1; i < w.ids.length; i++) {
      const a = w.ids[i - 1]!;
      const b = w.ids[i]!;
      if (a < n && b < n) out.push(search.link(a, b));
    }
    return out;
  };
  const change = (w: Way, by: number): void => {
    for (const k of linksOf(w)) {
      let m = use.get(k);
      if (!m) use.set(k, (m = new Map()));
      const next = (m.get(w.key) ?? 0) + by;
      if (next > 0) m.set(w.key, next);
      else m.delete(w.key);
    }
  };
  const found = ways.filter((w) => w.found && w.ids.length >= 2);
  for (const w of found) change(w, 1);
  const factor = (i: number, j: number, key: string): number => {
    const m = use.get(search.link(i, j));
    let others = 0;
    let same = 0;
    for (const [k, c] of m ?? []) {
      if (k === key) same = 1;
      else others += c;
    }
    const narrow = o.alpha > 0 ? Math.max(0, 1 - search.width(i, j) / o.clearance) : 0;
    return Math.max(0.05, 1 + o.alpha * narrow + o.beta * others - o.gamma * same);
  };
  const priceOf = (seq: readonly Point[], ids: readonly number[], key: string): number => {
    let p = 0;
    for (let i = 1; i < seq.length; i++) {
      const a = ids[i - 1]!;
      const b = ids[i]!;
      const d = dist(seq[i - 1]!, seq[i]!);
      p += a < n && b < n ? d * factor(a, b, key) : d;
    }
    return p + o.tau * o.clearance * turnsOf(seq);
  };
  const floor = Math.max(0.05, 1 - o.gamma);
  const count = (share: number): number => Math.max(1, Math.round(share * found.length));
  for (let round = 0; round < Math.max(1, Math.floor(o.rounds)); round++) {
    const ranked = found
      .map((w) => ({ w, score: priceOf(w.seq, w.ids, w.key) / Math.max(1e-9, dist(w.ps.point, w.pt.point)) }))
      .sort((a, b) => b.score - a.score || (a.w.edge.id < b.w.edge.id ? -1 : a.w.edge.id > b.w.edge.id ? 1 : 0));
    let moved = 0;
    for (const { w } of ranked.slice(0, count(Math.min(0.3, Math.max(0.05, o.q))))) {
      change(w, -1);
      const before = priceOf(w.seq, w.ids, w.key);
      const next = search.find(w, (i, j, d) => d * factor(i, j, w.key), floor);
      if (next && priceOf(next.seq, next.ids, w.key) < before - 1e-9) {
        w.seq = next.seq;
        w.ids = next.ids;
        moved++;
      }
      change(w, 1);
    }
    if (moved === 0) break;
  }
}

/**
 * This function makes the router `reroute` (RULE-044). It is the router `shared`, then the rounds of rip-up and reroute of `rerouteWays`.
 * The runs and the bundles come from the ways after the rounds.
 */
export function rerouteRouter(options: Partial<RerouteOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...REROUTE_DEFAULTS, ...options };
  return sharedRouter({ name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) }, undefined, {
    refine: (ways, search) => rerouteWays(ways, search, o),
  });
}

/**
 * The router strategy `reroute` (RULE-044), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const rerouteStrategy: Strategy<"router", RerouteOptions> = defineStrategy({
  step: "router",
  name: "reroute",
  describe: "Rule prices and rip-up (RULE-044). The ways of `shared` with the largest prices of narrow channels, other keys and turns get a new search.",
  defaults: { ...REROUTE_DEFAULTS },
  schema: REROUTE_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<RerouteOptions>): Result => rerouteRouter({ ...o, name: "reroute", rule: byCollection }).route(graph),
});
