import type { Box, Point } from "../geom.ts";
import type { Node, Side } from "../model.ts";
import { SIDE_NORMAL, type Plug } from "../plugs.ts";

/**
 * One inner edge of a frame for the gutter mode. `plug` is the plug of the wall, with the outward normal of the wall.
 * `end` is the node at the other end. `port` is the fixed plug of that node, if it has one. `side` limits the entry to one side of the node.
 */
export interface GutterEdge {
  readonly plug: Plug;
  readonly end: Node;
  readonly port?: Plug;
  readonly side?: Side;
}

/** The options of the gutter mode. */
export interface GutterOptions {
  /** The cost of one bend, in units of length. The default is 16. */
  readonly bendCost?: number;
  /** The largest space between two lanes of one gap. A narrow gap gets a smaller, even space. The default is 5. */
  readonly laneGap?: number;
}

/** The default cost of one bend of the gutter mode. */
export const GUTTER_BEND_COST = 16;

const EPS = 1e-6;
/** The directions of a step: east, south, west and north, with the y axis down. */
const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

/** An entry into the end node: the point on its side and the outward normal of that side. */
interface Entry {
  readonly point: Point;
  readonly normal: Point;
  /** This flag is true when the point is a fixed plug, so that the lanes do not move it. */
  readonly fixed: boolean;
}

/**
 * This function gives the orthogonal route of each edge in the free room of a frame: the box `frame` minus the boxes of `nodes`.
 * Each route starts at the plug of the wall, and goes along the normal of the wall into the frame. It ends on a side of its end node.
 *
 * The route goes on a grid of lines. A line goes through the middle of each free band between the box edges, each plug and each entry.
 * A shortest path with a cost for each bend (`bendCost`) gives the route. Then the routes that share one gap get a lane each.
 * An edge without a path through the free room gets `undefined`.
 */
export function gutterRoutes(frame: Box, nodes: readonly Node[], edges: readonly GutterEdge[], options: GutterOptions = {}): (Point[] | undefined)[] {
  const bend = options.bendCost ?? GUTTER_BEND_COST;
  const boxes = nodes.map((n) => n.box).filter((b) => b.w > EPS && b.h > EPS);
  const entries = edges.map(entriesOf);
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const [lines, lo, size, key] of [
    [xs, frame.x, frame.w, "x"],
    [ys, frame.y, frame.h, "y"],
  ] as const) {
    const cuts = [lo, lo + size];
    for (const b of boxes) for (const v of key === "x" ? [b.x, b.x + b.w] : [b.y, b.y + b.h]) if (v > lo && v < lo + size) cuts.push(v);
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) if (cuts[i]! - cuts[i - 1]! > EPS) lines.add((cuts[i]! + cuts[i - 1]!) / 2);
  }
  edges.forEach((e, i) => {
    for (const { point, normal } of [{ point: e.plug.point, normal: e.plug.normal }, ...entries[i]!]) (normal.x !== 0 ? ys : xs).add(normal.x !== 0 ? point.y : point.x);
  });
  const grid = new Grid(frame, boxes, [...xs].sort((a, b) => a - b), [...ys].sort((a, b) => a - b));
  const routes = edges.map((e, i) => stubOnly(e, boxes) ?? grid.path(e.plug, e.end.box, entries[i]!, bend));
  return lanes(frame, boxes, edges, entries, routes, options.laneGap ?? 5);
}

/** This function gives the entries of the end node. They are its fixed plug, or the middles of its west and east sides and two points on each long side. */
function entriesOf(e: GutterEdge): Entry[] {
  if (e.port) return [{ point: e.port.point, normal: e.port.normal, fixed: true }];
  const b = e.end.box;
  const cy = b.y + b.h / 2;
  const d = Math.min(6, b.w / 4);
  const out: [Side, Point][] = [
    ["west", { x: b.x, y: cy }],
    ["east", { x: b.x + b.w, y: cy }],
    ["north", { x: b.x + d, y: b.y }],
    ["north", { x: b.x + b.w - d, y: b.y }],
    ["south", { x: b.x + d, y: b.y + b.h }],
    ["south", { x: b.x + b.w - d, y: b.y + b.h }],
  ];
  return out.filter(([s]) => e.side === undefined || s === e.side).map(([s, point]) => ({ point, normal: SIDE_NORMAL[s], fixed: false }));
}

/**
 * This function gives the route of an edge whose plug is level with its end node. The way straight in from the plug must meet that node first.
 * The route is the stub only: from the plug to the side of the node. A node that touches the wall gives a stub of length 0.
 */
function stubOnly(e: GutterEdge, boxes: readonly Box[]): Point[] | undefined {
  if (e.port) return undefined;
  const p = e.plug.point;
  const b = e.end.box;
  const n = e.plug.normal;
  let q: Point;
  if (n.x !== 0) {
    if (!(p.y > b.y + EPS && p.y < b.y + b.h - EPS)) return undefined;
    q = { x: n.x > 0 ? b.x + b.w : b.x, y: p.y };
    if ((q.x - p.x) * n.x > EPS) return undefined;
  } else {
    if (!(p.x > b.x + EPS && p.x < b.x + b.w - EPS)) return undefined;
    q = { x: p.x, y: n.y > 0 ? b.y + b.h : b.y };
    if ((q.y - p.y) * n.y > EPS) return undefined;
  }
  for (const o of boxes) if (o !== b && blocks(p, q, o)) return undefined;
  return [p, q];
}

/** This function tells if the axis-parallel segment `ab` meets the closed box `o` along a part longer than a tiny length. A segment along a side meets the box. */
function blocks(a: Point, b: Point, o: Box): boolean {
  if (a.y === b.y) {
    if (a.y < o.y - EPS || a.y > o.y + o.h + EPS) return false;
    return Math.min(Math.max(a.x, b.x), o.x + o.w) - Math.max(Math.min(a.x, b.x), o.x) > EPS;
  }
  if (a.x < o.x - EPS || a.x > o.x + o.w + EPS) return false;
  return Math.min(Math.max(a.y, b.y), o.y + o.h) - Math.max(Math.min(a.y, b.y), o.y) > EPS;
}

/** This function gives the direction index of a unit normal: 0 east, 1 south, 2 west, 3 north. */
function dirOf(n: Point): number {
  return n.x > 0 ? 0 : n.y > 0 ? 1 : n.x < 0 ? 2 : 3;
}

/** The grid of the free room: the crossings of the lines that are strictly in the frame and not in a closed box. */
class Grid {
  readonly #xs: readonly number[];
  readonly #ys: readonly number[];
  readonly #free: Uint8Array;
  readonly #boxes: readonly Box[];

  constructor(frame: Box, boxes: readonly Box[], xs: readonly number[], ys: readonly number[]) {
    this.#xs = xs;
    this.#ys = ys;
    this.#boxes = boxes;
    this.#free = new Uint8Array(xs.length * ys.length);
    for (let i = 0; i < ys.length; i++) {
      const y = ys[i]!;
      if (y <= frame.y + EPS || y >= frame.y + frame.h - EPS) continue;
      for (let j = 0; j < xs.length; j++) {
        const x = xs[j]!;
        if (x <= frame.x + EPS || x >= frame.x + frame.w - EPS) continue;
        let free = true;
        for (const b of boxes)
          if (x >= b.x - EPS && x <= b.x + b.w + EPS && y >= b.y - EPS && y <= b.y + b.h + EPS) {
            free = false;
            break;
          }
        if (free) this.#free[i * xs.length + j] = 1;
      }
    }
  }

  #point(id: number): Point {
    const nx = this.#xs.length;
    return { x: this.#xs[id % nx]!, y: this.#ys[Math.floor(id / nx)]! };
  }

  /** This method gives the neighbour of the crossing `id` in the direction `d`, or -1. Two free crossings next to each other on a line have no box between them. */
  #step(id: number, d: number): number {
    const nx = this.#xs.length;
    const i = Math.floor(id / nx);
    const j = id % nx;
    const ni = i + DY[d]!;
    const nj = j + DX[d]!;
    if (ni < 0 || nj < 0 || ni >= this.#ys.length || nj >= nx) return -1;
    const k = ni * nx + nj;
    return this.#free[k] ? k : -1;
  }

  /** This method gives the first free crossing from the point `p` in the direction `d`. The way to that crossing must be clear. */
  #enter(p: Point, d: number, skip?: Box): number {
    const nx = this.#xs.length;
    const along = d % 2 === 0;
    const line = along ? this.#ys.indexOf(p.y) : this.#xs.indexOf(p.x);
    if (line < 0) return -1;
    const list = along ? this.#xs : this.#ys;
    const v = along ? p.x : p.y;
    const sign = d < 2 ? 1 : -1;
    let k = -1;
    if (sign > 0) {
      for (let m = 0; m < list.length; m++)
        if (list[m]! > v + EPS) {
          k = m;
          break;
        }
    } else {
      for (let m = list.length - 1; m >= 0; m--)
        if (list[m]! < v - EPS) {
          k = m;
          break;
        }
    }
    if (k < 0) return -1;
    const id = along ? line * nx + k : k * nx + line;
    if (!this.#free[id]) return -1;
    const q = this.#point(id);
    for (const b of this.#boxes) if (b !== skip && blocks(p, q, b)) return -1;
    return id;
  }

  /**
   * This method gives the shortest path from the plug into the end box, with the cost `bend` for each bend, or `undefined`.
   * The path leaves the plug along the inward normal, and it enters an entry along the inward normal of the side.
   */
  path(plug: Plug, end: Box, entries: readonly Entry[], bend: number): Point[] | undefined {
    const n = this.#free.length;
    const d0 = dirOf({ x: -plug.normal.x, y: -plug.normal.y });
    const first = this.#enter(plug.point, d0);
    if (first < 0) return undefined;
    // The goals: for each entry, the free crossing next to it outside the end box, the last direction and the point.
    const goals: { readonly id: number; readonly dir: number; readonly point: Point }[] = [];
    for (const e of entries) {
      const id = this.#enter(e.point, dirOf(e.normal), end);
      if (id >= 0) goals.push({ id, dir: (dirOf(e.normal) + 2) % 4, point: e.point });
    }
    if (goals.length === 0) return undefined;
    const byNode = new Map<number, number[]>();
    goals.forEach((g, k) => {
      const list = byNode.get(g.id);
      if (list) list.push(k);
      else byNode.set(g.id, [k]);
    });
    // The states are a crossing and a direction. The goal states come after them.
    const states = 4 * n + goals.length;
    const cost = new Float64Array(states).fill(Infinity);
    const prev = new Int32Array(states).fill(-1);
    const heap = new Heap();
    const s0 = first * 4 + d0;
    cost[s0] = dist(plug.point, this.#point(first));
    heap.push(cost[s0]!, s0);
    let found = -1;
    while (heap.size > 0) {
      const [c, s] = heap.pop();
      if (c > cost[s]!) continue;
      if (s >= 4 * n) {
        found = s;
        break;
      }
      const id = s >> 2;
      const d = s & 3;
      const here = this.#point(id);
      for (const k of byNode.get(id) ?? []) {
        const g = goals[k]!;
        // The last leg does not turn back on the leg before it.
        if (g.dir === (d + 2) % 4) continue;
        const gs = 4 * n + k;
        const gc = c + dist(here, g.point) + (g.dir === d ? 0 : bend);
        if (gc < cost[gs]!) {
          cost[gs] = gc;
          prev[gs] = s;
          heap.push(gc, gs);
        }
      }
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        const next = this.#step(id, nd);
        if (next < 0) continue;
        const ns = next * 4 + nd;
        const nc = c + dist(here, this.#point(next)) + (nd === d ? 0 : bend);
        if (nc < cost[ns]!) {
          cost[ns] = nc;
          prev[ns] = s;
          heap.push(nc, ns);
        }
      }
    }
    if (found < 0) return undefined;
    const pts: Point[] = [goals[found - 4 * n]!.point];
    for (let s = prev[found]!; s >= 0; s = prev[s]!) pts.push(this.#point(s >> 2));
    pts.push(plug.point);
    return simplify(pts.reverse());
  }
}

function dist(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** This function takes out each point between two collinear legs, and each repeated point. */
function simplify(pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const a = out[out.length - 1];
    if (a && a.x === p.x && a.y === p.y) continue;
    const b = out[out.length - 2];
    if (a && b && ((b.x === a.x && a.x === p.x) || (b.y === a.y && a.y === p.y))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** A binary min-heap of (cost, state) pairs. Equal costs come out by the state, so the order is deterministic. */
class Heap {
  readonly #c: number[] = [];
  readonly #s: number[] = [];

  get size(): number {
    return this.#c.length;
  }

  #less(i: number, j: number): boolean {
    return this.#c[i]! < this.#c[j]! || (this.#c[i] === this.#c[j] && this.#s[i]! < this.#s[j]!);
  }

  #swap(i: number, j: number): void {
    [this.#c[i], this.#c[j]] = [this.#c[j]!, this.#c[i]!];
    [this.#s[i], this.#s[j]] = [this.#s[j]!, this.#s[i]!];
  }

  push(c: number, s: number): void {
    this.#c.push(c);
    this.#s.push(s);
    for (let i = this.#c.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!this.#less(i, p)) break;
      this.#swap(i, p);
      i = p;
    }
  }

  pop(): [number, number] {
    const top: [number, number] = [this.#c[0]!, this.#s[0]!];
    const c = this.#c.pop()!;
    const s = this.#s.pop()!;
    if (this.#c.length > 0) {
      this.#c[0] = c;
      this.#s[0] = s;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.#c.length && this.#less(l, m)) m = l;
        if (r < this.#c.length && this.#less(r, m)) m = r;
        if (m === i) break;
        this.#swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/** One leg of a route for the lanes. `across` is the coordinate that a lane changes, and `s0` to `s1` is the span along the leg. */
interface Leg {
  readonly route: number;
  readonly index: number;
  readonly horizontal: boolean;
  readonly across: number;
  readonly s0: number;
  readonly s1: number;
  /** The side to which the route turns at `s0` and at `s1`: -1, +1, or 0 at an end of the route. */
  readonly t0: number;
  readonly t1: number;
  /** The free range of `across`, so that the leg and its two next legs stay in the free room. */
  readonly lo: number;
  readonly hi: number;
  readonly pinned: boolean;
}

/**
 * This function gives each leg that shares a gap with legs of other routes its own lane. The lanes are evenly spaced in the gap,
 * at most `laneGap` apart, in an order that gives no crossing where it can. A leg from a plug of the wall and a leg into a fixed plug do not move.
 */
function lanes(frame: Box, boxes: readonly Box[], edges: readonly GutterEdge[], entries: readonly Entry[][], routes: (Point[] | undefined)[], laneGap: number): (Point[] | undefined)[] {
  const legs: Leg[] = [];
  routes.forEach((pts, r) => {
    if (!pts || pts.length < 2) return;
    const last = pts[pts.length - 1]!;
    const entry = entries[r]!.find((e) => e.point.x === last.x && e.point.y === last.y);
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[k + 1]!;
      if (a.x === b.x && a.y === b.y) continue;
      const horizontal = a.y === b.y;
      const [al, ac] = horizontal ? (["x", "y"] as const) : (["y", "x"] as const);
      const turn = (p: Point | undefined): number => (p === undefined ? 0 : Math.sign(p[ac] - a[ac]));
      const ta = turn(pts[k - 1]);
      const tb = turn(pts[k + 2]);
      const forward = b[al] > a[al];
      let [lo, hi] = free(frame, boxes, horizontal, a[ac], Math.min(a[al], b[al]), Math.max(a[al], b[al]));
      const end = k + 2 === pts.length;
      if (end && entry && !entry.fixed) {
        // A leg into a free entry stays on the side of the end box.
        const e = edges[r]!.end.box;
        const [elo, size] = horizontal ? [e.y, e.h] : [e.x, e.w];
        const q = Math.min(2, size / 4);
        lo = Math.max(lo, elo + q);
        hi = Math.min(hi, elo + size - q);
      }
      legs.push({
        route: r,
        index: k,
        horizontal,
        across: a[ac],
        s0: Math.min(a[al], b[al]),
        s1: Math.max(a[al], b[al]),
        t0: forward ? ta : tb,
        t1: forward ? tb : ta,
        lo,
        hi,
        pinned: k === 0 || (end && (entry === undefined || entry.fixed)),
      });
    }
  });
  // The groups: legs of other routes that overlap along one gap, or nearly. Each leg is in the free range of the other.
  const parent = legs.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i]!;
      const b = legs[j]!;
      if (a.route === b.route || a.horizontal !== b.horizontal) continue;
      // Two legs that end near each other on one line share a lane group too, because the lanes of the next legs can make them overlap.
      if (Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0) <= -laneGap) continue;
      if (a.across < b.lo - EPS || a.across > b.hi + EPS || b.across < a.lo - EPS || b.across > a.hi + EPS) continue;
      parent[root(i)] = root(j);
    }
  const groups = new Map<number, number[]>();
  legs.forEach((_, i) => {
    const g = root(i);
    const list = groups.get(g);
    if (list) list.push(i);
    else groups.set(g, [i]);
  });
  const out = routes.map((pts) => (pts ? pts.map((p) => ({ ...p })) : undefined));
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const group = members.map((i) => legs[i]!);
    const at = place(group, laneGap);
    group.forEach((leg, m) => {
      const pts = out[leg.route]!;
      const key = leg.horizontal ? "y" : "x";
      pts[leg.index]![key] = at[m]!;
      pts[leg.index + 1]![key] = at[m]!;
    });
  }
  return out;
}

/** This function gives the free range across a leg: the nearest box sides or walls on each side, over the span of the leg. */
function free(frame: Box, boxes: readonly Box[], horizontal: boolean, across: number, s0: number, s1: number): [number, number] {
  let lo = horizontal ? frame.y : frame.x;
  let hi = horizontal ? frame.y + frame.h : frame.x + frame.w;
  for (const b of boxes) {
    const [bs, bl, cs, cl] = horizontal ? [b.x, b.w, b.y, b.h] : [b.y, b.h, b.x, b.w];
    if (Math.min(s1, bs + bl) - Math.max(s0, bs) <= EPS) continue;
    if (cs + cl <= across + EPS) lo = Math.max(lo, cs + cl);
    if (cs >= across - EPS) hi = Math.min(hi, cs);
  }
  return [lo, hi];
}

/** This function tells the side of the leg `b` for the leg `a`. It gives -1 for the smaller coordinate, +1 for the larger and 0 for no rule. */
function want(a: Leg, b: Leg): number {
  const side = (sa: number, sb: number, ta: number, tb: number, inner: (x: number, y: number) => boolean): number => {
    if (inner(sa, sb)) return ta;
    if (inner(sb, sa)) return -tb;
    return ta === tb ? 0 : Math.sign(ta - tb);
  };
  const left = side(a.s0, b.s0, a.t0, b.t0, (x, y) => x > y + EPS);
  const right = side(a.s1, b.s1, a.t1, b.t1, (x, y) => x < y - EPS);
  if (left !== 0 && right !== 0 && left !== right) return left;
  return left || right;
}

/**
 * This function gives the lane of each leg of a group. A pinned leg keeps its place, and the pinned legs keep their order.
 * The other legs go in the order of `want`, evenly spaced between the pinned legs and the ends of the free range.
 */
function place(group: readonly Leg[], laneGap: number): number[] {
  const n = group.length;
  const soft: number[][] = group.map(() => []);
  const hard: number[][] = group.map(() => []);
  const softIn = new Array<number>(n).fill(0);
  const hardIn = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = group[i]!;
      const b = group[j]!;
      if (a.pinned && b.pinned) {
        if (Math.abs(a.across - b.across) <= EPS) continue;
        const [x, y] = a.across < b.across ? [i, j] : [j, i];
        hard[x]!.push(y);
        hardIn[y]!++;
        continue;
      }
      const w = want(a, b);
      if (w === 0) continue;
      const [x, y] = w < 0 ? [i, j] : [j, i];
      soft[x]!.push(y);
      softIn[y]!++;
    }
  // A topological order. On a cycle of soft rules, the leg with the fewest rules against it goes first.
  const order: number[] = [];
  const done = new Array<boolean>(n).fill(false);
  while (order.length < n) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || hardIn[i]! > 0) continue;
      if (best < 0 || softIn[i]! < softIn[best]! || (softIn[i] === softIn[best] && group[i]!.across < group[best]!.across - EPS)) best = i;
    }
    done[best] = true;
    order.push(best);
    for (const y of soft[best]!) softIn[y]!--;
    for (const y of hard[best]!) hardIn[y]!--;
  }
  // The pinned legs on one line stay next to each other: each one moves to the place of the first of them.
  for (let k = 0; k < order.length; k++) {
    const a = group[order[k]!]!;
    if (!a.pinned) continue;
    let to = k + 1;
    for (let m = k + 1; m < order.length; m++) {
      const b = group[order[m]!]!;
      if (b.pinned && Math.abs(b.across - a.across) <= EPS) order.splice(to++, 0, ...order.splice(m, 1));
    }
    k = to - 1;
  }
  const at = new Array<number>(n).fill(0);
  // The anchors: the pinned legs. The free legs between two anchors are evenly spaced in the free range of all of them.
  let start = 0;
  let from = -Infinity;
  for (let k = 0; k <= n; k++) {
    const i = order[k];
    const pin = i !== undefined && group[i]!.pinned;
    if (k < n && !pin) continue;
    const run = order.slice(start, k);
    if (run.length > 0) {
      const lo = Math.max(from, ...run.map((r) => group[r]!.lo));
      const hi = Math.min(k < n ? group[i!]!.across : Infinity, ...run.map((r) => group[r]!.hi));
      const room = hi - lo;
      const s = Math.min(laneGap, room / (run.length + 1));
      const width = (run.length - 1) * s;
      const mean = run.reduce((t, r) => t + group[r]!.across, 0) / run.length;
      // A free leg keeps at least the space s from a pinned leg and from an end of the free range. Without room, each leg stays.
      const first = Math.min(Math.max(mean - width / 2, lo + s), hi - s - width);
      run.forEach((r, m) => (at[r] = room > EPS && s > 0 ? first + m * s : group[r]!.across));
    }
    if (k < n) at[i!] = group[i!]!.across;
    start = k + 1;
    if (k < n) from = group[i!]!.across;
  }
  return at;
}
