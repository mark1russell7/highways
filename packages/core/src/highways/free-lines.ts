import { dist, polylineLength, type Point } from "../geom.ts";
import type { Graph } from "../model.ts";
import { boardGaps } from "../room/index.ts";
import type { WayFinder } from "../ways.ts";
import { firstRoutes } from "./base.ts";
import type { HighwayInput } from "./model.ts";
import { edgePlugs } from "./stretches.ts";

/** The source of the candidate streets: the middle lines of the gaps of the room step, or the lines through the corners of the corner graph. */
export type StreetSource = "room" | "corners";

/** The values of `StreetSource`. */
export const STREET_SOURCES: readonly StreetSource[] = Object.freeze(["room", "corners"]);

/** One axis-parallel street in the free space, from `a` to `b`. */
export interface FreeLine {
  readonly a: Point;
  readonly b: Point;
}

/** One edge for the streets: its two points out of its plugs, and the length of its first route. */
export interface StreetEdge {
  readonly edge: string;
  readonly s: Point;
  readonly t: Point;
  readonly base: number;
}

/** The ride of one edge on one street: the points where it joins and leaves the street, the length on the street and the length of the two ramps. */
export interface StreetRide {
  readonly on: Point;
  readonly off: Point;
  readonly ride: number;
  readonly ramps: number;
}

const round = (v: number): number => Math.round(v * 2) / 2;

/**
 * This function gives the free pieces of the line `x = c` (axis `x`) or `y = c` (axis `y`). A box closer than `pad` to the line blocks it.
 * A piece shorter than `min` is not in the list. The pieces run over the board and `2 pad` past it.
 */
function freePieces(finder: WayFinder, axis: "x" | "y", c: number, pad: number, min: number, lo: number, hi: number): FreeLine[] {
  const blocks: [number, number][] = [];
  const strip = axis === "x" ? { x: c - pad, y: lo, w: 2 * pad, h: hi - lo } : { x: lo, y: c - pad, w: hi - lo, h: 2 * pad };
  finder.obstacles.query(strip, (n) => {
    const a = axis === "x" ? n.box.x : n.box.y;
    const w = axis === "x" ? n.box.w : n.box.h;
    if (c <= a - pad || c >= a + w + pad) return;
    const b = axis === "x" ? n.box.y : n.box.x;
    const h = axis === "x" ? n.box.h : n.box.w;
    blocks.push([b - pad, b + h + pad]);
  });
  blocks.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const out: FreeLine[] = [];
  const at = (u: number): Point => (axis === "x" ? { x: c, y: u } : { x: u, y: c });
  let from = lo;
  for (const [s, e] of blocks) {
    if (s - from >= min) out.push({ a: at(from), b: at(s) });
    from = Math.max(from, e);
  }
  if (hi - from >= min) out.push({ a: at(from), b: at(hi) });
  return out;
}

/**
 * This function gives the candidate streets of a board. Each street is an axis-parallel piece of free space.
 * The source `room` takes the middle line of each gap of `boardGaps` that is two margins wide or more.
 * The source `corners` takes the lines one margin out from each side of each box.
 * A street is two margins long or more. The list has no copies, and its order is the same each time.
 */
export function freeLines(graph: Graph, finder: WayFinder, source: StreetSource): FreeLine[] {
  const nodes = graph.nodes;
  if (nodes.length === 0) return [];
  const m = finder.margin;
  const pad = m / 2;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  const lines: { axis: "x" | "y"; c: number }[] = [];
  if (source === "room") {
    for (const g of boardGaps(nodes)) if (g.width >= 2 * m) lines.push({ axis: g.axis, c: round(g.at - g.width / 2) });
  } else {
    for (const n of nodes) {
      lines.push({ axis: "x", c: round(n.box.x - m) }, { axis: "x", c: round(n.box.x + n.box.w + m) });
      lines.push({ axis: "y", c: round(n.box.y - m) }, { axis: "y", c: round(n.box.y + n.box.h + m) });
    }
  }
  const seen = new Set<string>();
  const out: FreeLine[] = [];
  const sorted = [...lines].sort((p, q) => (p.axis === q.axis ? p.c - q.c : p.axis < q.axis ? -1 : 1));
  for (const l of sorted) {
    const k = `${l.axis}${l.c}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const [lo, hi] = l.axis === "x" ? [y0 - 2 * m, y1 + 2 * m] : [x0 - 2 * m, x1 + 2 * m];
    out.push(...freePieces(finder, l.axis, l.c, pad, 2 * m, lo, hi));
  }
  return out;
}

/** This function gives the edges of the input for the streets, with the points out of their plugs and the lengths of their first routes. */
export function streetEdges(input: HighwayInput, finder: WayFinder): StreetEdge[] {
  const first = firstRoutes(input);
  const out: StreetEdge[] = [];
  for (const p of edgePlugs(input.graph)) {
    const route = first.get(p.edge.id);
    const s = finder.out(p.ps);
    const t = finder.out(p.pt);
    out.push({ edge: p.edge.id, s, t, base: route ? polylineLength(route) : dist(s, t) });
  }
  return out;
}

/** This function gives the point of the street nearest to `p`. */
export function streetPoint(line: FreeLine, p: Point): Point {
  if (line.a.x === line.b.x) {
    const lo = Math.min(line.a.y, line.b.y);
    const hi = Math.max(line.a.y, line.b.y);
    return { x: line.a.x, y: Math.min(hi, Math.max(lo, p.y)) };
  }
  const lo = Math.min(line.a.x, line.b.x);
  const hi = Math.max(line.a.x, line.b.x);
  return { x: Math.min(hi, Math.max(lo, p.x)), y: line.a.y };
}

/** This function gives the ride of an edge on a street. The edge joins the street at the point nearest to `s`, and leaves it at the point nearest to `t`. */
export function streetRide(line: FreeLine, e: StreetEdge): StreetRide {
  const on = streetPoint(line, e.s);
  const off = streetPoint(line, e.t);
  return { on, off, ride: dist(on, off), ramps: dist(e.s, on) + dist(off, e.t) };
}
