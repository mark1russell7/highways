// One lane order for each stretch (LANE-STRETCH). The runs of the router `shared` that follow each other on the routes make a stretch.
// The function `stretchLaneOrders` gives each run of a stretch the lane order of one total order of the edges of the stretch.
// Thus two neighbour runs cannot break a cycle of the lane relation in two ways, and their lanes do not cross between them.
import { byText } from "../../compare.ts";
import type { Point } from "../../geom.ts";
import { byBundle, byEdge, mergeSort, placeRoutes, type PlacedRoute } from "../../lane-order.ts";
import type { Route } from "../../model.ts";

/**
 * The lane order of the stretches (LANE-STRETCH).
 *
 * - `none`: each run gets its own order, as the order `bundle` of `orderLanes` gives it.
 * - `consensus`: one order of the pair relation of the stretch, from the heuristic of Eades, Lin and Smyth for the feedback arc set.
 * - `periphery`: the largest run gives its order. Each next run keeps that order and puts each new edge at the place with the fewest broken pairs.
 * - `sifting`: the order of `consensus`. Then each edge moves to the place with the fewest broken pairs, for `passes` passes.
 */
export type LaneStretchOrder = "none" | "consensus" | "periphery" | "sifting";

/** The values of `LaneStretchOrder`, in the order of a control. */
export const LANE_STRETCH_ORDERS: readonly LaneStretchOrder[] = Object.freeze(["none", "consensus", "periphery", "sifting"]);

/** The options of `stretchLaneOrders`. */
export interface LaneStretchOptions {
  /** The lane order of the stretches. The default is `consensus`. */
  readonly method: LaneStretchOrder;
  /** The number of passes of the method `sifting`, from 1 to 4. The default is 2. The other methods do not read it. */
  readonly passes: number;
}

/** The default options of `stretchLaneOrders`. */
export const LANE_STRETCH_DEFAULTS: Readonly<LaneStretchOptions> = Object.freeze({ method: "consensus", passes: 2 });

/** One run: its points and the routes on it. Each route holds the points of the run in a row, in either direction. */
export interface LaneRun {
  readonly points: readonly Point[];
  readonly routes: readonly Route[];
}

/** One stretch: the runs that follow each other on the routes, and the order of the edges of the stretch. */
export interface LaneStretch {
  /** The indexes of the runs in the list of the input. The first run is the root: the run with the most lanes. The others follow in the order of a breadth-first walk. */
  readonly runs: readonly number[];
  /** The way of each run of `runs` against the root. The value -1 tells that the left of the root is the right of the run. */
  readonly turns: readonly (1 | -1)[];
  /** The edges of the stretch from left to right, in the way of the root. A stretch of one run has the order `bundle` of the run. */
  readonly order: readonly string[];
}

/** A run with its placed routes. */
interface Prepared {
  readonly placed: readonly PlacedRoute[];
  readonly lost: readonly string[];
  /** The placed route of each edge. */
  readonly byEdge: ReadonlyMap<string, PlacedRoute>;
  /** The key of the run: its sorted edges, then its points. Two runs with one key give the same order. */
  readonly key: string;
  /** This value is true when an edge goes two times through the run. Then the run is a stretch alone, with the order `bundle`. */
  readonly twice: boolean;
}

/** A link between two runs that follow each other on a route. `turn` is -1 when the route goes through one of them in reverse. */
interface Link {
  readonly to: number;
  readonly turn: 1 | -1;
}

/** This function places the routes of each run, and gives the key of each run. */
function prepare(runs: readonly LaneRun[]): Prepared[] {
  return runs.map((run) => {
    const { placed, lost } = placeRoutes(run.points, run.routes);
    const byEdgeMap = new Map(placed.map((p) => [p.edge, p] as const));
    const edges = placed.map((p) => p.edge).sort(byText);
    const key = `${edges.join("\u0001")}\u0002${run.points.map((q) => `${q.x},${q.y}`).join(";")}`;
    return { placed, lost: [...lost].sort(byText), byEdge: byEdgeMap, key, twice: byEdgeMap.size !== placed.length };
  });
}

/** This function gives the number of edges that two runs share, up to 2. */
function shared(a: Prepared, b: Prepared): number {
  const [small, large] = a.placed.length <= b.placed.length ? [a, b] : [b, a];
  let n = 0;
  for (const p of small.placed) if (large.byEdge.has(p.edge) && ++n >= 2) return n;
  return n;
}

/**
 * This function gives the links between the runs. A link can join two runs when a route goes through one and then the other.
 * No shared run is between them on that route, and the two runs share two edges or more. Each such route gives a vote for the way of one run against the other.
 * A link joins two runs only when all the votes agree. The links are a forest. The edges and the runs are taken in a fixed order, so the links do not depend on the order of the input.
 */
function linksOf(prepared: readonly Prepared[], keyOrder: readonly number[]): Link[][] {
  const visits = new Map<string, { run: number; at: number; dir: 1 | -1 }[]>();
  for (const i of keyOrder) {
    for (const p of prepared[i]!.placed) {
      // The index of the first point of the run in the route, in the way of the route.
      const at = p.reversed ? p.p.length - 1 - p.e : p.s;
      const list = visits.get(p.edge);
      const v = { run: i, at, dir: p.reversed ? (-1 as const) : (1 as const) };
      if (list) list.push(v);
      else visits.set(p.edge, [v]);
    }
  }
  const rank = new Map(keyOrder.map((i, r) => [i, r] as const));
  // The votes of each pair of runs, with the run of the smaller rank first.
  const votes = new Map<string, { a: number; b: number; plus: number; minus: number }>();
  for (const edge of [...visits.keys()].sort(byText)) {
    const list = visits.get(edge)!;
    list.sort((u, v) => u.at - v.at || rank.get(u.run)! - rank.get(v.run)!);
    for (let k = 1; k < list.length; k++) {
      const u = list[k - 1]!;
      const v = list[k]!;
      if (u.run === v.run || prepared[u.run]!.twice || prepared[v.run]!.twice) continue;
      const [a, b] = rank.get(u.run)! < rank.get(v.run)! ? [u.run, v.run] : [v.run, u.run];
      const key = `${a},${b}`;
      let vote = votes.get(key);
      if (!vote) {
        if (shared(prepared[a]!, prepared[b]!) < 2) continue;
        vote = { a, b, plus: 0, minus: 0 };
        votes.set(key, vote);
      }
      if (u.dir === v.dir) vote.plus++;
      else vote.minus++;
    }
  }
  // The links with the most votes go first. A link that closes a cycle of links does not join: the links are a forest, so the ways of the runs of a stretch agree.
  const list = [...votes.values()]
    .filter((v) => v.plus === 0 || v.minus === 0)
    .sort((x, y) => y.plus + y.minus - (x.plus + x.minus) || rank.get(x.a)! - rank.get(y.a)! || rank.get(x.b)! - rank.get(y.b)!);
  const parent = prepared.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  const links: Link[][] = prepared.map(() => []);
  for (const v of list) {
    const ra = find(v.a);
    const rb = find(v.b);
    if (ra === rb) continue;
    parent[rb] = ra;
    const turn = v.minus === 0 ? (1 as const) : (-1 as const);
    links[v.a]!.push({ to: v.b, turn });
    links[v.b]!.push({ to: v.a, turn });
  }
  for (const l of links) l.sort((x, y) => rank.get(x.to)! - rank.get(y.to)!);
  return links;
}

/** The pair relation of the edges of one stretch, in the way of the root. */
class Relation {
  /** The index of each edge of the stretch. The indexes follow the order of the edge ids. */
  readonly index: ReadonlyMap<string, number>;
  readonly edges: readonly string[];
  /** The pairs of each edge: the other edge and the side of the edge against it (-1: on the left). */
  readonly pairs: Map<number, number>[];

  constructor(edges: readonly string[]) {
    this.edges = edges;
    this.index = new Map(edges.map((e, i) => [e, i] as const));
    this.pairs = edges.map(() => new Map<number, number>());
  }

  /** This method sets the side of the edge `a` against the edge `b`: -1 when `a` is on the left of `b`, and 1 when it is on the right. */
  set(a: string, b: string, side: number): void {
    const i = this.index.get(a)!;
    const j = this.index.get(b)!;
    this.pairs[i]!.set(j, side);
    this.pairs[j]!.set(i, -side);
  }

  /** This method gives -1 when the edge `a` is on the left of the edge `b`, and 1 when it is on the right. It gives 0 when the two edges share no run. */
  side(a: number, b: number): number {
    return this.pairs[a]!.get(b) ?? 0;
  }
}

/**
 * This function gives an order of the edges of a relation with few broken pairs. It is the heuristic of Eades, Lin and Smyth (1993) for the feedback arc set.
 * The sinks go to the end, and the sources go to the start. Else, the edge with the largest count of right pairs minus left pairs goes to the start.
 * Each tie goes to the smallest index. A relation with no cycle gives an order with no broken pair.
 */
function eadesOrder(rel: Relation): number[] {
  const n = rel.edges.length;
  const left = new Int32Array(n);
  const right = new Int32Array(n);
  for (let a = 0; a < n; a++) for (const s of rel.pairs[a]!.values()) (s < 0 ? right : left)[a]!++;
  const alive = new Uint8Array(n).fill(1);
  const head: number[] = [];
  const tail: number[] = [];
  const remove = (a: number): void => {
    alive[a] = 0;
    for (const [b, s] of rel.pairs[a]!) {
      if (!alive[b]) continue;
      // The edge `a` is on the left of `b` (s < 0): `b` loses one edge on its left.
      if (s < 0) left[b]!--;
      else right[b]!--;
    }
  };
  let count = n;
  while (count > 0) {
    let pick = -1;
    let sink = false;
    for (let a = n - 1; a >= 0; a--) {
      if (alive[a] && right[a] === 0) {
        pick = a;
        sink = true;
        break;
      }
    }
    if (pick < 0) {
      let best = -Infinity;
      for (let a = 0; a < n; a++) {
        if (!alive[a]) continue;
        const d = left[a] === 0 ? Infinity : right[a]! - left[a]!;
        if (d > best) {
          best = d;
          pick = a;
        }
      }
    }
    remove(pick);
    count--;
    if (sink) tail.push(pick);
    else head.push(pick);
  }
  return [...head, ...tail.reverse()];
}

/** This function counts the broken pairs of the edge `a` at the place `at` of an order. A broken pair has the other edge on the wrong side. */
function cost(rel: Relation, order: readonly number[], a: number, at: number): number {
  let c = 0;
  for (let k = 0; k < order.length; k++) {
    const b = order[k]!;
    if (b === a) continue;
    const s = rel.side(a, b);
    if (s === 0) continue;
    if (k < at ? s < 0 : s > 0) c++;
  }
  return c;
}

/**
 * This function moves each edge to the place with the fewest broken pairs (sifting). It moves one edge at a time, in the order of the start of the pass.
 * An edge stays at its place when no other place is better. Each tie goes to the place more to the left.
 */
function sift(rel: Relation, start: readonly number[], passes: number): number[] {
  let order = [...start];
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (const a of [...order]) {
      const from = order.indexOf(a);
      const rest = order.filter((b) => b !== a);
      // The cost of each place from 0 to `rest.length`: the place 0 breaks each pair where `a` must be on the right.
      let c = 0;
      for (const b of rest) if (rel.side(a, b) > 0) c++;
      let best = c;
      let at = 0;
      let here = from === 0 ? c : Infinity;
      for (let k = 0; k < rest.length; k++) {
        const s = rel.side(a, rest[k]!);
        if (s > 0) c--;
        else if (s < 0) c++;
        if (k + 1 === from) here = c;
        if (c < best) {
          best = c;
          at = k + 1;
        }
      }
      if (best < here) {
        rest.splice(at, 0, a);
        order = rest;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return order;
}

/** This function gives the order `bundle` of the placed routes of one run, from left to right in the way of the run. */
function bundleOrder(run: Prepared): string[] {
  return mergeSort([...run.placed].sort(byEdge), byBundle).map((p) => p.edge);
}

/**
 * This function gives the order of the root, then puts the edges of each next run in it (periphery).
 * The edges that the order holds keep their order. Each new edge of a run goes to the place in the run with the fewest broken pairs, and each tie goes to the left.
 */
function peripheryOrder(rel: Relation, prepared: readonly Prepared[], runs: readonly number[], turns: readonly (1 | -1)[]): number[] {
  const toIndex = (edges: readonly string[]): number[] => edges.map((e) => rel.index.get(e)!);
  const root = toIndex(bundleOrder(prepared[runs[0]!]!));
  const order = [...root];
  const placed = new Set(order);
  for (let r = 1; r < runs.length; r++) {
    const run = prepared[runs[r]!]!;
    const own = new Set(run.placed.map((p) => rel.index.get(p.edge)!));
    const seq = order.filter((a) => own.has(a));
    let fresh = toIndex(bundleOrder(run)).filter((a) => !placed.has(a));
    if (turns[r] === -1) fresh = fresh.reverse();
    for (const a of fresh) {
      let best = Infinity;
      let at = 0;
      for (let k = 0; k <= seq.length; k++) {
        const c = cost(rel, seq, a, k);
        if (c < best) {
          best = c;
          at = k;
        }
      }
      seq.splice(at, 0, a);
      // The new edge goes into the order of the stretch next to its left neighbour in the run, or before its right neighbour.
      if (at > 0) order.splice(order.indexOf(seq[at - 1]!) + 1, 0, a);
      else if (seq.length > 1) order.splice(order.indexOf(seq[1]!), 0, a);
      else order.push(a);
      placed.add(a);
    }
  }
  return order;
}

/**
 * This function gives the stretches of the runs (LANE-STRETCH). Two runs are in one stretch when a chain of links joins them.
 * A link joins two runs when a route goes through one and then the other, and they share two edges or more.
 * The result does not depend on the order of the runs or of the routes of each run.
 */
export function laneStretches(runs: readonly LaneRun[], options: Partial<LaneStretchOptions> = {}): LaneStretch[] {
  return stretchesOf(prepare(runs), { ...LANE_STRETCH_DEFAULTS, ...options });
}

/** The side of each pair of edges of a run, in the way of the root. The key is the two edges in the order of their ids. */
type Sides = Map<string, number>;

/** This function gives the sides of the pairs of a run with the way `turn` against the root: -1 when the first edge of the key is on the left. */
function sidesOf(run: Prepared, turn: 1 | -1): Sides {
  const out: Sides = new Map();
  const lanes = [...run.placed].sort(byEdge);
  for (let x = 0; x < lanes.length; x++)
    for (let y = x + 1; y < lanes.length; y++) {
      const v = byBundle(lanes[x]!, lanes[y]!);
      out.set(`${lanes[x]!.edge}\u0000${lanes[y]!.edge}`, (v > 0 ? 1 : -1) * turn);
    }
  return out;
}

/**
 * This function gives the stretches of the prepared runs, with the order of each stretch.
 * A run joins a stretch only when the relation of each pair of its edges agrees with the runs of the stretch.
 * Thus one order of the stretch can keep the side of each pair on each run, apart from the cycles of the relation.
 */
function stretchesOf(prepared: readonly Prepared[], options: Readonly<LaneStretchOptions>): LaneStretch[] {
  const keyOrder = prepared.map((_, i) => i).sort((a, b) => byText(prepared[a]!.key, prepared[b]!.key));
  const links = linksOf(prepared, keyOrder);
  const rank = new Map(keyOrder.map((i, r) => [i, r] as const));
  const done = new Uint8Array(prepared.length);
  const out: LaneStretch[] = [];
  // Each loop makes one stretch and marks its runs. A run that the walk does not take stays for a later stretch.
  for (let p = 0; p < keyOrder.length; ) {
    const start = keyOrder[p]!;
    if (done[start]) {
      p++;
      continue;
    }
    // The runs that the links join to `start`, and the root: the run with the most lanes, then the first key.
    const members = [start];
    const seen = new Set(members);
    for (let q = 0; q < members.length; q++) {
      const i = members[q]!;
      if (prepared[i]!.twice) continue;
      for (const l of links[i]!) {
        if (done[l.to] || seen.has(l.to) || prepared[l.to]!.twice) continue;
        seen.add(l.to);
        members.push(l.to);
      }
    }
    const root = members.reduce((best, i) => {
      const d = prepared[i]!.placed.length - prepared[best]!.placed.length;
      return d > 0 || (d === 0 && rank.get(i)! < rank.get(best)!) ? i : best;
    }, members[0]!);
    // The walk from the root gives the order of the runs and the way of each run against the root.
    const runsOf: number[] = [root];
    const turns: (1 | -1)[] = [1];
    const turnOf = new Map<number, 1 | -1>([[root, 1]]);
    const sides = sidesOf(prepared[root]!, 1);
    done[root] = 1;
    for (let k = 0; k < runsOf.length; k++) {
      const i = runsOf[k]!;
      if (prepared[i]!.twice) continue;
      for (const l of links[i]!) {
        if (done[l.to] || prepared[l.to]!.twice) continue;
        const t = (turnOf.get(i)! * l.turn) as 1 | -1;
        const own = sidesOf(prepared[l.to]!, t);
        let agrees = true;
        for (const [key, side] of own) if ((sides.get(key) ?? side) !== side) agrees = false;
        if (!agrees) continue;
        for (const [key, side] of own) sides.set(key, side);
        done[l.to] = 1;
        turnOf.set(l.to, t);
        runsOf.push(l.to);
        turns.push(t);
      }
    }
    out.push({ runs: runsOf, turns, order: orderOf(prepared, runsOf, turns, sides, options) });
  }
  return out;
}

/** This function gives the order of the edges of one stretch, from left to right in the way of its root. */
function orderOf(prepared: readonly Prepared[], runs: readonly number[], turns: readonly (1 | -1)[], sides: Sides, options: Readonly<LaneStretchOptions>): string[] {
  // A stretch of one run keeps the order `bundle` of the run. The method `none` keeps the order of each run.
  if (runs.length === 1 || options.method === "none") return bundleOrder(prepared[runs[0]!]!);
  const edges = [...new Set(runs.flatMap((i) => prepared[i]!.placed.map((p) => p.edge)))].sort(byText);
  const rel = new Relation(edges);
  for (const [key, side] of sides) {
    const [a, b] = key.split("\u0000") as [string, string];
    rel.set(a, b, side);
  }
  let order: number[];
  if (options.method === "periphery") order = peripheryOrder(rel, prepared, runs, turns);
  else {
    order = eadesOrder(rel);
    if (options.method === "sifting") order = sift(rel, order, Math.max(1, Math.min(4, Math.floor(options.passes))));
  }
  return order.map((i) => edges[i]!);
}

/**
 * This function gives the lane order of each run (LANE-STRETCH). The orders are in the order of `runs`.
 * Each order holds the edges of the run from left to right. The way goes from the first point of the run to its last point, with the y axis down.
 * A route that does not hold its run goes last, as in `orderLanes`.
 *
 * With the method `none`, each run gets the order `bundle` of `orderLanes`. With the other methods, each run of a stretch gets the order of the stretch.
 * Thus two runs of one stretch give two edges the same side. The result does not depend on the order of the runs or of the routes of each run.
 */
export function stretchLaneOrders(runs: readonly LaneRun[], options: Partial<LaneStretchOptions> = {}): string[][] {
  const o: LaneStretchOptions = { ...LANE_STRETCH_DEFAULTS, ...options };
  const prepared = prepare(runs);
  if (o.method === "none") return prepared.map((run) => [...bundleOrder(run), ...run.lost]);
  const out: string[][] = prepared.map(() => []);
  for (const s of stretchesOf(prepared, o)) {
    s.runs.forEach((i, r) => {
      const run = prepared[i]!;
      const own = s.order.filter((e) => run.byEdge.has(e));
      out[i] = [...(s.turns[r] === -1 ? own.reverse() : own), ...run.lost];
    });
  }
  return out;
}
