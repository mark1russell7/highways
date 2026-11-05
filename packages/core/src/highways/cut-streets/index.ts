/**
 * The highway strategy `cut-streets` (WILD-035): streets along the cuts, after the blocks of a city and the seams of a garment.
 * A guillotine grouping cuts the board with lines. The free pieces of those lines become streets, and the edges between groups ride them.
 */
import { dist, type Point } from "../../geom.ts";
import { cutGroups } from "../../groups/cut/index.ts";
import { kdGroups } from "../../groups/kd/index.ts";
import type { Graph } from "../../model.ts";
import type { Section } from "../../sections.ts";
import { MinHeap } from "../../visibility.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { freePieces, type FreeLine } from "../free-lines.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The grouping rule that cuts the board: the guillotine cut of `cut`, or the median split of `kd`. */
export type CutStreetGrouping = "cut" | "kd";

/** The values of `CutStreetGrouping`. */
export const CUT_STREET_GROUPINGS: readonly CutStreetGrouping[] = Object.freeze(["cut", "kd"]);

/** The options of the highway strategy `cut-streets` (WILD-035). */
export interface CutStreetOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The grouping rule that cuts the board. The default is `cut`. */
  readonly grouping: CutStreetGrouping;
  /** The number of levels of the tree whose cut lines become streets, from 1 to 3. The default is 2. */
  readonly levels: number;
  /** The cost of each ramp to a street or from it, in margins, from 0 to 4. The default is 1. */
  readonly reach: number;
  /** An edge rides the streets only when its way is this many times its first route, or shorter, from 1 to 3. The default is 1.6. */
  readonly detour: number;
  /** A highway has this number of edges or more, from 2 to 16. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `cut-streets`. */
export const CUT_STREET_DEFAULTS: Readonly<Required<Omit<CutStreetOptions, "margin" | "k">>> = Object.freeze({ grouping: "cut", levels: 2, reach: 1, detour: 1.6, minSize: 2 });

/** The number of streets near an end that the ramps of an end try. */
const RAMPS = 4;

/** One cut line of a section: the line `x = c` (axis `x`) or `y = c` (axis `y`), from `lo` to `hi`. */
export interface CutLine {
  readonly axis: "x" | "y";
  readonly c: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * This function gives the cut lines of the sections of a tree, down to the depth `levels`. A side of a child cell that is inside the cell of its parent is a cut line.
 * The list has no copies, and its order is the same each time.
 */
export function cutLines(root: Section, levels: number): CutLine[] {
  const out = new Map<string, CutLine>();
  const eps = 1e-6;
  const visit = (s: Section): void => {
    if (s.depth >= levels || s.children.length === 0) return;
    const p = s.cell;
    for (const ch of s.children) {
      const b = ch.cell;
      const sides: CutLine[] = [
        { axis: "x", c: b.x, lo: b.y, hi: b.y + b.h },
        { axis: "x", c: b.x + b.w, lo: b.y, hi: b.y + b.h },
        { axis: "y", c: b.y, lo: b.x, hi: b.x + b.w },
        { axis: "y", c: b.y + b.h, lo: b.x, hi: b.x + b.w },
      ];
      for (const l of sides) {
        const inside = l.axis === "x" ? l.c > p.x + eps && l.c < p.x + p.w - eps : l.c > p.y + eps && l.c < p.y + p.h - eps;
        if (!inside || l.hi - l.lo <= eps) continue;
        out.set(`${l.axis}|${l.c}|${l.lo}|${l.hi}`, l);
      }
      visit(ch);
    }
  };
  visit(root);
  return [...out.values()].sort((a, b) => (a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : a.c - b.c || a.lo - b.lo || a.hi - b.hi));
}

/** The graph of the streets: the points of its nodes, the links of each node, and the street of each link. */
export interface StreetGraph {
  readonly points: readonly Point[];
  readonly adj: readonly (readonly number[])[];
  /** The free pieces of the cut lines. */
  readonly streets: readonly FreeLine[];
  /** The nodes on each street, in their order along it. */
  readonly along: readonly (readonly number[])[];
}

/** This function makes the street graph of a list of streets. Its nodes are the ends of the streets and the points where two streets cross. */
export function streetGraph(streets: readonly FreeLine[]): StreetGraph {
  const ids = new Map<string, number>();
  const points: Point[] = [];
  const idOf = (p: Point): number => {
    const k = `${p.x},${p.y}`;
    let i = ids.get(k);
    if (i === undefined) {
      ids.set(k, (i = points.length));
      points.push(p);
    }
    return i;
  };
  const vertical = (l: FreeLine): boolean => l.a.x === l.b.x;
  const on: Point[][] = streets.map((l) => [l.a, l.b]);
  for (let i = 0; i < streets.length; i++) {
    for (let j = i + 1; j < streets.length; j++) {
      const p = streets[i]!;
      const q = streets[j]!;
      if (vertical(p) === vertical(q)) continue;
      const v = vertical(p) ? p : q;
      const h = vertical(p) ? q : p;
      const x = v.a.x;
      const y = h.a.y;
      if (x < Math.min(h.a.x, h.b.x) || x > Math.max(h.a.x, h.b.x) || y < Math.min(v.a.y, v.b.y) || y > Math.max(v.a.y, v.b.y)) continue;
      on[i]!.push({ x, y });
      on[j]!.push({ x, y });
    }
  }
  const adj: Set<number>[] = [];
  const along: number[][] = [];
  streets.forEach((l, s) => {
    const axis = vertical(l) ? "y" : "x";
    const list = [...new Set(on[s]!.map(idOf))].sort((a, b) => points[a]![axis] - points[b]![axis]);
    along.push(list);
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1]!;
      const b = list[k]!;
      (adj[a] ??= new Set()).add(b);
      (adj[b] ??= new Set()).add(a);
    }
  });
  return { points, adj: points.map((_, i) => [...(adj[i] ?? [])].sort((a, b) => a - b)), streets, along };
}

/** This function gives the point of the street `l` nearest to `p`. */
function project(l: FreeLine, p: Point): Point {
  if (l.a.x === l.b.x) return { x: l.a.x, y: Math.min(Math.max(p.y, Math.min(l.a.y, l.b.y)), Math.max(l.a.y, l.b.y)) };
  return { x: Math.min(Math.max(p.x, Math.min(l.a.x, l.b.x)), Math.max(l.a.x, l.b.x)), y: l.a.y };
}

/** A ramp from an end to a street: the street, the point on it, and its cost. */
interface Ramp {
  readonly street: number;
  readonly point: Point;
  readonly cost: number;
}

/**
 * This function gives the way of one edge on the streets, from the end `s` to the end `t`, or `undefined`.
 * Each end takes a straight ramp to one of the `RAMPS` nearest streets that it sees. Each ramp costs its length plus `extra`.
 */
function streetWay(g: StreetGraph, s: Point, t: Point, clear: (a: Point, b: Point) => boolean, extra: number): { points: Point[]; cost: number } | undefined {
  const ramps = (p: Point): Ramp[] =>
    g.streets
      .map((l, i) => {
        const q = project(l, p);
        return { street: i, point: q, cost: dist(p, q) + extra };
      })
      .sort((a, b) => a.cost - b.cost || a.street - b.street)
      .slice(0, RAMPS)
      .filter((r) => clear(p, r.point));
  const from = ramps(s);
  const to = ramps(t);
  if (from.length === 0 || to.length === 0) return undefined;
  const n = g.points.length;
  // The nodes n + i are the points of the ramps of `from`, and the nodes n + from.length + j are the points of the ramps of `to`.
  const pointOf = (i: number): Point => (i < n ? g.points[i]! : i < n + from.length ? from[i - n]!.point : to[i - n - from.length]!.point);
  const nextTo = (r: Ramp): number[] => {
    const list = g.along[r.street]!;
    const axis = g.streets[r.street]!.a.x === g.streets[r.street]!.b.x ? "y" : "x";
    const v = r.point[axis];
    let lo = -1;
    let hi = -1;
    for (const id of list) {
      const u = g.points[id]![axis];
      if (u <= v) lo = id;
      if (u >= v && hi < 0) hi = id;
    }
    return [...new Set([lo, hi].filter((x) => x >= 0))];
  };
  const goal = new Map<number, number>();
  to.forEach((r) => {
    for (const id of nextTo(r)) goal.set(id, Math.min(goal.get(id) ?? Infinity, dist(g.points[id]!, r.point) + r.cost));
  });
  const best = new Map<number, number>();
  const parent = new Map<number, number>();
  const heap = new MinHeap();
  from.forEach((r, i) => {
    best.set(n + i, r.cost);
    parent.set(n + i, -1);
    heap.push(r.cost, n + i);
  });
  // A ramp of `from` and a ramp of `to` on one street join with no node between them.
  let finish = Infinity;
  let last = -1;
  let lastTo = -1;
  from.forEach((a, i) => {
    to.forEach((b, j) => {
      if (a.street !== b.street) return;
      const c = a.cost + dist(a.point, b.point) + b.cost;
      if (c < finish) {
        finish = c;
        last = n + i;
        lastTo = j;
      }
    });
  });
  const done = new Set<number>();
  while (heap.size > 0) {
    if (heap.topKey >= finish) break;
    const i = heap.pop();
    if (done.has(i)) continue;
    done.add(i);
    const gi = best.get(i)!;
    if (i < n) {
      const tail = goal.get(i);
      if (tail !== undefined && gi + tail < finish) {
        // The ramp of `to` with the least cost from this node.
        let k = -1;
        let c = Infinity;
        to.forEach((r, j) => {
          if (!nextTo(r).includes(i)) return;
          const v = dist(g.points[i]!, r.point) + r.cost;
          if (v < c) {
            c = v;
            k = j;
          }
        });
        finish = gi + c;
        last = i;
        lastTo = k;
      }
    }
    const out = i < n ? g.adj[i]! : nextTo(from[i - n]!);
    for (const j of out) {
      const v = gi + dist(pointOf(i), g.points[j]!);
      if (v < (best.get(j) ?? Infinity)) {
        best.set(j, v);
        parent.set(j, i);
        heap.push(v, j);
      }
    }
  }
  if (last < 0 || lastTo < 0) return undefined;
  const chain: Point[] = [to[lastTo]!.point];
  for (let i = last; i >= 0; i = parent.get(i)!) chain.push(pointOf(i));
  chain.push(s);
  chain.reverse();
  chain.push(t);
  return { points: chain.filter((p, i) => i === 0 || dist(p, chain[i - 1]!) > 1e-9), cost: finish };
}

/** This function gives the group of each node: the index of its section at the depth `levels`, or of its leaf above that depth. */
function groupsOf(root: Section, levels: number, n: number): Int32Array {
  const out = new Int32Array(n).fill(-1);
  let next = 0;
  const visit = (s: Section): void => {
    if (s.depth >= levels || s.children.length === 0) {
      const g = next++;
      for (const i of s.nodes) out[i] = g;
      return;
    }
    for (const ch of s.children) visit(ch);
  };
  visit(root);
  return out;
}

/** This function gives the tree of sections of the rule `grouping` on a graph. */
function treeOf(graph: Graph, grouping: CutStreetGrouping): Section {
  return grouping === "kd" ? kdGroups(graph) : cutGroups(graph);
}

/**
 * This function gives the highways of the streets along the cuts (WILD-035). The cut lines of the tree, down to the depth `levels`, break into free pieces.
 * The pieces are streets, with nodes where they cross. Each edge between two groups takes a ramp to a street near each end, and the shortest way on the streets.
 * The edge keeps the street way only when it is at most `detour` times its first route. Each stretch of street that `minSize` ways or more share is one highway.
 */
export function cutStreetPlan(input: HighwayInput, o: Readonly<CutStreetOptions>): HighwayPlan {
  const graph = input.graph;
  if (graph.nodes.length < 2) return { highways: [] };
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const levels = Math.max(1, Math.min(3, Math.floor(o.levels)));
  const root = treeOf(graph, o.grouping);
  const pad = finder.margin;
  const streets = cutLines(root, levels).flatMap((l) => freePieces(finder, l.axis, l.c, pad, 2 * pad, l.lo, l.hi));
  if (streets.length === 0) return { highways: [] };
  const g = streetGraph(streets);
  const group = groupsOf(root, levels, graph.nodes.length);
  const index = new Map(graph.nodes.map((nd, i) => [nd.id, i]));
  const clear = (a: Point, b: Point): boolean => finder.obstacles.clear(a, b, pad / 2);
  const extra = Math.max(0, o.reach) * pad;
  const ways: KeyedWay[] = [];
  for (const { edge, ps, pt } of edgePlugs(graph)) {
    const si = index.get(edge.source.node);
    const ti = index.get(edge.target.node);
    if (si === undefined || ti === undefined || group[si] === group[ti]) continue;
    const a = finder.out(ps);
    const b = finder.out(pt);
    if (finder.obstacles.clear(a, b, pad)) continue;
    const way = streetWay(g, a, b, clear, extra);
    if (!way) continue;
    const first = finder.corners.path(a, b);
    if (!first) continue;
    let base = 0;
    for (let i = 1; i < first.length; i++) base += dist(first[i - 1]!, first[i]!);
    let length = 0;
    for (let i = 1; i < way.points.length; i++) length += dist(way.points[i - 1]!, way.points[i]!);
    if (length > Math.max(1, o.detour) * Math.max(base, 1e-9)) continue;
    ways.push({ edge: edge.id, key: "street", points: way.points });
  }
  const node = new Set(g.points.map((p) => `${p.x},${p.y}`));
  const onStreet = (p: Point, q: Point): boolean => node.has(`${p.x},${p.y}`) && node.has(`${q.x},${q.y}`);
  return sharedStretches(ways, { minSize: Math.max(2, Math.floor(o.minSize)), link: onStreet });
}
