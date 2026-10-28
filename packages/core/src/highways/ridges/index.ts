import { dist, type Point } from "../../geom.ts";
import type { WayOptions } from "../../ways.ts";
import { firstRoutes } from "../base.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { snapPlan, type SnapLine, type SnapMember } from "../snap.ts";
import { edgePlugs } from "../stretches.ts";

/** The lines that make the density: the straight lines of the edges, or their first routes. */
export type RidgeSource = "lines" | "routes";

/** The options of the highway strategy `ridges` (HWY-032 of the note on highways). */
export interface RidgeOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The lines of the density. The default is `lines`. */
  readonly source: RidgeSource;
  /** The side of a cell of the density image, in units of the board. The default is 8. A large board gets larger cells, up to 1024 cells on a side. */
  readonly cell: number;
  /** The width of the blur, in units of the board. The default is 16. */
  readonly bandwidth: number;
  /** A ridge cell has this share of the largest strength or more. The default is 0.15. */
  readonly strength: number;
  /** A ridge has this length or more, in units of the board. The default is 60. */
  readonly minLength: number;
  /** An edge snaps to a ridge when its line is this near to the ridge, in units of the board. The default is 16. */
  readonly snap: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `ridges`. */
export const RIDGE_DEFAULTS: Readonly<Required<Omit<RidgeOptions, "margin" | "k">>> = Object.freeze({ source: "lines", cell: 8, bandwidth: 16, strength: 0.15, minLength: 60, snap: 16, minSize: 2 });

/** The largest angle between an edge and a ridge that it snaps to, in degrees. */
const MAX_ANGLE = 30;

/** The density image: the cells, its size, and the place of its first cell. */
export interface DensityImage {
  readonly w: number;
  readonly h: number;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly rho: Float64Array;
}

/**
 * This function gives the density of the polylines on a grid of cells, after a Gaussian blur of the width `bandwidth`.
 * Each polyline adds 1 to each cell that it goes through, one time for each polyline.
 */
export function lineDensity(lines: readonly (readonly Point[])[], box: { x: number; y: number; w: number; h: number }, cellSize: number, bandwidth: number): DensityImage {
  const cell = Math.max(cellSize, box.w / 1024, box.h / 1024, 1e-6);
  const pad = 3 * bandwidth;
  const x0 = box.x - pad;
  const y0 = box.y - pad;
  const w = Math.max(1, Math.ceil((box.w + 2 * pad) / cell));
  const h = Math.max(1, Math.ceil((box.h + 2 * pad) / cell));
  const raw = new Float64Array(w * h);
  const stamp = new Int32Array(w * h).fill(-1);
  lines.forEach((p, li) => {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      const steps = Math.max(1, Math.ceil((2 * dist(a, b)) / cell));
      for (let k = 0; k <= steps; k++) {
        const x = Math.floor((a.x + ((b.x - a.x) * k) / steps - x0) / cell);
        const y = Math.floor((a.y + ((b.y - a.y) * k) / steps - y0) / cell);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const c = y * w + x;
        if (stamp[c] === li) continue;
        stamp[c] = li;
        raw[c] = raw[c]! + 1;
      }
    }
  });
  // A blur with a Gaussian kernel, first along x, then along y.
  const sigma = Math.max(1e-6, bandwidth / cell);
  const r = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = kernel.reduce((s, v) => s + v, 0);
  const tmp = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) {
        const xi = x + i;
        if (xi >= 0 && xi < w) v += raw[y * w + xi]! * kernel[i + r]!;
      }
      tmp[y * w + x] = v / sum;
    }
  const rho = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) {
        const yi = y + i;
        if (yi >= 0 && yi < h) v += tmp[yi * w + x]! * kernel[i + r]!;
      }
      rho[y * w + x] = v / sum;
    }
  return { w, h, cell, x0, y0, rho };
}

/** One ridge: its two ends and the length between them. */
export interface Ridge {
  readonly a: Point;
  readonly b: Point;
}

/**
 * This function gives the ridges of a density image (Lindeberg 1998). A ridge cell has a negative eigenvalue of the Hessian with the larger size.
 * Its density is a maximum along the eigenvector of that eigenvalue. Its strength is the density times the size of that eigenvalue.
 * The cells with `strength` times the largest strength or more join their neighbours with a direction within 30 degrees.
 * Each group of cells gives the segment of its main axis. A segment of `minLength` or more is a ridge. The ridges come in the order of their total strength.
 */
export function densityRidges(img: DensityImage, strength: number, minLength: number): Ridge[] {
  const { w, h, rho } = img;
  const at = (x: number, y: number): number => rho[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  const power = new Float64Array(w * h);
  const across = new Float64Array(w * h * 2);
  let top = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const v = at(x, y);
      if (v <= 0) continue;
      const hxx = at(x + 1, y) - 2 * v + at(x - 1, y);
      const hyy = at(x, y + 1) - 2 * v + at(x, y - 1);
      const hxy = (at(x + 1, y + 1) - at(x + 1, y - 1) - at(x - 1, y + 1) + at(x - 1, y - 1)) / 4;
      const mean = (hxx + hyy) / 2;
      const root = Math.sqrt(((hxx - hyy) / 2) ** 2 + hxy * hxy);
      const l1 = mean - root;
      const l2 = mean + root;
      if (!(l1 < 0 && Math.abs(l1) > Math.abs(l2))) continue;
      // The eigenvector of `l1` points across the ridge.
      let vx = hxy;
      let vy = l1 - hxx;
      if (Math.abs(vx) + Math.abs(vy) < 1e-12) [vx, vy] = hxx <= hyy ? [1, 0] : [0, 1];
      const n = Math.hypot(vx, vy);
      vx /= n;
      vy /= n;
      const side = (s: number): number => {
        const px = x + s * vx;
        const py = y + s * vy;
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        const fx = px - ix;
        const fy = py - iy;
        return at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
      };
      if (v < side(1) || v < side(-1)) continue;
      const s = v * -l1;
      power[y * w + x] = s;
      across[2 * (y * w + x)] = vx;
      across[2 * (y * w + x) + 1] = vy;
      top = Math.max(top, s);
    }
  if (top <= 0) return [];
  const floor = strength * top;
  const seen = new Uint8Array(w * h);
  const cos = Math.cos((MAX_ANGLE * Math.PI) / 180);
  const out: { ridge: Ridge; total: number }[] = [];
  for (let c = 0; c < w * h; c++) {
    if (seen[c] || power[c]! < floor || power[c]! <= 0) continue;
    const cells: number[] = [];
    const stack = [c];
    seen[c] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      cells.push(i);
      const x = i % w;
      const y = Math.floor(i / w);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xj = x + dx;
          const yj = y + dy;
          if ((dx === 0 && dy === 0) || xj < 0 || yj < 0 || xj >= w || yj >= h) continue;
          const j = yj * w + xj;
          if (seen[j] || power[j]! < floor || power[j]! <= 0) continue;
          if (Math.abs(across[2 * i]! * across[2 * j]! + across[2 * i + 1]! * across[2 * j + 1]!) < cos) continue;
          seen[j] = 1;
          stack.push(j);
        }
    }
    // The main axis of the cells, weighted by their strength.
    let sw = 0;
    let mx = 0;
    let my = 0;
    for (const i of cells) {
      const p = power[i]!;
      sw += p;
      mx += p * (i % w);
      my += p * Math.floor(i / w);
    }
    mx /= sw;
    my /= sw;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const i of cells) {
      const p = power[i]!;
      const dx = (i % w) - mx;
      const dy = Math.floor(i / w) - my;
      sxx += p * dx * dx;
      syy += p * dy * dy;
      sxy += p * dx * dy;
    }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    let lo = Infinity;
    let hi = -Infinity;
    for (const i of cells) {
      const u = ((i % w) - mx) * ux + (Math.floor(i / w) - my) * uy;
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
    }
    const toBoard = (u: number): Point => ({ x: img.x0 + (mx + u * ux + 0.5) * img.cell, y: img.y0 + (my + u * uy + 0.5) * img.cell });
    const ridge = { a: toBoard(lo), b: toBoard(hi) };
    if (dist(ridge.a, ridge.b) >= minLength) out.push({ ridge, total: sw });
  }
  out.sort((p, q) => q.total - p.total || p.ridge.a.x - q.ridge.a.x || p.ridge.a.y - q.ridge.a.y);
  return out.map((x) => x.ridge);
}

/**
 * This function gives the part of the segment `s` to `t` that is within `snap` of the ridge, between the two ends of the ridge.
 * The part is two shares of the segment, from 0 at `s` to 1 at `t`. It gives `undefined` when the segment has no such part.
 */
export function nearPart(s: Point, t: Point, r: Ridge, snap: number): [number, number] | undefined {
  const len = dist(r.a, r.b);
  if (len <= 1e-9) return undefined;
  const ux = (r.b.x - r.a.x) / len;
  const uy = (r.b.y - r.a.y) / len;
  // The place along the ridge and the offset from it are linear in the share `q` of the segment.
  const u0 = (s.x - r.a.x) * ux + (s.y - r.a.y) * uy;
  const u1 = (t.x - r.a.x) * ux + (t.y - r.a.y) * uy;
  const d0 = -(s.x - r.a.x) * uy + (s.y - r.a.y) * ux;
  const d1 = -(t.x - r.a.x) * uy + (t.y - r.a.y) * ux;
  let lo = 0;
  let hi = 1;
  const clip = (v0: number, v1: number, min: number, max: number): void => {
    // The shares where `v0 + q (v1 - v0)` is from `min` to `max`.
    const dv = v1 - v0;
    if (Math.abs(dv) < 1e-12) {
      if (v0 < min || v0 > max) hi = -1;
      return;
    }
    const qa = (min - v0) / dv;
    const qb = (max - v0) / dv;
    lo = Math.max(lo, Math.min(qa, qb));
    hi = Math.min(hi, Math.max(qa, qb));
  };
  clip(u0, u1, 0, len);
  clip(d0, d1, -snap, snap);
  return hi > lo ? [lo, hi] : undefined;
}

/**
 * This function gives the lines of the ridges (HWY-032), each with the edges that snap to it.
 * An edge snaps to a ridge when the part of its line near the ridge is half of `minLength` or longer, and the angle to the ridge is 30 degrees or less.
 * The edge joins and leaves the ridge at the ends of that part. When two ridges hold one part of an edge, only the longer part rides.
 */
export function ridgeLines(input: HighwayInput, o: Readonly<RidgeOptions>): SnapLine[] {
  const plugs = edgePlugs(input.graph);
  const routes = o.source === "routes" ? firstRoutes(input) : undefined;
  const lines = plugs.map(({ edge, ps, pt }) => routes?.get(edge.id) ?? [ps.point, pt.point]);
  if (input.graph.nodes.length === 0 || lines.length === 0) return [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of input.graph.nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  const img = lineDensity(lines, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, o.cell, o.bandwidth);
  const ridges = densityRidges(img, o.strength, o.minLength);
  const cos = Math.cos((MAX_ANGLE * Math.PI) / 180);
  // The parts of each edge near each ridge.
  const parts = new Map<string, { r: number; lo: number; hi: number; long: number }[]>();
  ridges.forEach((r, ri) => {
    const rl = dist(r.a, r.b);
    for (const { edge, ps, pt } of plugs) {
      const s = ps.point;
      const t = pt.point;
      const el = dist(s, t);
      if (el <= 1e-9) continue;
      if (Math.abs(((t.x - s.x) * (r.b.x - r.a.x) + (t.y - s.y) * (r.b.y - r.a.y)) / (el * rl)) < cos) continue;
      const near = nearPart(s, t, r, o.snap);
      if (!near) continue;
      const long = (near[1] - near[0]) * el;
      if (long < o.minLength / 2) continue;
      const list = parts.get(edge.id) ?? [];
      list.push({ r: ri, lo: near[0], hi: near[1], long });
      parts.set(edge.id, list);
    }
  });
  const members = ridges.map((): SnapMember[] => []);
  for (const { edge, ps, pt } of plugs) {
    const list = (parts.get(edge.id) ?? []).sort((p, q) => q.long - p.long || p.r - q.r);
    const kept: typeof list = [];
    for (const p of list) if (!kept.some((k) => p.lo < k.hi && k.lo < p.hi)) kept.push(p);
    for (const p of kept) {
      const r = ridges[p.r]!;
      const s = ps.point;
      const t = pt.point;
      const onRidge = (q: number): Point => {
        const x = s.x + (t.x - s.x) * q;
        const y = s.y + (t.y - s.y) * q;
        const len = dist(r.a, r.b);
        const u = ((x - r.a.x) * (r.b.x - r.a.x) + (y - r.a.y) * (r.b.y - r.a.y)) / (len * len);
        return { x: r.a.x + (r.b.x - r.a.x) * u, y: r.a.y + (r.b.y - r.a.y) * u };
      };
      members[p.r]!.push({ edge: edge.id, from: onRidge(p.lo), to: onRidge(p.hi), at: p.lo });
    }
  }
  return ridges.map((r, ri) => ({ key: `r${ri}`, a: r.a, b: r.b, members: members[ri]! }));
}

/**
 * This function gives the highways of the ridges of the line density (HWY-032). One pass draws the density, with no advection.
 * The ridges of the density are the spines, and the edges near a ridge snap to it between their nearest entry and exit points.
 */
export function ridgePlan(input: HighwayInput, o: Readonly<RidgeOptions>): HighwayPlan {
  const way = { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) };
  return snapPlan(input, ridgeLines(input, o), { ...way, minSize: o.minSize });
}
