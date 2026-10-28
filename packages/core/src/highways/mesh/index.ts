import { dist, type Point } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";
import { tracePlan } from "../trace.ts";

/** The options of the highway strategy `mesh` (HWY-004 of the notes). */
export interface MeshOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The side of a cell of the mesh, in units of the boxes: the median of the smaller side of each box. The default is 4. */
  readonly cell: number;
  /** A cluster of crossings on one segment of the mesh has at most about this number of edges. The default is 8. */
  readonly capacity: number;
  /** Two clusters nearer than this value, in units of the boxes, become one. The default is 1. */
  readonly merge: number;
  /** The largest angle in degrees between a line and the main direction of a cell. A line with a larger angle does not cross the mesh there. The default is 45. */
  readonly angle: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `mesh`. */
export const MESH_DEFAULTS: Readonly<Required<Omit<MeshOptions, "margin" | "k">>> = Object.freeze({
  cell: 4,
  capacity: 8,
  merge: 1,
  angle: 45,
  minSize: 2,
});

/** The number of bins of the histogram of the angles. Each bin is 10 degrees wide. */
const BINS = 18;

/** This function gives the median of the smaller side of each box of the graph, or 1 for a graph without boxes. */
export function boxUnit(graph: Graph): number {
  const sides = graph.nodes.map((n) => Math.min(n.box.w, n.box.h)).sort((a, b) => a - b);
  return sides.length > 0 ? Math.max(1e-3, sides[Math.floor(sides.length / 2)]!) : 1;
}

/** This function gives the shares `t` of the segment `a b` and `u` of the segment `c d` at their crossing. Segments that do not cross give `undefined`. */
function crossing(a: Point, b: Point, c: Point, d: Point): { t: number; u: number } | undefined {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return undefined;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  const eps = 1e-9;
  return t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps ? { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) } : undefined;
}

/** This function gives the clusters of the values by a 1D k-means with `k` centres, then joins the centres nearer than `merge`. The result gives the centre of each value. */
export function clusters1d(values: readonly number[], k: number, merge: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const count = Math.max(1, Math.min(n, k));
  let centres = Array.from({ length: count }, (_, i) => sorted[Math.min(n - 1, Math.floor(((i + 0.5) * n) / count))]!);
  const nearest = (v: number): number => {
    let best = 0;
    for (let i = 1; i < centres.length; i++) if (Math.abs(centres[i]! - v) < Math.abs(centres[best]! - v)) best = i;
    return best;
  };
  for (let it = 0; it < 20; it++) {
    const sum = centres.map(() => 0);
    const num = centres.map(() => 0);
    for (const v of values) {
      const i = nearest(v);
      sum[i] = sum[i]! + v;
      num[i] = num[i]! + 1;
    }
    const next = centres.map((c, i) => (num[i]! > 0 ? sum[i]! / num[i]! : c));
    const moved = next.some((c, i) => Math.abs(c - centres[i]!) > 1e-9);
    centres = next;
    if (!moved) break;
  }
  // The join of the near centres: the weighted mean of each run of centres closer than `merge`.
  const weight = centres.map(() => 0);
  for (const v of values) {
    const i = nearest(v);
    weight[i] = weight[i]! + 1;
  }
  const order = centres
    .map((c, i) => ({ c, w: weight[i]! }))
    .filter((x) => x.w > 0)
    .sort((p, q) => p.c - q.c);
  const joined: { c: number; w: number }[] = [];
  for (const x of order) {
    const last = joined[joined.length - 1];
    if (last && x.c - last.c < merge) {
      const w = last.w + x.w;
      last.c = (last.c * last.w + x.c * x.w) / w;
      last.w = w;
    } else joined.push({ ...x });
  }
  centres = joined.map((x) => x.c);
  return values.map((v) => centres[nearest(v)]!);
}

/** One cell of the mesh: its place in the grid, the histogram of the angles of its lines, and the lines through it. */
interface MeshCell {
  readonly cx: number;
  readonly cy: number;
  readonly bins: number[];
  /** The sum of the angles of the lines in each bin. */
  readonly angles: number[];
  readonly lines: Set<number>;
}

/**
 * This function gives the waypoints of the control mesh (HWY-004, GBEC of Cui, Zhou, Qu, Wong and Li 2008).
 * A grid of cells covers the board. The main direction of each cell is the peak of a histogram of the angles of the straight lines through it.
 * The segment of the mesh in a cell goes through its middle, across that direction. The crossings of the lines with the segment form clusters by a 1D k-means.
 * The centre of the cluster of each crossing is a waypoint of its edge. The waypoints of an edge are in the order of the edge.
 */
export function meshWaypoints(input: HighwayInput, finder: WayFinder, o: Readonly<MeshOptions>): Map<string, Point[]> {
  const plugs = edgePlugs(input.graph);
  const out = new Map<string, Point[]>();
  if (plugs.length === 0) return out;
  const unit = boxUnit(input.graph);
  const side = Math.max(1e-3, o.cell * unit);
  const lines = plugs.map(({ ps, pt }) => ({ a: finder.out(ps), b: finder.out(pt) }));
  let x0 = Infinity;
  let y0 = Infinity;
  for (const l of lines) {
    x0 = Math.min(x0, l.a.x, l.b.x);
    y0 = Math.min(y0, l.a.y, l.b.y);
  }
  const cells = new Map<string, MeshCell>();
  lines.forEach((l, e) => {
    const len = dist(l.a, l.b);
    if (len <= 1e-9) return;
    const ang = ((Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x) % Math.PI) + Math.PI) % Math.PI;
    const bin = Math.min(BINS - 1, Math.floor((ang / Math.PI) * BINS));
    const steps = Math.max(1, Math.ceil((2 * len) / side));
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const cx = Math.floor((l.a.x + (l.b.x - l.a.x) * u - x0) / side);
      const cy = Math.floor((l.a.y + (l.b.y - l.a.y) * u - y0) / side);
      const id = `${cx},${cy}`;
      let cell = cells.get(id);
      if (!cell) {
        cell = { cx, cy, bins: new Array<number>(BINS).fill(0), angles: new Array<number>(BINS).fill(0), lines: new Set() };
        cells.set(id, cell);
      }
      if (!cell.lines.has(e)) {
        cell.lines.add(e);
        cell.bins[bin] = cell.bins[bin]! + 1;
        cell.angles[bin] = cell.angles[bin]! + ang;
      }
    }
  });
  const capacity = Math.max(1, o.capacity);
  const maxAngle = (Math.max(0, Math.min(90, o.angle)) * Math.PI) / 180;
  const marks: { t: number; p: Point }[][] = lines.map(() => []);
  for (const id of [...cells.keys()].sort()) {
    const cell = cells.get(id)!;
    if (cell.lines.size < 2) continue;
    let peak = 0;
    for (let i = 1; i < BINS; i++) if (cell.bins[i]! > cell.bins[peak]!) peak = i;
    // The main direction is the mean angle of the lines in the peak bin.
    const theta = cell.angles[peak]! / cell.bins[peak]!;
    const mid = { x: x0 + (cell.cx + 0.5) * side, y: y0 + (cell.cy + 0.5) * side };
    const across = { x: -Math.sin(theta), y: Math.cos(theta) };
    // The segment goes from side to side of the cell.
    const half = side / 2 / Math.max(Math.abs(across.x), Math.abs(across.y));
    const c = { x: mid.x - across.x * half, y: mid.y - across.y * half };
    const d = { x: mid.x + across.x * half, y: mid.y + across.y * half };
    const hits: { e: number; t: number; u: number }[] = [];
    for (const e of [...cell.lines].sort((p, q) => p - q)) {
      const l = lines[e]!;
      const len = dist(l.a, l.b);
      const cos = Math.abs(((l.b.x - l.a.x) * Math.cos(theta) + (l.b.y - l.a.y) * Math.sin(theta)) / len);
      if (Math.acos(Math.min(1, cos)) > maxAngle + 1e-9) continue;
      const x = crossing(l.a, l.b, c, d);
      if (x) hits.push({ e, t: x.t, u: x.u });
    }
    if (hits.length < 2) continue;
    const centres = clusters1d(
      hits.map((h) => h.u * 2 * half),
      Math.ceil(hits.length / capacity),
      Math.max(0, o.merge) * unit,
    );
    const size = new Map<number, number>();
    for (const v of centres) size.set(v, (size.get(v) ?? 0) + 1);
    hits.forEach((h, i) => {
      const v = centres[i]!;
      if ((size.get(v) ?? 0) < 2) return;
      marks[h.e]!.push({ t: h.t, p: { x: c.x + across.x * v, y: c.y + across.y * v } });
    });
  }
  plugs.forEach(({ edge }, e) => {
    const list = marks[e]!.sort((p, q) => p.t - q.t).map((m) => m.p);
    if (list.length > 0) out.set(edge.id, list);
  });
  return out;
}

/**
 * This function gives the highways of the control mesh (HWY-004). Each edge goes through the centres of its clusters on the mesh, along the corner graph.
 * The centres of one cluster are one point, so the edges of a cluster share the ways between them. The stretches that `minSize` ways share become highways.
 */
export function meshPlan(input: HighwayInput, o: Readonly<MeshOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const waypoints = meshWaypoints(input, finder, o);
  return tracePlan(input, finder, waypoints, { snap: 0, minSize: o.minSize, key: "mesh" });
}
