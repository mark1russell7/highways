import { rng } from "../../fixtures.ts";
import { dist, type Point } from "../../geom.ts";
import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { sharedRouter, type SharedSearch, type Way } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `annealing` (RULE-021: simulated annealing over candidate routes, with its rider WILD-028). */
export interface AnnealingOptions {
  /** The number of candidate ways of each edge, from 3 to 8. The default is 4. */
  readonly candidates: number;
  /** The cost of one crossing, in units of the median box side, from 0 to 20. The default is 4. */
  readonly crossing: number;
  /** The start temperature, in units of the median box side, from 0.1 to 10. The default is 1. */
  readonly temperature: number;
  /** The factor of the temperature after each sweep of the edges, from 0.9 to 0.99. The default is 0.95. */
  readonly cooling: number;
  /** The budget: the number of changes for each edge, from 20 to 200. The default is 50. */
  readonly budget: number;
  /** The seed of the random choices, a whole number from 0. The same seed gives the same routes. The default is 1. */
  readonly seed: number;
}

/** The default options of the router `annealing`. */
export const ANNEALING_DEFAULTS: Readonly<AnnealingOptions> = Object.freeze({ candidates: 4, crossing: 4, temperature: 1, cooling: 0.95, budget: 50, seed: 1 });

/** The declarations of the options of the router `annealing` (RULE-021). */
export const ANNEALING_SCHEMA: OptionSchema<AnnealingOptions> = {
  candidates: { type: "integer", min: 3, max: 8, step: 1, marks: [3, 4, 6], default: 4, describe: "The number of candidate ways of each edge." },
  crossing: { type: "number", min: 0, max: 20, step: 0.5, marks: [1, 4, 10], default: 4, describe: "The cost of one crossing, in units of the median box side." },
  temperature: { type: "number", min: 0.1, max: 10, step: 0.1, marks: [0.5, 1, 4], default: 1, describe: "The start temperature, in units of the median box side." },
  cooling: { type: "number", min: 0.9, max: 0.99, step: 0.01, marks: [0.9, 0.95, 0.98], default: 0.95, describe: "The factor of the temperature after each sweep of the edges." },
  budget: { type: "integer", min: 20, max: 200, step: 10, marks: [20, 50, 100], default: 50, describe: "The budget: the number of changes for each edge." },
  seed: { type: "integer", min: 0, max: 1_000_000, step: 1, marks: [1, 2, 3], default: 1, describe: "The seed of the random choices. The same seed gives the same routes." },
};

/** The share of the cost of a link that the edges of one key use already, as in `shared` with its default discount. */
const DISCOUNT = 0.5;
/** The cost factor of the links of the earlier candidates in the search of the next candidate. */
const PENALTY = 3;

/** One candidate way of an edge: its points, the indices of its points and the keys of its links. */
interface Candidate {
  readonly seq: Point[];
  readonly ids: number[];
  readonly links: number[];
  readonly lengths: number[];
  readonly length: number;
}

/** This function tells if the segments `a b` and `c d` cross at one inner point of each. A touch at an end or a common line is not a crossing. */
function properCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** This function gives the median of the smaller side of the boxes, the unit of the costs. */
function unitOf(graph: Graph): number {
  const sides = graph.nodes.map((n) => Math.min(n.box.w, n.box.h)).sort((a, b) => a - b);
  const u = sides.length === 0 ? 1 : sides[Math.floor((sides.length - 1) / 2)]!;
  return u > 0 ? u : 1;
}

/**
 * This function anneals the choice of one candidate way for each edge (RULE-021, after Davidson and Harel, 1996).
 * The candidates of an edge are its way in `shared`, its shortest way, and the shortest ways when the links of the earlier candidates cost 3 times more.
 * The energy is `(1 - 0.5) ink + 0.5 Σ L + crossing u X`: the cost of `shared` plus a cost for each crossing `X` between the ways of two edges.
 * A change takes one edge to another candidate. A worse change stays with the rational chance `1 / (1 + y + y^2 / 2)`, with `y = ΔE / T`.
 * The temperature falls by `cooling` after each sweep. The ways at the end are the ways of the lowest energy of the run.
 */
export function annealWays(ways: readonly Way[], search: SharedSearch, o: Readonly<AnnealingOptions>): void {
  const live = ways.filter((w) => w.found);
  const m = live.length;
  if (m < 2) return;
  const unit = unitOf(search.graph);
  const n = search.corners;
  let maxId = 0;
  for (const w of live) for (const i of w.ids) maxId = Math.max(maxId, i);
  const N = maxId + 1;
  const pairOf = (a: number, b: number): number => (a < b ? a * N + b : b * N + a);
  const make = (seq: Point[], ids: number[]): Candidate => {
    const links: number[] = [];
    const lengths: number[] = [];
    let length = 0;
    for (let i = 1; i < ids.length; i++) {
      const d = dist(seq[i - 1]!, seq[i]!);
      links.push(pairOf(ids[i - 1]!, ids[i]!));
      lengths.push(d);
      length += d;
    }
    return { seq, ids, links, lengths, length };
  };
  const k = Math.min(8, Math.max(1, Math.floor(o.candidates)));
  // The candidates of each edge. The first is the way of `shared`, the start state.
  const cands: Candidate[][] = live.map((w) => {
    const list = [make(w.seq, w.ids)];
    const seen = new Set([w.ids.join(",")]);
    const hit = new Set<number>();
    const mark = (c: Candidate): void => {
      for (let i = 1; i < c.ids.length; i++) if (c.ids[i - 1]! < n && c.ids[i]! < n) hit.add(search.link(c.ids[i - 1]!, c.ids[i]!));
    };
    const add = (found: { seq: Point[]; ids: number[] } | undefined): boolean => {
      if (!found) return false;
      const key = found.ids.join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      const c = make(found.seq, found.ids);
      list.push(c);
      mark(c);
      return true;
    };
    mark(list[0]!);
    if (list.length < k) add(search.find(w));
    for (let tries = 0; list.length < k && tries < k; tries++) {
      if (!add(search.find(w, (i, j, d) => (hit.has(search.link(i, j)) ? d * PENALTY : d), 1))) break;
    }
    return list;
  });
  // The crossings of each pair of candidates of two edges, in a table for each pair of edges whose boxes meet.
  type Bounds = { x0: number; y0: number; x1: number; y1: number };
  const boundsOf = (seqs: readonly Point[][]): Bounds => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const seq of seqs)
      for (const p of seq) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
    return { x0, y0, x1, y1 };
  };
  const apart = (A: Bounds, B: Bounds): boolean => A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0;
  const own = cands.map((list) => list.map((c) => boundsOf([c.seq])));
  const boxes = cands.map((list) => boundsOf(list.map((c) => c.seq)));
  const near: { f: number; table: Int32Array; mine: boolean }[][] = live.map(() => []);
  for (let e = 0; e < m; e++) {
    for (let f = e + 1; f < m; f++) {
      if (apart(boxes[e]!, boxes[f]!)) continue;
      const ke = cands[e]!.length;
      const kf = cands[f]!.length;
      const table = new Int32Array(ke * kf);
      let any = false;
      for (let i = 0; i < ke; i++) {
        const p = cands[e]![i]!.seq;
        for (let j = 0; j < kf; j++) {
          if (apart(own[e]![i]!, own[f]![j]!)) continue;
          const q = cands[f]![j]!.seq;
          let x = 0;
          for (let s = 1; s < p.length; s++) for (let t = 1; t < q.length; t++) if (properCross(p[s - 1]!, p[s]!, q[t - 1]!, q[t]!)) x++;
          table[i * kf + j] = x;
          if (x > 0) any = true;
        }
      }
      if (!any) continue;
      near[e]!.push({ f, table, mine: true });
      near[f]!.push({ f: e, table, mine: false });
    }
  }
  // The users of each link in each key, for the ink.
  const keys = live.map((w) => w.key);
  const users = new Map<string, Map<number, number>>();
  const use = (e: number, c: Candidate, step: number): number => {
    let mine = users.get(keys[e]!);
    if (!mine) users.set(keys[e]!, (mine = new Map()));
    let ink = 0;
    for (let i = 0; i < c.links.length; i++) {
      const before = mine.get(c.links[i]!) ?? 0;
      const after = before + step;
      if (after === 0) mine.delete(c.links[i]!);
      else mine.set(c.links[i]!, after);
      if (before === 0 && after > 0) ink += c.lengths[i]!;
      if (before > 0 && after === 0) ink -= c.lengths[i]!;
    }
    return ink;
  };
  const choice = new Int32Array(m);
  for (let e = 0; e < m; e++) use(e, cands[e]![0]!, 1);
  const crossCost = Math.max(0, o.crossing) * unit;
  const crossings = (e: number, i: number): number => {
    let x = 0;
    for (const { f, table, mine } of near[e]!) {
      const kf = cands[f]!.length;
      const ke = cands[e]!.length;
      x += mine ? table[i * kf + choice[f]!]! : table[choice[f]! * ke + i]!;
    }
    return x;
  };
  const random = rng(Math.max(0, Math.floor(o.seed)));
  const cooling = Math.min(0.99, Math.max(0.9, o.cooling));
  let temperature = Math.max(1e-6, o.temperature) * unit;
  const moves = Math.max(1, Math.floor(o.budget)) * m;
  let energy = 0;
  let best = 0;
  let bestChoice = choice.slice();
  for (let s = 0; s < moves; s++) {
    if (s > 0 && s % m === 0) temperature *= cooling;
    const e = Math.floor(random() * m);
    const list = cands[e]!;
    if (list.length < 2) continue;
    const from = choice[e]!;
    const to = (from + 1 + Math.floor(random() * (list.length - 1))) % list.length;
    // The change of the energy: the ink and the length of the key, and the crossings with the other edges.
    const dInk = use(e, list[from]!, -1) + use(e, list[to]!, 1);
    const dLength = list[to]!.length - list[from]!.length;
    const dCross = crossings(e, to) - crossings(e, from);
    const delta = (1 - DISCOUNT) * dInk + DISCOUNT * dLength + crossCost * dCross;
    const y = delta / temperature;
    if (delta <= 0 || random() < 1 / (1 + y + (y * y) / 2)) {
      choice[e] = to;
      energy += delta;
      if (energy < best - 1e-9) {
        best = energy;
        bestChoice = choice.slice();
      }
    } else {
      use(e, list[to]!, -1);
      use(e, list[from]!, 1);
    }
  }
  live.forEach((w, e) => {
    const c = cands[e]![bestChoice[e]!]!;
    w.seq = c.seq;
    w.ids = c.ids;
  });
}

/**
 * This function makes the router `annealing` (RULE-021 with its rider WILD-028). It is the router `shared`, then the annealing of `annealWays`.
 * Each candidate is a way through the corner graph, as in `shared`, so each one keeps the hard rules.
 */
export function annealingRouter(options: Partial<AnnealingOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...ANNEALING_DEFAULTS, ...options };
  return sharedRouter(
    { name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) },
    undefined,
    { refine: (ways, search) => annealWays(ways, search, o) },
  );
}

/**
 * The router strategy `annealing` (RULE-021), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const annealingStrategy: Strategy<"router", AnnealingOptions> = defineStrategy({
  step: "router",
  name: "annealing",
  describe: "Simulated annealing over candidate routes (RULE-021, with WILD-028). Each edge picks one of a few ways, for less ink and fewer crossings.",
  defaults: { ...ANNEALING_DEFAULTS },
  schema: ANNEALING_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<AnnealingOptions>): Result => annealingRouter({ ...o, name: "annealing", rule: byCollection }).route(graph),
});
