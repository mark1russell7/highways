/**
 * The highway strategy `manifolds` (WILD-036): a header for a fan from one node to a row of nodes.
 * The header lies in the gap before the row, the taps leave it at right angles, and the feed joins it from the node.
 */
import { center, dist, type Point } from "../../geom.ts";
import { nodeIndex, outerGraph, type Node } from "../../model.ts";
import { basePlan, tidyPlan, type HighwayBase } from "../base.ts";
import { keepMembers } from "../gates/model.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { snapPlan, type SnapLine } from "../snap.ts";

/** The place of the header in the gap before the row: near the row, or near the feed node. */
export type ManifoldSide = "near" | "far";

/** The values of `ManifoldSide`. */
export const MANIFOLD_SIDES: readonly ManifoldSide[] = Object.freeze(["near", "far"]);

/** The options of the highway strategy `manifolds` (WILD-036). */
export interface ManifoldOptions {
  /** A manifold has this number of taps or more, from 3 to 8. The default is 3. */
  readonly kMin: number;
  /** The nodes of one row have centers in a band of this many median box heights, from 0.5 to 2. The default is 1. */
  readonly band: number;
  /** The place of the header in the gap before the row. The default is `near`. */
  readonly side: ManifoldSide;
  /** A tap stays on the manifold only when its way is this many times the direct line or less, from 1 to 3. The default is 1.5. */
  readonly detour: number;
  /** The plan of the edges that are not on a manifold. The default is `shared-ways`. */
  readonly from: HighwayBase;
}

/** The default options of the strategy `manifolds`. */
export const MANIFOLD_DEFAULTS: Readonly<ManifoldOptions> = Object.freeze({ kMin: 3, band: 1, side: "near", detour: 1.5, from: "shared-ways" });

/** One end of a fan: an edge from the feed node to a far node. */
interface Tap {
  readonly edge: string;
  readonly far: Node;
  /** With `true`, the feed node is the source of the edge. */
  readonly out: boolean;
}

/** A manifold that the strategy can make: the feed node, the axis of the header, its place across the axis and its taps. */
interface Candidate {
  readonly feed: Node;
  /** With `x`, the header is horizontal. With `y`, the header is vertical. */
  readonly axis: "x" | "y";
  readonly at: number;
  readonly taps: readonly Tap[];
}

/** This function gives the median of the values, or 0 when there is none. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** This function compares two texts in the order of their code units. */
function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * This function gives the manifolds that the strategy can make from one feed node, for one axis of the header.
 * The far centers go in bands across the axis. A band with `kMin` taps or more, wholly on one side of the feed node, is a candidate.
 */
function candidatesOf(feed: Node, taps: readonly Tap[], axis: "x" | "y", band: number, o: Readonly<ManifoldOptions>, margin: number): Candidate[] {
  const across = axis === "x" ? "y" : "x";
  const size = axis === "x" ? "h" : "w";
  const sorted = [...taps].sort((a, b) => center(a.far.box)[across] - center(b.far.box)[across] || byId(a.edge, b.edge));
  const out: Candidate[] = [];
  const lo = feed.box[across];
  const hi = lo + feed.box[size];
  // The share of the gap from the row to its header: a third with `near`, two thirds with `far`.
  const share = o.side === "near" ? 1 / 3 : 2 / 3;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    const first = center(sorted[i]!.far.box)[across];
    while (j + 1 < sorted.length && center(sorted[j + 1]!.far.box)[across] - first <= band) j++;
    const row = sorted.slice(i, j + 1);
    i = j + 1;
    if (row.length < o.kMin) continue;
    const top = Math.min(...row.map((t) => t.far.box[across]));
    const bottom = Math.max(...row.map((t) => t.far.box[across] + t.far.box[size]));
    if (hi + 2 * margin <= top) out.push({ feed, axis, at: top - share * (top - hi), taps: row });
    else if (bottom + 2 * margin <= lo) out.push({ feed, axis, at: bottom + share * (lo - bottom), taps: row });
  }
  return out;
}

/**
 * This function gives the plan of the highway strategy `manifolds` (WILD-036, after the headers of pipes and of bus bars).
 * A fan of `kMin` edges or more from one node to a row of nodes gets a straight header in the gap before the row.
 * Each edge of the fan joins the header at the feed point, in line with the center of the node. It leaves the header at its tap, in line with the center of its far node.
 * A tap whose way is more than `detour` times the direct line leaves the manifold. Each edge is on one manifold at most. The other edges keep the plan `from`.
 */
export function manifoldPlan(input: HighwayInput, options: Partial<ManifoldOptions> = {}): HighwayPlan {
  const o = { ...MANIFOLD_DEFAULTS, ...options };
  const graph = outerGraph(input.graph);
  const nodes = nodeIndex(graph);
  const margin = 5;
  const bandOf = { x: o.band * median(graph.nodes.map((n) => n.box.h)), y: o.band * median(graph.nodes.map((n) => n.box.w)) };
  const fans = new Map<string, Tap[]>();
  const add = (id: string, tap: Tap): void => {
    const list = fans.get(id);
    if (list) list.push(tap);
    else fans.set(id, [tap]);
  };
  for (const e of graph.edges) {
    const s = nodes.get(e.source.node);
    const t = nodes.get(e.target.node);
    if (!s || !t || s === t) continue;
    add(s.id, { edge: e.id, far: t, out: true });
    add(t.id, { edge: e.id, far: s, out: false });
  }
  const all: Candidate[] = [];
  for (const [id, taps] of fans) {
    if (taps.length < o.kMin) continue;
    const feed = nodes.get(id)!;
    for (const axis of ["x", "y"] as const) all.push(...candidatesOf(feed, taps, axis, bandOf[axis], o, margin));
  }
  // The largest manifolds go first. A tie goes to the node id, then to the axis, so the plan does not depend on the order of the map.
  all.sort((a, b) => b.taps.length - a.taps.length || byId(a.feed.id, b.feed.id) || byId(a.axis, b.axis) || a.at - b.at);
  const used = new Set<string>();
  const lines: SnapLine[] = [];
  for (const c of all) {
    const fc = center(c.feed.box);
    const feedPoint: Point = c.axis === "x" ? { x: fc.x, y: c.at } : { x: c.at, y: fc.y };
    const tapOf = (t: Tap): Point => {
      const tc = center(t.far.box);
      return c.axis === "x" ? { x: tc.x, y: c.at } : { x: c.at, y: tc.y };
    };
    const taps = c.taps.filter((t) => {
      if (used.has(t.edge)) return false;
      const tc = center(t.far.box);
      return dist(fc, feedPoint) + dist(feedPoint, tapOf(t)) + dist(tapOf(t), tc) <= o.detour * dist(fc, tc);
    });
    if (taps.length < o.kMin) continue;
    const along = [feedPoint, ...taps.map(tapOf)].map((p) => p[c.axis]);
    const lo = Math.min(...along);
    const hi = Math.max(...along);
    const a: Point = c.axis === "x" ? { x: lo, y: c.at } : { x: c.at, y: lo };
    const b: Point = c.axis === "x" ? { x: hi, y: c.at } : { x: c.at, y: hi };
    for (const t of taps) used.add(t.edge);
    lines.push({
      key: `manifold:${c.feed.id}:${c.axis}`,
      a,
      b,
      members: taps.map((t) => (t.out ? { edge: t.edge, from: feedPoint, to: tapOf(t), at: 0.5 } : { edge: t.edge, from: tapOf(t), to: feedPoint, at: 0.5 })),
    });
  }
  const manifolds = snapPlan({ graph }, lines, { minSize: Math.max(2, o.kMin), direct: true });
  const riding = new Set(manifolds.highways.flatMap((h) => h.members.map((m) => m.edge)));
  const base = keepMembers(basePlan({ ...input, graph }, o.from), (_, m) => !riding.has(m.edge));
  return tidyPlan({ highways: [...manifolds.highways, ...base.highways] });
}
