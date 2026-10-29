/**
 * The highway strategy `global-order` (WILD-039): one global lane order of all the edges, after the metro-line orders of Bekos and others (2007).
 * Each run of a highway uses the same order, so two edges keep one side of each other on each shared run.
 */
import { center, dist, type Point } from "../../geom.ts";
import { nodeIndex, type Graph, type Route } from "../../model.ts";
import { basePlan, type HighwayBase } from "../base.ts";
import { follow } from "../follow.ts";
import type { Highway, HighwayInput, HighwayPlan } from "../model.ts";

/** The first key of the global order: the Hilbert ranks of the source and the target, or the direction of the edge. */
export type GlobalKey = "hilbert" | "angle";

/** The values of `GlobalKey`. */
export const GLOBAL_KEYS: readonly GlobalKey[] = Object.freeze(["hilbert", "angle"]);

/** The options of the highway strategy `global-order` (WILD-039). */
export interface GlobalOrderOptions {
  /** The first key of the order. The default is `hilbert`. */
  readonly key: GlobalKey;
  /** The number of sifting passes, from 0 to 3. The default is 2. The value 0 keeps the order of the key. */
  readonly passes: number;
  /** The plan that gives the highways. The default is `shared-ways`. */
  readonly from: HighwayBase;
}

/** The default options of the strategy `global-order`. */
export const GLOBAL_ORDER_DEFAULTS: Readonly<GlobalOrderOptions> = Object.freeze({ key: "hilbert", passes: 2, from: "shared-ways" });

/** The largest number of edges that sifting moves. A larger plan keeps the order of the key. */
export const SIFT_CAP = 2000;

/** The side of the Hilbert grid: 2 to the power 16 cells. */
const GRID = 65536;

/** This function gives the rank of the cell `(x, y)` along a Hilbert curve on a grid of `GRID` cells on each side. */
export function hilbertRank(x: number, y: number): number {
  let px = Math.max(0, Math.min(GRID - 1, Math.floor(x)));
  let py = Math.max(0, Math.min(GRID - 1, Math.floor(y)));
  let d = 0;
  for (let s = GRID / 2; s >= 1; s /= 2) {
    const rx = (px & s) > 0 ? 1 : 0;
    const ry = (py & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        px = s - 1 - (px % s);
        py = s - 1 - (py % s);
      }
      [px, py] = [py, px];
    }
  }
  return d;
}

/** This function gives a pseudo-angle of a vector from 0 to 4, with the order of the angle and with no transcendental call. */
export function pseudoAngle(dx: number, dy: number): number {
  const size = Math.abs(dx) + Math.abs(dy);
  if (size === 0) return 0;
  const p = dx / size;
  return dy >= 0 ? 1 - p : 3 + p;
}

/** This function gives the key order of the edges of a graph: a list of edge ids, from the least key. A tie goes to the order of the edges. */
export function keyOrder(graph: Graph, key: GlobalKey): string[] {
  const byId = nodeIndex(graph);
  const centers = new Map(graph.nodes.map((n) => [n.id, center(n.box)]));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of centers.values()) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x);
    y1 = Math.max(y1, c.y);
  }
  const span = Math.max(1, x1 - x0, y1 - y0);
  const rank = (p: Point): number => hilbertRank(((p.x - x0) / span) * (GRID - 1), ((p.y - y0) / span) * (GRID - 1));
  const keys: (readonly [string, number, number, number])[] = [];
  graph.edges.forEach((e, i) => {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) return;
    const a = centers.get(s.id)!;
    const b = centers.get(t.id)!;
    keys.push(key === "hilbert" ? [e.id, rank(a), rank(b), i] : [e.id, pseudoAngle(b.x - a.x, b.y - a.y), rank(a), i]);
  });
  return keys.sort((p, q) => p[1] - q[1] || p[2] - q[2] || p[3] - q[3]).map((k) => k[0]);
}

/** This function tells if a route goes along a run from its first point to its last point. A route that does not hold both ends goes forward. */
function alongRun(route: readonly Point[], run: readonly Point[]): boolean {
  const near = (p: Point): number => route.findIndex((q) => dist(p, q) <= 1e-6);
  const a = near(run[0]!);
  const b = near(run[run.length - 1]!);
  return a < 0 || b < 0 || a <= b;
}

/** The weights of the pairs: `W(a, b)` is the number of runs where `a` goes before `b`, in the frame of the direction of most edges of the run. */
export type PairWeights = Map<string, Map<string, number>>;

/** This function adds the pairs of one order to the weights. */
export function addPairs(w: PairWeights, order: readonly string[]): void {
  for (let i = 0; i < order.length; i++) {
    let row = w.get(order[i]!);
    if (!row) w.set(order[i]!, (row = new Map()));
    for (let j = i + 1; j < order.length; j++) row.set(order[j]!, (row.get(order[j]!) ?? 0) + 1);
  }
}

/** This function gives `W(a, b)`. */
const weight = (w: PairWeights, a: string, b: string): number => w.get(a)?.get(b) ?? 0;

/** This function gives the number of pairs of the weights that an order puts the other way: the Kendall disagreement of the order with the runs. */
export function disagreement(w: PairWeights, order: readonly string[]): number {
  let n = 0;
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) n += weight(w, order[j]!, order[i]!);
  return n;
}

/**
 * This function sifts an order (WILD-039). Each pass moves each edge, one at a time, to the place with the least disagreement with the weights.
 * A tie keeps the edge at its place. The disagreement does not grow in a pass.
 */
export function sift(w: PairWeights, order: readonly string[], passes: number): string[] {
  let list = [...order];
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (const e of order) {
      const from = list.indexOf(e);
      const rest = list.filter((x) => x !== e);
      // The cost at the place p is the sum of W(e, x) over the edges x before p, and of W(x, e) over the edges x at p or after.
      let cost = 0;
      for (const x of rest) cost += weight(w, x, e);
      let best = 0;
      let bestCost = cost;
      let here = cost;
      for (let p = 0; p < rest.length; p++) {
        cost += weight(w, e, rest[p]!) - weight(w, rest[p]!, e);
        if (p + 1 === from) here = cost;
        if (cost < bestCost) [best, bestCost] = [p + 1, cost];
      }
      if (bestCost < here) {
        rest.splice(best, 0, e);
        list = rest;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return list;
}

/**
 * This function gives the plan of the strategy `global-order` (WILD-039). It routes the plan of `from` one time, and reads the bundle order of each run.
 * The first order comes from the key. Sifting then lowers its disagreement with the bundle orders of the runs, up to `SIFT_CAP` edges.
 * Each highway takes its members in the global order, in reverse when most of its members go backward on the spine. The lane rule `plan` keeps it.
 */
export function globalOrderPlan(input: HighwayInput, o: Readonly<GlobalOrderOptions>): HighwayPlan {
  const plan = basePlan(input, o.from);
  if (plan.highways.length === 0) return plan;
  const result = follow(input.graph, plan);
  const routes = new Map<string, Route>(result.routes.map((r) => [r.edge, r]));
  const w: PairWeights = new Map();
  const users = new Set<string>();
  for (const run of result.runs ?? []) {
    const ahead = run.edges.filter((e) => routes.has(e) && alongRun(routes.get(e)!.points, run.points)).length;
    addPairs(w, 2 * ahead >= run.edges.length ? run.edges : [...run.edges].reverse());
    for (const e of run.edges) users.add(e);
  }
  const first = keyOrder(input.graph, o.key).filter((e) => users.has(e));
  const passes = Math.max(0, Math.min(3, Math.floor(o.passes)));
  const order = first.length <= SIFT_CAP ? sift(w, first, passes) : first;
  const rank = new Map(order.map((e, i) => [e, i]));
  const highways: Highway[] = plan.highways.map((h) => {
    const back = h.members.filter((m) => m.on > m.off).length;
    const sign = 2 * back > h.members.length ? -1 : 1;
    const at = new Map(h.lanes.map((e, i) => [e, i]));
    const big = order.length;
    const lanes = [...h.lanes].sort((a, b) => sign * ((rank.get(a) ?? big) - (rank.get(b) ?? big)) || at.get(a)! - at.get(b)!);
    const byEdge = new Map(h.members.map((m) => [m.edge, m]));
    return { ...h, lanes, members: lanes.map((e) => byEdge.get(e)!) };
  });
  return { highways, laneRule: { order: "plan" } };
}
