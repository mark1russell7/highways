/**
 * The highway strategy `currents` (RULE-051): the streamlines of a summed current.
 * Each edge drives one unit of current from its source to its target through a sheet that conducts, and the boxes insulate.
 * The currents of the edges of one direction class add, and the ways of one class follow their current, so they share channels.
 */
import { dist, type Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { pseudoAngle } from "../global-order/index.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The options of the highway strategy `currents` (RULE-051). */
export interface CurrentOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The pull of the current of the class on a way, from 0 to 2. The default is 1. */
  readonly beta: number;
  /** The side of a cell of the sheet, from 2 to 8. A large board gets larger cells, so the sheet has at most `CURRENT_MAX_CELLS` cells on a side. The default is 4. */
  readonly cell: number;
  /** The number of direction classes: 1, 2, 4 or 8. The default is 4. */
  readonly classes: number;
  /** A highway has this number of edges or more, from 2 to 16. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `currents`. */
export const CURRENT_DEFAULTS: Readonly<Required<Omit<CurrentOptions, "margin" | "k">>> = Object.freeze({ beta: 1, cell: 4, classes: 4, minSize: 2 });

/** The largest number of cells on one side of the sheet. */
export const CURRENT_MAX_CELLS = 96;

/** The largest pull of the current on one link, as a multiple of the mean size of the current. */
const MAX_ALIGN = 4;

/** The largest number of steps of the conjugate gradient. */
const CG_STEPS = 400;

/** A sheet of cells over the board. A cell conducts when its center is out of each box. */
export interface Sheet {
  readonly x0: number;
  readonly y0: number;
  readonly size: number;
  readonly w: number;
  readonly h: number;
  /** The value is 1 for a cell that conducts, else 0. */
  readonly free: Uint8Array;
}

/** This function gives the cell of a point, or -1 for a point out of the sheet. */
export function cellOf(s: Sheet, p: Point): number {
  const i = Math.floor((p.x - s.x0) / s.size);
  const j = Math.floor((p.y - s.y0) / s.size);
  if (i < 0 || j < 0 || i >= s.w || j >= s.h) return -1;
  return j * s.w + i;
}

/** This function gives the free cell nearest to a point, by rings of cells around its cell, or -1. */
export function nearestFree(s: Sheet, p: Point): number {
  const i0 = Math.min(s.w - 1, Math.max(0, Math.floor((p.x - s.x0) / s.size)));
  const j0 = Math.min(s.h - 1, Math.max(0, Math.floor((p.y - s.y0) / s.size)));
  for (let r = 0; r < 4; r++) {
    let best = -1;
    let bd = Infinity;
    for (let j = j0 - r; j <= j0 + r; j++) {
      for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= s.w || j >= s.h) continue;
        const c = j * s.w + i;
        if (!s.free[c]) continue;
        const d = Math.hypot(s.x0 + (i + 0.5) * s.size - p.x, s.y0 + (j + 0.5) * s.size - p.y);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** This function gives the connected part of each free cell, by its four neighbours. A cell that does not conduct gets -1. */
export function partsOf(s: Sheet): Int32Array {
  const part = new Int32Array(s.w * s.h).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let c = 0; c < part.length; c++) {
    if (!s.free[c] || part[c]! >= 0) continue;
    part[c] = next;
    stack.push(c);
    while (stack.length > 0) {
      const u = stack.pop()!;
      const i = u % s.w;
      const j = (u - i) / s.w;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= s.w || b >= s.h) continue;
        const v = b * s.w + a;
        if (s.free[v] && part[v]! < 0) {
          part[v] = next;
          stack.push(v);
        }
      }
    }
    next++;
  }
  return part;
}

/**
 * This function solves `(L + 1e-6 I) u = b` on the free cells of the sheet, with the conjugate gradient and the diagonal as preconditioner.
 * `L` is the graph Laplacian of the free cells with their four neighbours. The boxes insulate, so the sheet has no flow across them.
 */
export function solveSheet(s: Sheet, b: Float64Array): Float64Array {
  const n = s.w * s.h;
  const deg = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    if (!s.free[c]) continue;
    const i = c % s.w;
    const j = (c - i) / s.w;
    let d = 0;
    if (i > 0 && s.free[c - 1]) d++;
    if (i < s.w - 1 && s.free[c + 1]) d++;
    if (j > 0 && s.free[c - s.w]) d++;
    if (j < s.h - 1 && s.free[c + s.w]) d++;
    deg[c] = d + 1e-6;
  }
  const apply = (x: Float64Array, out: Float64Array): void => {
    for (let c = 0; c < n; c++) {
      if (!s.free[c]) {
        out[c] = 0;
        continue;
      }
      const i = c % s.w;
      const j = (c - i) / s.w;
      let v = deg[c]! * x[c]!;
      if (i > 0 && s.free[c - 1]) v -= x[c - 1]!;
      if (i < s.w - 1 && s.free[c + 1]) v -= x[c + 1]!;
      if (j > 0 && s.free[c - s.w]) v -= x[c - s.w]!;
      if (j < s.h - 1 && s.free[c + s.w]) v -= x[c + s.w]!;
      out[c] = v;
    }
  };
  const x = new Float64Array(n);
  const r = Float64Array.from(b);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const q = new Float64Array(n);
  let rz = 0;
  let bb = 0;
  for (let c = 0; c < n; c++) {
    if (!s.free[c]) r[c] = 0;
    z[c] = s.free[c] ? r[c]! / deg[c]! : 0;
    p[c] = z[c]!;
    rz += r[c]! * z[c]!;
    bb += r[c]! * r[c]!;
  }
  if (bb === 0) return x;
  for (let step = 0; step < CG_STEPS; step++) {
    apply(p, q);
    let pq = 0;
    for (let c = 0; c < n; c++) pq += p[c]! * q[c]!;
    if (pq <= 0) break;
    const alpha = rz / pq;
    let rr = 0;
    for (let c = 0; c < n; c++) {
      x[c]! += alpha * p[c]!;
      r[c]! -= alpha * q[c]!;
      rr += r[c]! * r[c]!;
    }
    if (rr <= 1e-10 * bb) break;
    let rz2 = 0;
    for (let c = 0; c < n; c++) {
      z[c] = s.free[c] ? r[c]! / deg[c]! : 0;
      rz2 += r[c]! * z[c]!;
    }
    const beta = rz2 / rz;
    rz = rz2;
    for (let c = 0; c < n; c++) p[c] = z[c]! + beta * p[c]!;
  }
  return x;
}

/** This function gives the current `J = -∇u` at each free cell, by the differences to its free neighbours, as pairs of values. */
export function currentOf(s: Sheet, u: Float64Array): Float64Array {
  const J = new Float64Array(2 * s.w * s.h);
  for (let c = 0; c < s.w * s.h; c++) {
    if (!s.free[c]) continue;
    const i = c % s.w;
    const j = (c - i) / s.w;
    const left = i > 0 && s.free[c - 1] ? u[c - 1]! : u[c]!;
    const right = i < s.w - 1 && s.free[c + 1] ? u[c + 1]! : u[c]!;
    const up = j > 0 && s.free[c - s.w] ? u[c - s.w]! : u[c]!;
    const down = j < s.h - 1 && s.free[c + s.w] ? u[c + s.w]! : u[c]!;
    J[2 * c] = -(right - left) / (2 * s.size);
    J[2 * c + 1] = -(down - up) / (2 * s.size);
  }
  return J;
}

/** This function gives the direction class of the vector from `a` to `b`, from 0 to `classes - 1`, by its pseudo-angle. */
export function directionClass(a: Point, b: Point, classes: number): number {
  const k = Math.max(1, Math.floor(classes));
  return Math.min(k - 1, Math.floor((pseudoAngle(b.x - a.x, b.y - a.y) * k) / 4));
}

/**
 * This function gives the highways of the summed currents (RULE-051). One solve for each direction class gives the potential `u` of the sum of its edges.
 * Each edge puts +1 at the free cell of its source and -1 at the free cell of its target. An edge with its two ends in two parts of the sheet does not count.
 * A link from corner `i` to corner `j` costs `d / (1 + beta × min(4, max(0, J · t) / mean |J|))`, with `J` the current of the class at the middle of the link.
 * Each stretch that `minSize` ways of one class or more share is one highway.
 */
export function currentPlan(input: HighwayInput, o: Readonly<CurrentOptions>): HighwayPlan {
  const graph = input.graph;
  if (graph.nodes.length < 2) return { highways: [] };
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const pad = finder.margin;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const nd of graph.nodes) {
    x0 = Math.min(x0, nd.box.x);
    y0 = Math.min(y0, nd.box.y);
    x1 = Math.max(x1, nd.box.x + nd.box.w);
    y1 = Math.max(y1, nd.box.y + nd.box.h);
  }
  x0 -= 4 * pad;
  y0 -= 4 * pad;
  x1 += 4 * pad;
  y1 += 4 * pad;
  const size = Math.max(Math.min(8, Math.max(2, o.cell)), (x1 - x0) / CURRENT_MAX_CELLS, (y1 - y0) / CURRENT_MAX_CELLS);
  const w = Math.max(1, Math.ceil((x1 - x0) / size));
  const h = Math.max(1, Math.ceil((y1 - y0) / size));
  const free = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) free[j * w + i] = finder.obstacles.inside({ x: x0 + (i + 0.5) * size, y: y0 + (j + 0.5) * size }, 0) ? 0 : 1;
  const sheet: Sheet = { x0, y0, size, w, h, free };
  const part = partsOf(sheet);
  const classes = [1, 2, 4, 8].includes(Math.floor(o.classes)) ? Math.floor(o.classes) : 4;
  const edges = edgePlugs(graph)
    .map(({ edge, ps, pt }) => {
      const a = finder.out(ps);
      const b = finder.out(pt);
      return { edge, a, b, cs: nearestFree(sheet, a), ct: nearestFree(sheet, b), cls: directionClass(a, b, classes) };
    })
    .filter((e) => e.cs >= 0 && e.ct >= 0 && e.cs !== e.ct && part[e.cs] === part[e.ct] && !finder.obstacles.clear(e.a, e.b, pad));
  const fields: (Float64Array | undefined)[] = [];
  const means: number[] = [];
  for (let c = 0; c < classes; c++) {
    const b = new Float64Array(w * h);
    let any = false;
    for (const e of edges) {
      if (e.cls !== c) continue;
      b[e.cs]! += 1;
      b[e.ct]! -= 1;
      any = true;
    }
    if (!any) {
      fields.push(undefined);
      means.push(0);
      continue;
    }
    const J = currentOf(sheet, solveSheet(sheet, b));
    let sum = 0;
    let count = 0;
    for (let k = 0; k < w * h; k++) {
      const m = Math.hypot(J[2 * k]!, J[2 * k + 1]!);
      if (m > 0) {
        sum += m;
        count++;
      }
    }
    fields.push(J);
    means.push(count > 0 ? sum / count : 0);
  }
  const beta = Math.max(0, o.beta);
  const floor = 1 / (1 + beta * MAX_ALIGN);
  const ways: KeyedWay[] = [];
  for (const e of edges) {
    const J = fields[e.cls];
    const mean = means[e.cls]!;
    const cost =
      J === undefined || mean <= 0 || beta === 0
        ? undefined
        : (i: number, j: number, d: number): number => {
            if (d <= 0) return 0;
            const p = corners.points[i]!;
            const q = corners.points[j]!;
            const k = cellOf(sheet, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
            if (k < 0) return d;
            const along = (J[2 * k]! * (q.x - p.x) + J[2 * k + 1]! * (q.y - p.y)) / d;
            return d / (1 + beta * Math.min(MAX_ALIGN, Math.max(0, along) / mean));
          };
    const way = corners.path(e.a, e.b, cost, cost === undefined ? 1 : floor);
    if (way && dist(e.a, e.b) > 0) ways.push({ edge: e.edge.id, key: `class-${e.cls}`, points: way });
  }
  return sharedStretches(ways, { minSize: Math.max(2, Math.floor(o.minSize)), pull: (p) => corners.pull(p) });
}
