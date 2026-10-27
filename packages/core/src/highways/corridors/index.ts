import { center, dist, type Point } from "../../geom.ts";
import { nodeIndex, type Graph, type Route } from "../../model.ts";
import { placePlug } from "../../plugs.ts";
import { orderLanes } from "../../segments.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { memberAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/**
 * The options of the highway strategy `corridors` (HWY-031 of the note on highways).
 * The options `margin` and `k` set the corner graph of the first ways, when the input has no first routes.
 */
export interface CorridorOptions extends Pick<WayOptions, "margin" | "k"> {
  /** Two edges join when their common links are this share of the shorter way, or longer. The default is 0.3. */
  readonly rho: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
  /** The number of hash functions of the MinHash signature of a way. The default is 64. */
  readonly hashes: number;
  /** The number of bands of the signature. Two ways with one equal band are a candidate pair. The default is 32. */
  readonly bands: number;
  /** Two link ends nearer than this grid size are one point. With 0, the default, only equal points are one point. */
  readonly near: number;
  /** The gap between two lanes. Two edges join only when their common links are longer than the break-even overlap for this gap. The default is 4. */
  readonly lane: number;
}

/** The default options of the strategy `corridors`. */
export const CORRIDOR_DEFAULTS: Readonly<Required<Omit<CorridorOptions, "margin" | "k">>> = Object.freeze({ rho: 0.3, minSize: 2, hashes: 64, bands: 32, near: 0, lane: 4 });

/**
 * The break-even overlap of two parallel edges for each unit of the lane gap, with the cost exponent 0.5 of the note.
 * A shared stretch shorter than this times the gap adds ink.
 */
export const BREAK_EVEN: number = Math.sqrt((2 + Math.SQRT2) / (2 - Math.SQRT2));

/** One link of a way: its key, its length and its ends in the order of the way. */
interface Link {
  readonly key: string;
  readonly len: number;
  /** The snapped first end of the link, in the order of the way. */
  readonly a: string;
  /** The index of the first end in the points of the way. */
  readonly at: number;
}

/** The first way of an edge, with its links. */
interface Way {
  readonly edge: string;
  readonly points: readonly Point[];
  readonly links: readonly Link[];
  /** The length of each link, by its key. */
  readonly set: ReadonlyMap<string, number>;
  readonly length: number;
}

/** This function gives the FNV-1a hash of a string, as an unsigned 32-bit number. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** This function mixes the bits of a 32-bit number (the finalizer of MurmurHash3). */
function mix(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** This function gives the MinHash signature of a set of keys with `count` hash functions. */
export function minHash(keys: Iterable<string>, count: number): number[] {
  const sig = new Array<number>(count).fill(0xffffffff);
  const seeds = Array.from({ length: count }, (_, i) => mix(Math.imul(i + 1, 0x9e3779b9)));
  for (const key of keys) {
    const base = fnv1a(key);
    for (let i = 0; i < count; i++) {
      const v = mix(base ^ seeds[i]!);
      if (v < sig[i]!) sig[i] = v;
    }
  }
  return sig;
}

/**
 * This function gives the first way of each edge: the way through the corner graph, with the plugs at its ends.
 * The router `corners` finds the same way before it drops the needless corners.
 */
function cornerWays(graph: Graph, options: Pick<WayOptions, "margin" | "k">): Route[] {
  const byId = nodeIndex(graph);
  const ways = new WayFinder(graph.nodes, options);
  const out: Route[] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    const ps = placePlug(s, e.source, center(t.box));
    const pt = placePlug(t, e.target, center(s.box));
    const raw = ways.corners.path(ways.out(ps), ways.out(pt));
    out.push({ edge: e.id, points: raw ? [ps.point, ...raw, pt.point] : [ps.point, pt.point] });
  }
  return out;
}

/** This function gives the way of a route, with a key for each link. Two links with the same ends, in either order, have one key. */
function wayOf(route: Route, near: number): Way {
  const snap = (p: Point): string => (near > 0 ? `${Math.round(p.x / near)},${Math.round(p.y / near)}` : `${p.x},${p.y}`);
  const links: Link[] = [];
  const set = new Map<string, number>();
  let length = 0;
  for (let i = 1; i < route.points.length; i++) {
    const p = route.points[i - 1]!;
    const q = route.points[i]!;
    const len = dist(p, q);
    if (len <= 1e-9) continue;
    const a = snap(p);
    const b = snap(q);
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    links.push({ key, len, a, at: i - 1 });
    if (!set.has(key)) set.set(key, len);
    length += len;
  }
  return { edge: route.edge, points: route.points, links, set, length };
}

/** This function gives the length of the common links of two ways. */
function overlap(p: Way, q: Way): number {
  const [small, large] = p.set.size <= q.set.size ? [p, q] : [q, p];
  let sum = 0;
  for (const [key, len] of small.set) if (large.set.has(key)) sum += len;
  return sum;
}

/** This function gives the pairs of ways with one equal band of their signatures, as `i * n + j` with `i < j`, in order. */
function candidates(ways: readonly Way[], hashes: number, bands: number): number[] {
  const rows = Math.max(1, Math.floor(hashes / Math.max(1, bands)));
  const count = Math.max(1, Math.floor(hashes / rows));
  const n = ways.length;
  const pairs = new Set<number>();
  const buckets = new Map<string, number[]>();
  ways.forEach((w, i) => {
    if (w.set.size === 0) return;
    const sig = minHash(w.set.keys(), rows * count);
    for (let b = 0; b < count; b++) {
      const key = `${b}:${sig.slice(b * rows, (b + 1) * rows).join(",")}`;
      const list = buckets.get(key);
      if (list) {
        for (const j of list) pairs.add(j * n + i);
        list.push(i);
      } else buckets.set(key, [i]);
    }
  });
  return [...pairs].sort((a, b) => a - b);
}

/** This function gives the root of an element of a union-find forest, and shortens the path. */
function root(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]!]!;
    i = parent[i]!;
  }
  return i;
}

/**
 * This function gives the clusters of the ways. Two ways join when their common links are long.
 * A cluster is a connected part of the joins.
 * MinHash with bands finds the candidate pairs. The function then measures the overlap of each candidate pair.
 * Each cluster keeps the order of the ways, and the clusters come in the order of their first way.
 */
function corridorClusters(ways: readonly Way[], o: Readonly<CorridorOptions>): number[][] {
  const n = ways.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const floor = BREAK_EVEN * o.lane;
  for (const pair of candidates(ways, o.hashes, o.bands)) {
    const i = Math.floor(pair / n);
    const j = pair % n;
    const p = ways[i]!;
    const q = ways[j]!;
    if (overlap(p, q) >= Math.max(floor, o.rho * Math.min(p.length, q.length))) {
      const a = root(parent, i);
      const b = root(parent, j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = root(parent, i);
    const list = groups.get(r);
    if (list) list.push(i);
    else groups.set(r, [i]);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

/**
 * This function gives the highway of a pool of ways, or `undefined`. The core is the way with the most shared length.
 * The spine is the stretch of the core with the largest saving. Each link of the spine has two ways of the pool or more.
 * A member is a way of the pool whose links on the spine are long enough, all in one direction.
 */
function highwayOf(pool: readonly Way[], o: Readonly<CorridorOptions>): { core: Way; spine: Point[]; members: { way: Way; on: number; off: number }[] } | undefined {
  const count = new Map<string, number>();
  for (const w of pool) for (const key of w.set.keys()) count.set(key, (count.get(key) ?? 0) + 1);
  const gain = (key: string, len: number): number => len * ((count.get(key) ?? 1) - 1);
  let core: Way | undefined;
  let best = 0;
  for (const w of pool) {
    let g = 0;
    for (const [key, len] of w.set) g += gain(key, len);
    if (g > best) [core, best] = [w, g];
  }
  if (!core) return undefined;
  // The best stretch of shared links of the core, by the saving of each link (Kadane on a list with only good values in each stretch).
  let from = -1;
  let to = -1;
  let top = 0;
  let start = 0;
  let sum = 0;
  core.links.forEach((l, i) => {
    if ((count.get(l.key) ?? 0) < 2) {
      sum = 0;
      start = i + 1;
      return;
    }
    sum += gain(l.key, l.len);
    if (sum > top) [top, from, to] = [sum, start, i];
  });
  if (from < 0) return undefined;
  const chosen = core.links.slice(from, to + 1);
  // The spine: the first end of each chosen link, then the last end of the last link.
  const spine: Point[] = [core.points[chosen[0]!.at]!, ...chosen.map((l) => core.points[l.at + 1]!)];
  const index = new Map<string, number>();
  chosen.forEach((l, j) => {
    if (!index.has(l.key)) index.set(l.key, j);
  });
  const spineLength = chosen.reduce((s, l) => s + l.len, 0);
  const floor = BREAK_EVEN * o.lane;
  const members: { way: Way; on: number; off: number }[] = [];
  for (const w of pool) {
    let first = -1;
    let last = -1;
    let forward: boolean | undefined;
    let ok = true;
    let shared = 0;
    for (const l of w.links) {
      const j = index.get(l.key);
      if (j === undefined) continue;
      const dir = l.a === chosen[j]!.a;
      if (forward === undefined) forward = dir;
      else if (forward !== dir) ok = false;
      if (first < 0) first = j;
      else if (forward ? j < last : j > last) ok = false;
      last = j;
      shared += l.len;
    }
    if (!ok || forward === undefined || shared < Math.max(floor, o.rho * Math.min(w.length, spineLength))) continue;
    members.push(forward ? { way: w, on: first, off: last + 1 } : { way: w, on: first + 1, off: last });
  }
  return { core, spine, members };
}

/**
 * This function gives the highways of corridor signatures (HWY-031). Each edge gets a first way: the route of `input.routes`, or its way through the corner graph.
 * The signature of a way is the set of its links. Two edges join when their common links are at least `rho` times the shorter way, and longer than the break-even overlap.
 * MinHash with `hashes` hash functions in `bands` bands finds the candidate pairs fast. Union-find gives the clusters.
 *
 * In each cluster, the spine is the longest common run of links of the way with the most shared length. Each edge on the spine joins it at its first common link and leaves it at its last one.
 * The edges of the cluster that are not on the spine make the next highway, while `minSize` of them remain.
 */
export function corridorPlan(input: HighwayInput, o: Readonly<CorridorOptions>): HighwayPlan {
  const routes = input.routes?.routes ?? cornerWays(input.graph, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const known = new Set(input.graph.edges.map((e) => e.id));
  const ways = routes.filter((r) => known.has(r.edge)).map((r) => wayOf(r, o.near));
  const highways: Highway[] = [];
  corridorClusters(ways, o).forEach((cluster, c) => {
    let pool = cluster.map((i) => ways[i]!);
    while (pool.length >= Math.max(2, o.minSize)) {
      const found = highwayOf(pool, o);
      if (!found) break;
      const { core, spine, members } = found;
      if (members.length < Math.max(2, o.minSize)) {
        // The core does not make a highway. The other ways can still make one.
        pool = pool.filter((w) => w !== core);
        continue;
      }
      const lanes = orderLanes(spine, members.map((m) => ({ edge: m.way.edge, points: m.way.points })), "bundle");
      const byEdge = new Map(members.map((m) => [m.way.edge, m]));
      const list: HighwayMember[] = lanes.map((edge) => {
        const m = byEdge.get(edge)!;
        return memberAt(spine, edge, m.on, m.off);
      });
      highways.push({ id: `h${highways.length}`, key: `c${c}`, spine, lanes, members: list });
      const used = new Set(members.map((m) => m.way));
      pool = pool.filter((w) => !used.has(w));
    }
  });
  return { highways };
}
