import { center, type Box, type Point } from "../geom.ts";
import { levelLinks } from "../levels.ts";
import type { Edge, Graph, Router } from "../model.ts";

/** An item with a box: a node of a graph, an item of a level or a box of a host layout. */
export interface Boxed {
  readonly id: string;
  readonly box: Box;
}

/** A link between two boxes. For a bundled link, `count` is the number of its edges. The default count is 1. */
export interface RoomLink {
  readonly source: string;
  readonly target: string;
  readonly count?: number;
}

/**
 * A gap of a board: a boundary of the sweep over the left or top edges of the boxes.
 * On the axis `x`, the gap is a vertical channel between two columns. On the axis `y`, it is a horizontal channel between two rows.
 */
export interface Gap {
  readonly axis: "x" | "y";
  /** The place of the gap in the order of the gaps on its axis, from 0. */
  readonly index: number;
  /** The coordinate where the boxes after the gap start, on the axis of the gap. */
  readonly at: number;
  /** The ids of the boxes that end at the near side of the gap. */
  readonly before: readonly string[];
  /** The ids of the boxes that start at the far side of the gap, at `at`. */
  readonly after: readonly string[];
  /** The current width of the gap: the distance from the nearest box edge before the gap to `at`. */
  readonly width: number;
  /** The number of lanes that the links need in the gap. */
  readonly lanes: number;
  /** The width that the gap needs: at least the current width, and at least `gutter + lanes × spacing`. */
  readonly need: number;
}

/** The ways that `roomDemand` finds the lanes of each gap. */
export type RoomMethod = "routes" | "lines";

/** The options of `roomDemand` and `makeRoom`. */
export interface RoomOptions {
  /** The smallest width of each gap. The default is 8. */
  readonly gutter?: number;
  /** The width of one lane: the distance between two lines that run side by side. The default is 4. */
  readonly spacing?: number;
  /**
   * The largest growth of the board on each axis, as a share of its size. The default is `Infinity`.
   * When the lanes need more, each gap gets its gutter, and the lanes share the rest in proportion.
   */
  readonly maxGrowth?: number;
  /**
   * The way to find the lanes. The default is `routes`.
   * With `routes`, the function routes the links one time on the board with each gap open to the gutter.
   * The lanes of a gap are the most routes that run along the gap side by side.
   * With `lines`, the lanes of a gap are the straight lines between the centers of the boxes that cross the gap.
   */
  readonly method?: RoomMethod;
  /** The router of the method `routes`. Without it, the links go as the links of a zoom level (`levelLinks`), with the margin `gutter / 2`. */
  readonly router?: Router;
  /** With `count`, a link takes one lane for each of its edges. With `link`, the default, a link takes one lane. */
  readonly lanes?: "link" | "count";
  /** Two box edges nearer than this distance make one boundary of the sweep. The default is 0.5. */
  readonly snap?: number;
}

/** The demand of a board and the board with its gaps open. */
export interface Room<T extends Boxed> {
  readonly gaps: readonly Gap[];
  readonly items: T[];
}

const DEFAULT_GUTTER = 8;
const DEFAULT_SPACING = 4;
const DEFAULT_SNAP = 0.5;

type Axis = "x" | "y";

const lo = (b: Box, a: Axis): number => (a === "x" ? b.x : b.y);
const len = (b: Box, a: Axis): number => (a === "x" ? b.w : b.h);
const other = (a: Axis): Axis => (a === "x" ? "y" : "x");

/**
 * This function gives the gaps of a board. A sweep over each axis sorts the left (or top) edges of the boxes.
 * Each distinct edge after the first is a gap. The `lanes` of each gap are 0, and its `need` is its current width.
 */
export function boardGaps(items: readonly Boxed[], snap: number = DEFAULT_SNAP): Gap[] {
  return [...axisGaps(items, "x", snap), ...axisGaps(items, "y", snap)];
}

function axisGaps(items: readonly Boxed[], axis: Axis, snap: number): Gap[] {
  const starts = [...new Set(items.map((i) => lo(i.box, axis)))].sort((u, v) => u - v);
  const bounds: number[] = [];
  for (const s of starts) if (bounds.length === 0 || s - bounds[bounds.length - 1]! > snap) bounds.push(s);
  const after: string[][] = bounds.map(() => []);
  for (const i of items) after[lastAtOrBefore(bounds, lo(i.box, axis) + snap)]!.push(i.id);
  const ends = items.map((i) => ({ id: i.id, end: lo(i.box, axis) + len(i.box, axis) })).sort((u, v) => u.end - v.end);
  const gaps: Gap[] = [];
  let k = 0;
  for (let n = 1; n < bounds.length; n++) {
    const at = bounds[n]!;
    // The nearest box edge before the gap is the largest end at or before the boundary.
    while (k < ends.length && ends[k]!.end <= at + snap) k++;
    const near = k > 0 ? ends[k - 1]!.end : at;
    const before: string[] = [];
    for (let j = k - 1; j >= 0 && ends[j]!.end >= near - snap; j--) before.push(ends[j]!.id);
    gaps.push({ axis, index: n - 1, at, before: before.reverse(), after: after[n]!, width: Math.max(0, at - near), lanes: 0, need: Math.max(0, at - near) });
  }
  return gaps;
}

/** This function gives the index of the last value of the sorted list `v` that is at or before `x`, or 0. */
function lastAtOrBefore(v: readonly number[], x: number): number {
  let a = 0;
  let b = v.length - 1;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (v[m]! <= x) a = m;
    else b = m - 1;
  }
  return a;
}

/**
 * This function moves the boxes apart, so that each gap gets the width `need`. The boxes keep their size, their order and their alignment.
 * A box moves by the sum of the growth of each gap at or before its left (or top) edge. Thus a grid stays a grid.
 * The function moves no box nearer to another box, so it makes no overlap.
 */
export function openGaps<T extends Boxed>(items: readonly T[], gaps: readonly Gap[], snap: number = DEFAULT_SNAP): T[] {
  const shift = (axis: Axis): ((v: number) => number) => {
    const list = gaps.filter((g) => g.axis === axis).sort((u, v) => u.at - v.at);
    const at = list.map((g) => g.at);
    const sum: number[] = [];
    let s = 0;
    for (const g of list) sum.push((s += Math.max(0, g.need - g.width)));
    return (v) => (list.length === 0 || at[0]! > v + snap ? 0 : sum[lastAtOrBefore(at, v + snap)]!);
  };
  const sx = shift("x");
  const sy = shift("y");
  return items.map((i) => ({ ...i, box: { ...i.box, x: i.box.x + sx(i.box.x), y: i.box.y + sy(i.box.y) } }));
}

/**
 * This function gives the room that the links need in each gap of the board.
 * The lanes of a gap come from the `method` of the options. The need of a gap is `gutter + lanes × spacing`, and not less than its current width.
 */
export function roomDemand(items: readonly Boxed[], links: readonly RoomLink[], options: RoomOptions = {}): Gap[] {
  const gutter = options.gutter ?? DEFAULT_GUTTER;
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const snap = options.snap ?? DEFAULT_SNAP;
  const weight = (l: RoomLink): number => (options.lanes === "count" ? Math.max(1, l.count ?? 1) : 1);
  const gaps = boardGaps(items, snap);
  const lanes = (options.method ?? "routes") === "lines" ? lineLanes(items, links, gaps, weight) : routeLanes(items, links, gaps, gutter, snap, weight, options.router);
  const raw = gaps.map((g, i) => ({ ...g, lanes: lanes[i]!, need: Math.max(g.width, gutter + lanes[i]! * spacing) }));
  return capGrowth(items, raw, gutter, options.maxGrowth ?? Infinity);
}

/** This function gives the demand of the board and the board with each gap open to its need. */
export function makeRoom<T extends Boxed>(items: readonly T[], links: readonly RoomLink[], options: RoomOptions = {}): Room<T> {
  const gaps = roomDemand(items, links, options);
  return { gaps, items: openGaps(items, gaps, options.snap ?? DEFAULT_SNAP) };
}

/** This function gives the links between the nodes of a graph, with the count of the edges of each pair. A loop does not count. */
export function roomLinks(graph: Graph): RoomLink[] {
  const byPair = new Map<string, { source: string; target: string; count: number }>();
  for (const e of graph.edges) {
    const [s, t] = [e.source.node, e.target.node];
    if (s === t) continue;
    const key = s < t ? `${s}\u0000${t}` : `${t}\u0000${s}`;
    const known = byPair.get(key);
    if (known) known.count++;
    else byPair.set(key, { source: s, target: t, count: 1 });
  }
  return [...byPair.values()];
}

/** This function counts, for each gap, the straight lines between the centers of the boxes of a link that cross the gap. */
function lineLanes(items: readonly Boxed[], links: readonly RoomLink[], gaps: readonly Gap[], weight: (l: RoomLink) => number): number[] {
  const byId = new Map(items.map((i) => [i.id, center(i.box)]));
  return gaps.map((g) => {
    let n = 0;
    for (const l of links) {
      const a = byId.get(l.source);
      const b = byId.get(l.target);
      if (a && b && Math.min(a[g.axis], b[g.axis]) < g.at && Math.max(a[g.axis], b[g.axis]) > g.at) n += weight(l);
    }
    return n;
  });
}

/**
 * This function routes the links one time on the board with each gap open to the gutter.
 * The lanes of a gap are the largest number of routes that run along the gap at one place.
 * A piece of a route goes along a gap when it is in the channel of the gap.
 * It must also go farther along the gap than across it.
 */
function routeLanes(
  items: readonly Boxed[],
  links: readonly RoomLink[],
  gaps: readonly Gap[],
  gutter: number,
  snap: number,
  weight: (l: RoomLink) => number,
  router: Router | undefined,
): number[] {
  const probeGaps = gaps.map((g) => ({ ...g, need: Math.max(g.width, gutter) }));
  const probe = openGaps(items, probeGaps, snap);
  const ways = probeWays(probe, links, gutter, router);
  return probeGaps.map((g) => {
    // The channel of the gap on the probe board: its far side moves with the growth of each gap up to this one.
    let grow = 0;
    for (const h of probeGaps) if (h.axis === g.axis && h.at <= g.at + snap) grow += h.need - h.width;
    const hi = g.at + grow;
    const lo = hi - g.need;
    const spans: { from: number; to: number; w: number }[] = [];
    ways.forEach((points, i) => {
      const along = alongSpans(points, g.axis, lo, hi);
      for (const [from, to] of merge(along)) spans.push({ from, to, w: weight(links[i]!) });
    });
    return density(spans);
  });
}

/** This function gives the points of the way of each link on the probe board, in the order of the links. */
function probeWays(items: readonly Boxed[], links: readonly RoomLink[], gutter: number, router: Router | undefined): (readonly Point[])[] {
  if (router) {
    const edges: Edge[] = links.map((l, i) => ({ id: `l${i}`, source: { node: l.source }, target: { node: l.target } }));
    const routes = new Map(router.route({ nodes: items, edges }).routes.map((r) => [r.edge, r.points]));
    return edges.map((e) => routes.get(e.id) ?? []);
  }
  const level = items.map((i) => ({ id: i.id, box: i.box, nodes: [i.id] }));
  const pairs = links.map((l) => ({ source: l.source, target: l.target, count: l.count ?? 1 }));
  // The margin puts the corners of the two sides of a gap on its middle line.
  const out = levelLinks(level, pairs, { margin: Math.max(1, gutter / 2) });
  const byPair = new Map(out.map((l) => [`${l.source}\u0000${l.target}`, l.points]));
  return links.map((l) => byPair.get(`${l.source}\u0000${l.target}`) ?? []);
}

/**
 * This function gives the spans along the axis of a gap where the polyline goes along the channel from `lo` to `hi`.
 * The axis `x` gap is a vertical channel, so its spans are on the y axis.
 */
function alongSpans(p: readonly Point[], axis: Axis, lo: number, hi: number): [number, number][] {
  const across = axis;
  const along = other(axis);
  const out: [number, number][] = [];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const da = b[across] - a[across];
    // The part of the segment inside the channel, as the parameters t0 and t1 of the segment.
    let t0 = 0;
    let t1 = 1;
    if (Math.abs(da) < 1e-9) {
      if (a[across] < lo - 1e-6 || a[across] > hi + 1e-6) continue;
    } else {
      const u = (lo - a[across]) / da;
      const v = (hi - a[across]) / da;
      t0 = Math.max(0, Math.min(u, v));
      t1 = Math.min(1, Math.max(u, v));
      if (t1 <= t0) continue;
    }
    const s = a[along] + (b[along] - a[along]) * t0;
    const e = a[along] + (b[along] - a[along]) * t1;
    const run = Math.abs(e - s);
    const cross = Math.abs(da) * (t1 - t0);
    if (run > cross && run > 1e-6) out.push([Math.min(s, e), Math.max(s, e)]);
  }
  return out;
}

/** This function joins the spans that overlap, so that one link counts one time at each place. */
function merge(spans: [number, number][]): [number, number][] {
  spans.sort((u, v) => u[0] - v[0]);
  const out: [number, number][] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

/** This function gives the largest sum of the weights of the spans that overlap at one place. Spans that only touch do not overlap. */
function density(spans: readonly { from: number; to: number; w: number }[]): number {
  const events: [number, number][] = [];
  for (const s of spans) events.push([s.from, s.w], [s.to, -s.w]);
  // At one coordinate, the ends come before the starts.
  events.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  let n = 0;
  let best = 0;
  for (const [, w] of events) {
    n += w;
    best = Math.max(best, n);
  }
  return best;
}

/**
 * This function keeps the growth of the board on each axis at most `maxGrowth` times its size.
 * Each gap keeps its gutter. The lanes of all gaps of the axis share the rest of the growth in proportion.
 */
function capGrowth(items: readonly Boxed[], gaps: Gap[], gutter: number, maxGrowth: number): Gap[] {
  if (!Number.isFinite(maxGrowth)) return gaps;
  const out = [...gaps];
  for (const axis of ["x", "y"] as const) {
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const i of items) {
      x0 = Math.min(x0, lo(i.box, axis));
      x1 = Math.max(x1, lo(i.box, axis) + len(i.box, axis));
    }
    const budget = Math.max(0, maxGrowth) * Math.max(0, x1 - x0);
    let base = 0;
    let spare = 0;
    for (const g of gaps) {
      if (g.axis !== axis) continue;
      const b = Math.max(0, gutter - g.width);
      base += b;
      spare += Math.max(0, g.need - g.width - b);
    }
    if (base + spare <= budget || spare === 0) continue;
    const f = Math.max(0, (budget - base) / spare);
    gaps.forEach((g, i) => {
      if (g.axis !== axis) return;
      const b = Math.max(0, gutter - g.width);
      out[i] = { ...g, need: g.width + b + f * Math.max(0, g.need - g.width - b) };
    });
  }
  return out;
}
