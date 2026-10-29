/**
 * The plug strategy `assign` (PLUG-ASSIGN): the plugs of each wall go to the intervals of their ends, with a least gap.
 * An interval is the range of the port (PORT-RANGE), or the room of the wall. The assignment is exact for the count of the ends in their intervals.
 */
import { center } from "../../geom.ts";
import { nodeIndex, portOffset, type End, type Node, type Side } from "../../model.ts";
import { nearestSide, placePlug, SIDE_NORMAL, sideToward, type Plug } from "../../plugs.ts";
import type { PlugInput, PlugPair } from "../../strategies/model.ts";
import { placeInIntervals, rangeInterval } from "../range.ts";
import { alongOf, keyOf, pointAt, roomOf } from "../walls.ts";

/** The options of the plug strategy `assign`. */
export interface AssignOptions {
  /** The least gap between two plugs of one wall. When the room of the wall is too small for all its plugs, the gap shrinks evenly. The default is 8. */
  readonly plugGap?: number;
  /** The distance from a plug to a corner of its box, or a quarter of the wall when the wall is short. The default is 6. */
  readonly inset?: number;
}

/** The defaults of the plug strategy `assign`. */
export const ASSIGN_DEFAULTS: Required<AssignOptions> = Object.freeze({ plugGap: 8, inset: 6 });

/** One end of a wall for `assignWall`. The places are on the axis along the wall. */
export interface WallEnd {
  /** The start of the interval of the end. */
  readonly lo: number;
  /** The end of the interval of the end. */
  readonly hi: number;
  /** The place of the plug that faces the far end. The plan moves the plugs the least distance from these places. */
  readonly ideal: number;
  /** The sort key of the far end. Plugs in the order of the keys do not cross at the wall. */
  readonly key: number;
}

/** The plan of one wall: the place of each plug, and the ends with their plug in their interval. */
export interface WallPlan {
  /** The place of the plug of each end, in the order of the ends. */
  readonly at: number[];
  /** For each end, `true` when its plug is in its interval. */
  readonly anchored: boolean[];
  /** The gap of the wall: the option `gap`, or less when the room of the wall is too short for all its plugs. */
  readonly gap: number;
}

/** The tolerance of the comparisons of places along a wall. */
const EPS = 1e-9;

/** This function gives the index of the first value of the sorted list `list` that is `v` or more. */
function lowerBound(list: readonly number[], v: number): number {
  let a = 0;
  let b = list.length;
  while (a < b) {
    const mid = (a + b) >> 1;
    if (list[mid]! < v) a = mid + 1;
    else b = mid;
  }
  return a;
}

/**
 * This function moves the place `p` out of the zones of the fixed plugs: the open intervals of the width `2·s` around each fixed plug.
 * The list `fixed` is sorted. The place only moves up.
 */
function pushOut(p: number, fixed: readonly number[], s: number): number {
  for (const f of fixed) if (p > f - s + EPS && p < f + s - EPS) p = f + s;
  return p;
}

/**
 * This function gives the gap of a wall with `n` plugs: `gap`, or the largest gap that lets all the plugs go in the room.
 * The plugs keep the gap to the fixed plugs too.
 */
function wallGap(n: number, fixed: readonly number[], lo: number, hi: number, gap: number): number {
  if (n <= 1) return gap;
  if (fixed.length === 0) return Math.max(0, Math.min(gap, (hi - lo) / (n - 1)));
  const fits = (s: number): boolean => {
    let p = lo;
    for (let c = 0; c < n; c++) {
      p = pushOut(p, fixed, s);
      if (p > hi + EPS) return false;
      p += s;
    }
    return true;
  };
  if (fits(gap)) return gap;
  // The count of plugs that fit goes down when the gap goes up. A bisection finds the largest gap that fits.
  let a = 0;
  let b = gap;
  for (let i = 0; i < 60; i++) {
    const mid = (a + b) / 2;
    if (fits(mid)) a = mid;
    else b = mid;
  }
  return a;
}

/** One item of the order of a wall: an end with its plug in its interval or not, or a fixed plug. */
type Item = { readonly end: number; readonly anchored: boolean; at: number } | { readonly end: -1; readonly anchored: true; at: number };

/**
 * This function gives the plan of the ends of one wall in the order of their keys, with no crossing at the wall.
 * The plan has the most ends in their intervals that this order lets. The answer is exact for this order: a table of the least last place
 * for each count of ends in their intervals.
 */
function keyOrderPlan(order: readonly number[], win: readonly ([number, number] | undefined)[], fixed: readonly number[], lo: number, hi: number, s: number): Item[] | undefined {
  const n = order.length;
  const nf = fixed.length;
  const at = (i: number, j: number, c: number): number => (i * (nf + 1) + j) * (n + 1) + c;
  const best = new Float64Array((n + 1) * (nf + 1) * (n + 1)).fill(Infinity);
  // The step to the state: 0 passes a fixed plug, 1 places an end in its interval, 2 places an end out of its interval.
  const step = new Int8Array(best.length);
  best[at(0, 0, 0)] = -Infinity;
  const relax = (k: number, v: number, how: number): void => {
    if (v < best[k]!) {
      best[k] = v;
      step[k] = how;
    }
  };
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= nf; j++)
      for (let c = 0; c <= i; c++) {
        const v = best[at(i, j, c)]!;
        if (v === Infinity) continue;
        const next = v === -Infinity ? -Infinity : v + s;
        if (j < nf && (v === -Infinity || v + s <= fixed[j]! + EPS)) relax(at(i, j + 1, c), fixed[j]!, 0);
        if (i < n) {
          const w = win[order[i]!];
          if (w) {
            const p = Math.max(w[0], next);
            if (p <= w[1] + EPS) relax(at(i + 1, j, c + 1), p, 1);
          }
          const q = Math.max(lo, next);
          if (q <= hi + EPS) relax(at(i + 1, j, c), q, 2);
        }
      }
  let c = n;
  while (c >= 0 && best[at(n, nf, c)] === Infinity) c--;
  if (c < 0) return undefined;
  const items: Item[] = [];
  let i = n;
  let j = nf;
  while (i > 0 || j > 0) {
    const k = at(i, j, c);
    const how = step[k];
    if (how === 0) {
      items.push({ end: -1, anchored: true, at: fixed[--j]! });
    } else {
      items.push({ end: order[--i]!, anchored: how === 1, at: best[k]! });
      if (how === 1) c--;
    }
  }
  return items.reverse();
}

/**
 * This function gives the most ends of a wall that can have their plug in their interval, in any order, and one plan with that count.
 * Each end without its plug in its interval still gets a plug in the room of the wall: a free plug.
 *
 * The plan comes from two facts. First, a plan can move each plug down until it touches its interval, the room, a fixed zone or the plug before it.
 * Thus each plug is at a start place plus a whole number of gaps. Second, a swap of two plugs makes the last plug of the plan the end with the latest interval end.
 * Then the ends with an interval start up to its place are before it, and the others after it. This split gives a table over the ends and two places (the recursion `count`).
 * The free plugs have the room as interval and the latest end. Thus they split the wall into parts, and a second table chains the parts.
 */
function bestPlan(order: readonly number[], win: readonly ([number, number] | undefined)[], ideals: readonly number[], fixed: readonly number[], lo: number, hi: number, s: number): Item[] {
  const n = order.length;
  const jobs = order.filter((e) => win[e] !== undefined).sort((a, b) => win[a]![1] - win[b]![1] || win[a]![0] - win[b]![0] || a - b);
  const r = jobs.length;
  const allowed = (t: number): boolean => t >= lo - EPS && t <= hi + EPS && fixed.every((f) => t <= f - s + EPS || t >= f + s - EPS);
  // The places that a plan needs: a start place plus a whole number of gaps.
  const starts = [lo, ...jobs.map((e) => win[e]![0]), ...fixed.map((f) => f + s)];
  const raw: number[] = [];
  for (const b of starts)
    for (let q = 0; q <= n; q++) {
      const t = b + q * s;
      if (t > hi + EPS) break;
      if (allowed(t)) raw.push(t);
      if (s === 0) break;
    }
  raw.sort((a, b) => a - b);
  const T: number[] = [];
  for (const t of raw) if (T.length === 0 || t - T[T.length - 1]! > EPS) T.push(t);
  const m = T.length;
  const id = (k: number, ui: number, vi: number): number => (k * (m + 2) + ui + 1) * (m + 2) + vi + 1;
  const memo = new Map<number, number>();
  const pick = new Map<number, number>();
  // The most of the first k jobs with an interval start after T[ui] and up to T[vi] that fit between the two places, with the gap.
  // The index -1 is no place before, and the index m is no place after.
  const count = (k: number, ui: number, vi: number): number => {
    if (k === 0) return 0;
    const key = id(k, ui, vi);
    const got = memo.get(key);
    if (got !== undefined) return got;
    const e = jobs[k - 1]!;
    const [a, b] = win[e]!;
    const u = ui < 0 ? -Infinity : T[ui]!;
    const v = vi >= m ? Infinity : T[vi]!;
    let most = count(k - 1, ui, vi);
    let choice = -1;
    if (a > u + EPS && a <= v + EPS) {
      const from = Math.max(a, ui < 0 ? lo : u + s);
      const to = Math.min(b, vi >= m ? hi : v - s);
      for (let ti = lowerBound(T, from - EPS); ti < m && T[ti]! <= to + EPS; ti++) {
        const got2 = 1 + count(k - 1, ui, ti) + count(k - 1, ti, vi);
        if (got2 > most) {
          most = got2;
          choice = ti;
        }
      }
    }
    memo.set(key, most);
    if (choice >= 0) pick.set(key, choice);
    return most;
  };
  // The chain of the free plugs: `chain[q][i]` is the most ends in their intervals before the free plug number q at T[i].
  let total = r === n ? count(r, -1, m) : -1;
  let bestQ = 0;
  let bestI = -1;
  const chain: Float64Array[] = [];
  const back: Int32Array[] = [];
  for (let q = 1; q <= n; q++) {
    const cur = new Float64Array(m).fill(-Infinity);
    const from = new Int32Array(m).fill(-1);
    for (let i = 0; i < m; i++) {
      if (q === 1) {
        cur[i] = count(r, -1, i);
        continue;
      }
      const prev = chain[q - 2]!;
      for (let h = 0; h < i; h++) {
        if (prev[h] === -Infinity || T[i]! - T[h]! < s - EPS) continue;
        const v = prev[h]! + count(r, h, i);
        if (v > cur[i]!) {
          cur[i] = v;
          from[i] = h;
        }
      }
    }
    chain.push(cur);
    back.push(from);
    for (let i = 0; i < m; i++) {
      if (cur[i] === -Infinity) continue;
      const a = cur[i]! + count(r, i, m);
      if (a + q >= n && a > total) {
        total = a;
        bestQ = q;
        bestI = i;
      }
    }
  }
  // The places of the plan: the jobs in their intervals, then the free plugs.
  const placed = new Map<number, number>();
  const place = (k: number, ui: number, vi: number): void => {
    if (k === 0) return;
    const t = pick.get(id(k, ui, vi));
    if (t === undefined) return place(k - 1, ui, vi);
    placed.set(jobs[k - 1]!, T[t]!);
    place(k - 1, ui, t);
    place(k - 1, t, vi);
  };
  const free: number[] = [];
  let ui = bestI;
  for (let q = bestQ; q >= 1; q--) {
    free.push(T[ui]!);
    const h = back[q - 1]![ui]!;
    place(r, h, ui);
    ui = h;
  }
  if (bestQ === 0) place(r, -1, m);
  else place(r, bestI, m);
  free.reverse();
  // The ends out of their intervals take free places in the order of their keys, with the least sum of the squares of the moves.
  const rest = order.filter((e) => !placed.has(e));
  const slots = assignInOrder(rest, free);
  const items: Item[] = [];
  for (const [e, p] of placed) items.push({ end: e, anchored: true, at: p });
  rest.forEach((e, i) => items.push({ end: e, anchored: false, at: slots[i]! }));
  for (const f of fixed) items.push({ end: -1, anchored: true, at: f });
  return items.sort((a, b) => a.at - b.at || (a.end < 0 ? -1 : b.end < 0 ? 1 : order.indexOf(a.end) - order.indexOf(b.end)));

  /** This function gives each end of `list` one of the sorted places `free`, in order, with the least sum of the squares of the moves from the ideal places. */
  function assignInOrder(list: readonly number[], places: readonly number[]): number[] {
    const a = list.length;
    const b = places.length;
    const cost = (i: number, j: number): number => (places[j]! - ideals[list[i]!]!) ** 2;
    const g = Array.from({ length: a + 1 }, () => new Float64Array(b + 1).fill(Infinity));
    for (let j = 0; j <= b; j++) g[0]![j] = 0;
    for (let i = 1; i <= a; i++) for (let j = i; j <= b; j++) g[i]![j] = Math.min(g[i]![j - 1]!, g[i - 1]![j - 1]! + cost(i - 1, j - 1));
    const out = new Array<number>(a);
    let j = b;
    for (let i = a; i >= 1; i--) {
      while (j > i && g[i]![j - 1] === g[i]![j]) j--;
      out[i - 1] = places[j - 1]!;
      j--;
    }
    return out;
  }
}

/**
 * This function gives the plan of one wall (PLUG-ASSIGN). Each end has an interval on the axis along the wall. The plugs keep at least `gap` between two of them,
 * and between a plug and a fixed plug at a place of `fixed`. When the room is too short for all the plugs, the gap shrinks evenly. The plan has three goals, in this order:
 * 1. the most ends with their plug in their interval (exact);
 * 2. no crossing at the wall: the order of the keys, when that order lets the count of goal 1;
 * 3. the least sum of the squares of the moves from the ideal places, for the order and the ends of goals 1 and 2.
 *
 * An end that cannot get a plug in its interval still gets a plug in the room. When the order of the keys loses ends, the plugs swap their places
 * to come nearer to that order, while each end keeps its interval.
 */
export function assignWall(ends: readonly WallEnd[], room: readonly [number, number], gap: number, fixed: readonly number[] = []): WallPlan {
  const n = ends.length;
  if (n === 0) return { at: [], anchored: [], gap };
  const [lo, hi] = room;
  const pins = [...fixed].sort((a, b) => a - b);
  let s = wallGap(n, pins, lo, hi, Math.max(0, gap));
  const win = ends.map((e): [number, number] | undefined => {
    const a = Math.max(lo, e.lo);
    const b = Math.min(hi, e.hi);
    return a <= b + EPS ? [a, Math.max(a, b)] : undefined;
  });
  const order = ends.map((_, i) => i).sort((a, b) => ends[a]!.key - ends[b]!.key || a - b);
  let items = keyOrderPlan(order, win, pins, lo, hi, s);
  if (!items) {
    // The bisection of the gap can miss by a rounding error. A gap of 0 always fits.
    s = 0;
    items = keyOrderPlan(order, win, pins, lo, hi, s)!;
  }
  const inKey = items.filter((x) => x.end >= 0 && x.anchored).length;
  const can = win.filter((w) => w !== undefined).length;
  if (inKey < can && inKey < unionCap(win, pins, lo, hi, s, n)) {
    const best = bestPlan(
      order,
      win,
      ends.map((e) => e.ideal),
      pins,
      lo,
      hi,
      s,
    );
    if (best.filter((x) => x.end >= 0 && x.anchored).length > inKey) items = untangle(best, ends, win);
  }
  // The places of the order: each end in its interval, or in the room. A fixed plug stays at its place.
  const span = items.map((x): [number, number] => (x.end < 0 ? [x.at, x.at] : x.anchored ? win[x.end]! : [lo, hi]));
  const placed = placeInIntervals(
    items.map((x) => (x.end < 0 ? x.at : ends[x.end]!.ideal)),
    span.map((v) => v[0]),
    span.map((v) => v[1]),
    s,
  );
  const at = new Array<number>(n);
  items.forEach((x, i) => {
    if (x.end >= 0) at[x.end] = placed[i]!;
  });
  const anchored = ends.map((e, i) => at[i]! >= e.lo - 1e-7 && at[i]! <= e.hi + 1e-7 && win[i] !== undefined);
  return { at, anchored, gap: s };
}

/** This function gives the most plugs with the gap `s` in the union of the intervals, out of the fixed zones, and at most `n`. It is a bound of goal 1. */
function unionCap(win: readonly ([number, number] | undefined)[], fixed: readonly number[], lo: number, hi: number, s: number, n: number): number {
  const parts = win.filter((w): w is [number, number] => w !== undefined).sort((a, b) => a[0] - b[0]);
  let count = 0;
  let p = -Infinity;
  for (const [a, b] of parts) {
    let v = Math.max(a, p, lo);
    for (;;) {
      v = pushOut(v, fixed, s);
      if (v > b + EPS || v > hi + EPS || count >= n) break;
      count++;
      p = v + s;
      v = p;
      if (s === 0) return n;
    }
  }
  return count;
}

/**
 * This function swaps the places of two neighbours of a plan when their keys are in the wrong order, and each end keeps its interval.
 * Thus the plan comes nearer to the order of the keys. Each swap removes one inversion, so the loop ends.
 */
function untangle(items: Item[], ends: readonly WallEnd[], win: readonly ([number, number] | undefined)[]): Item[] {
  const own = items.filter((x) => x.end >= 0);
  const ok = (x: Item, p: number): boolean => !x.anchored || (p >= win[x.end]![0] - EPS && p <= win[x.end]![1] + EPS);
  for (let changed = true, rounds = 0; changed && rounds <= own.length * own.length; rounds++) {
    changed = false;
    for (let i = 0; i + 1 < own.length; i++) {
      const x = own[i]!;
      const y = own[i + 1]!;
      if (ends[x.end]!.key <= ends[y.end]!.key) continue;
      if (!ok(x, y.at) || !ok(y, x.at)) continue;
      const t = x.at;
      x.at = y.at;
      y.at = t;
      own[i] = y;
      own[i + 1] = x;
      changed = true;
    }
  }
  return items.sort((a, b) => a.at - b.at || (a.end < 0 ? -1 : b.end < 0 ? 1 : ends[a.end]!.key - ends[b.end]!.key));
}

/** A free plug: one port of a node, or one end without a port. All the ends of one port share its plug. */
interface Slot {
  readonly node: Node;
  readonly side: Side;
  readonly ideal: number;
  readonly range?: readonly [number, number];
  far?: Plug | string;
  at: number;
}

/**
 * This function gives the plugs of the plug strategy `assign` (PLUG-ASSIGN). A fixed plug stays at its point, and a plug with a side stays on that side.
 * Each free plug goes on the side that faces the other end (`sideToward`). Each end of a wall has an interval: the range of its port, or the room of the wall.
 * Then `assignWall` places the plugs of each wall, with at least `plugGap` between two of them. The ends of one port share one plug.
 *
 * The output has one entry for each edge with two known nodes, in the order of the edges.
 */
export function assignEnds(input: PlugInput, options: AssignOptions = {}): PlugPair[] {
  const { graph } = input;
  const gap = options.plugGap ?? ASSIGN_DEFAULTS.plugGap;
  const inset = options.inset ?? ASSIGN_DEFAULTS.inset;
  const byId = nodeIndex(graph);
  const slots = new Map<string, Slot>();
  const walls = new Map<string, { node: Node; side: Side; slots: Slot[]; fixed: number[] }>();
  const wallOf = (node: Node, side: Side): { node: Node; side: Side; slots: Slot[]; fixed: number[] } => {
    const key = JSON.stringify([node.id, side]);
    let wall = walls.get(key);
    if (!wall) {
      const fixed: number[] = [];
      for (const p of node.ports ?? []) {
        const at = portOffset(node.box, p);
        if (at === undefined) continue;
        const point = { x: node.box.x + at.x, y: node.box.y + at.y };
        if ((p.side ?? nearestSide(node.box, point)) === side) fixed.push(point[alongOf(side)]);
      }
      walls.set(key, (wall = { node, side, slots: [], fixed }));
    }
    return wall;
  };
  const plugOf = (node: Node, end: End, far: Node): Plug | string => {
    const toward = center(far.box);
    const port = end.port === undefined ? undefined : node.ports?.find((p) => p.id === end.port);
    if (port && portOffset(node.box, port) !== undefined) return placePlug(node, end, toward);
    const key = port ? JSON.stringify([node.id, port.id]) : JSON.stringify([node.id, slots.size]);
    if (slots.has(key)) return key;
    const side = port?.side ?? sideToward(node.box, toward);
    const ideal = placePlug(node, end, toward).point[alongOf(side)];
    const range = rangeInterval(node.box, side, port, inset);
    const slot: Slot = { node, side, ideal, at: ideal, ...(range ? { range } : {}) };
    slots.set(key, slot);
    wallOf(node, side).slots.push(slot);
    return key;
  };
  const ends: { edge: string; source: Plug | string; target: Plug | string }[] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    const source = plugOf(s, e.source, t);
    const target = plugOf(t, e.target, s);
    for (const [own, far] of [
      [source, target],
      [target, source],
    ] as const) {
      const slot = typeof own === "string" ? slots.get(own)! : undefined;
      if (slot && slot.far === undefined) slot.far = far;
    }
    ends.push({ edge: e.id, source, target });
  }
  // The far point of a slot: a fixed plug, or the facing plug of the far slot.
  const farPoint = (s: Slot): Plug["point"] => {
    const far = s.far!;
    if (typeof far !== "string") return far.point;
    const f = slots.get(far)!;
    return pointAt(f.node.box, f.side, f.ideal);
  };
  for (const wall of walls.values()) {
    const room = roomOf(wall.node.box, wall.side, inset);
    const list = wall.slots.map((s) => ({ lo: s.range?.[0] ?? room[0], hi: s.range?.[1] ?? room[1], ideal: s.ideal, key: keyOf(wall.node.box, wall.side, farPoint(s)) }));
    const plan = assignWall(list, room, gap, wall.fixed);
    wall.slots.forEach((s, i) => {
      s.at = plan.at[i]!;
    });
  }
  const resolve = (p: Plug | string): Plug => {
    if (typeof p !== "string") return p;
    const s = slots.get(p)!;
    return { point: pointAt(s.node.box, s.side, s.at), normal: SIDE_NORMAL[s.side] };
  };
  return ends.map((x) => ({ edge: x.edge, source: resolve(x.source), target: resolve(x.target) }));
}
