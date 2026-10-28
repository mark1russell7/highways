import { dist, type Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { firstRoutes } from "../base.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { resample } from "../quickbundles/index.ts";
import { edgePlugs } from "../stretches.ts";
import { outOfBoxes, tracePlan } from "../trace.ts";

/**
 * The way to compute the density from the sample points. `direct` adds a Gaussian at each sample point (KDEEB).
 * `separable` counts the points in the cells and blurs the counts along x, then along y (CUBu). `fft` blurs the counts with a product of Fourier transforms (FFTEB).
 */
export type DensityKernel = "direct" | "separable" | "fft";

/** The values of `DensityKernel`. */
export const DENSITY_KERNELS: readonly DensityKernel[] = Object.freeze(["direct", "separable", "fft"]);

/** The lines that make the first density: the straight lines of the edges, or their first routes. */
export type DensitySource = "lines" | "routes";

/** The options of the highway strategy `kdeeb` (RULE-028 with HWY-006 of the notes). */
export interface KdeebOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The lines of the first density. The default is `lines`. */
  readonly source: DensitySource;
  /** The side of a cell of the density image, in units of the board. The default is 8. A large board gets larger cells, up to 512 cells on a side. */
  readonly cell: number;
  /** The width of the kernel at the first step, in units of the board. The default is 24. */
  readonly bandwidth: number;
  /** Each step multiplies the width of the kernel by this value. The default is 0.7. */
  readonly decay: number;
  /** The number of steps. The default is 10. */
  readonly steps: number;
  /** The share of the Laplacian smoothing of each polyline after each step, from 0 to 1. The default is 0.5. */
  readonly smoothing: number;
  /** With this option, the density is 0 in the boxes, so no ridge forms over a box (RULE-028). The default is `true`. */
  readonly mask: boolean;
  /** The side of the grid that the points of the edges snap to after the steps, in units of the board. The default is 8. */
  readonly snap: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `kdeeb`. */
export const KDEEB_DEFAULTS: Readonly<Required<Omit<KdeebOptions, "margin" | "k">>> = Object.freeze({
  source: "lines",
  cell: 8,
  bandwidth: 24,
  decay: 0.7,
  steps: 10,
  smoothing: 0.5,
  mask: true,
  snap: 8,
  minSize: 2,
});

/** The settings of the advection that the strategies `kdeeb` and `cubu` share. */
export interface AdvectionSettings {
  /** The way to compute the density. */
  readonly kernel: DensityKernel;
  /** The spacing of the sample points after each step, in units of the board. The value 0 keeps the points where they are. */
  readonly resample: number;
}

/** A grid of cells over the board: its size, the side of a cell, and the place of its first cell. */
export interface DensityGrid {
  readonly w: number;
  readonly h: number;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
}

/** This function gives a Gaussian kernel of the deviation `sigma` cells, from `-r` to `r` with `r = ceil(3 sigma)`, with a sum of 1. */
function kernel1d(sigma: number): Float64Array {
  const s = Math.max(1e-6, sigma);
  const r = Math.ceil(3 * s);
  const k = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * s * s));
  for (let i = 0; i < k.length; i++) k[i] = k[i]! / sum;
  return k;
}

/** This function counts the points in the cells of the grid. A point adds 1 to the cell that holds it. */
function splat(points: readonly Point[], g: DensityGrid): Float64Array {
  const raw = new Float64Array(g.w * g.h);
  for (const p of points) {
    const x = Math.floor((p.x - g.x0) / g.cell);
    const y = Math.floor((p.y - g.y0) / g.cell);
    if (x >= 0 && y >= 0 && x < g.w && y < g.h) raw[y * g.w + x] = raw[y * g.w + x]! + 1;
  }
  return raw;
}

/** This function gives the density of the direct kernel: each point adds a Gaussian of the deviation `sigma` cells to the cells near it. */
function directDensity(points: readonly Point[], g: DensityGrid, sigma: number): Float64Array {
  const rho = new Float64Array(g.w * g.h);
  const s = Math.max(1e-6, sigma);
  const r = Math.ceil(3 * s);
  const norm = 1 / (2 * Math.PI * s * s);
  for (const p of points) {
    const cx = (p.x - g.x0) / g.cell - 0.5;
    const cy = (p.y - g.y0) / g.cell - 0.5;
    const ix = Math.round(cx);
    const iy = Math.round(cy);
    for (let y = Math.max(0, iy - r); y <= Math.min(g.h - 1, iy + r); y++)
      for (let x = Math.max(0, ix - r); x <= Math.min(g.w - 1, ix + r); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        rho[y * g.w + x] = rho[y * g.w + x]! + norm * Math.exp(-d2 / (2 * s * s));
      }
  }
  return rho;
}

/** This function gives the density of the separable kernel: the counts of the cells blurred along x, then along y. */
function separableDensity(points: readonly Point[], g: DensityGrid, sigma: number): Float64Array {
  const raw = splat(points, g);
  const k = kernel1d(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float64Array(g.w * g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) {
        const xi = x + i;
        if (xi >= 0 && xi < g.w) v += raw[y * g.w + xi]! * k[i + r]!;
      }
      tmp[y * g.w + x] = v;
    }
  const rho = new Float64Array(g.w * g.h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) {
        const yi = y + i;
        if (yi >= 0 && yi < g.h) v += tmp[yi * g.w + x]! * k[i + r]!;
      }
      rho[y * g.w + x] = v;
    }
  return rho;
}

/** This function gives the fast Fourier transform of a row of `n` complex values in place, with `n` a power of 2. `inverse` gives the inverse without the division by `n`. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k]!;
        const ai = im[i + k]!;
        const br = re[i + k + len / 2]! * cr - im[i + k + len / 2]! * ci;
        const bi = re[i + k + len / 2]! * ci + im[i + k + len / 2]! * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** This function gives the 2D transform of a grid of `W` by `H` complex values in place. It transforms each row, then each column. */
function fft2(re: Float64Array, im: Float64Array, W: number, H: number, inverse: boolean): void {
  const rr = new Float64Array(W);
  const ri = new Float64Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      rr[x] = re[y * W + x]!;
      ri[x] = im[y * W + x]!;
    }
    fft(rr, ri, inverse);
    for (let x = 0; x < W; x++) {
      re[y * W + x] = rr[x]!;
      im[y * W + x] = ri[x]!;
    }
  }
  const cr = new Float64Array(H);
  const ci = new Float64Array(H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      cr[y] = re[y * W + x]!;
      ci[y] = im[y * W + x]!;
    }
    fft(cr, ci, inverse);
    for (let y = 0; y < H; y++) {
      re[y * W + x] = cr[y]!;
      im[y * W + x] = ci[y]!;
    }
  }
}

/** This function gives the smallest power of 2 that is `n` or more. */
const pow2 = (n: number): number => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/**
 * This function gives the density of the kernel `fft`: `rho = IFFT(FFT(counts) FFT(K))` (FFTEB). The grid gets zeros up to a power of 2.
 * The zeros are as wide as the kernel, so the product does not wrap around.
 */
function fftDensity(points: readonly Point[], g: DensityGrid, sigma: number): Float64Array {
  const raw = splat(points, g);
  const r = Math.ceil(3 * Math.max(1e-6, sigma));
  const W = pow2(g.w + r);
  const H = pow2(g.h + r);
  const are = new Float64Array(W * H);
  const aim = new Float64Array(W * H);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) are[y * W + x] = raw[y * g.w + x]!;
  const k = kernel1d(sigma);
  const kre = new Float64Array(W * H);
  const kim = new Float64Array(W * H);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) kre[((dy + H) % H) * W + ((dx + W) % W)] = k[dx + r]! * k[dy + r]!;
  fft2(are, aim, W, H, false);
  fft2(kre, kim, W, H, false);
  for (let i = 0; i < W * H; i++) {
    const a = are[i]!;
    const b = aim[i]!;
    are[i] = a * kre[i]! - b * kim[i]!;
    aim[i] = a * kim[i]! + b * kre[i]!;
  }
  fft2(are, aim, W, H, true);
  const rho = new Float64Array(g.w * g.h);
  const scale = 1 / (W * H);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) rho[y * g.w + x] = Math.max(0, are[y * W + x]! * scale);
  return rho;
}

/** This function gives the density of the points on the grid with the kernel `kernel` of the width `bandwidth` in units of the board. */
export function pointDensity(points: readonly Point[], g: DensityGrid, bandwidth: number, kernel: DensityKernel): Float64Array {
  const sigma = bandwidth / g.cell;
  if (kernel === "direct") return directDensity(points, g, sigma);
  if (kernel === "fft") return fftDensity(points, g, sigma);
  return separableDensity(points, g, sigma);
}

/** This function gives the value of a grid at a point of the board, with a bilinear mix of the four nearest cells. */
function sample(rho: Float64Array, g: DensityGrid, p: Point): number {
  const fx = (p.x - g.x0) / g.cell - 0.5;
  const fy = (p.y - g.y0) / g.cell - 0.5;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  const u = fx - x;
  const v = fy - y;
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= g.w || j >= g.h ? 0 : rho[j * g.w + i]!);
  return at(x, y) * (1 - u) * (1 - v) + at(x + 1, y) * u * (1 - v) + at(x, y + 1) * (1 - u) * v + at(x + 1, y + 1) * u * v;
}

/**
 * This function gives the polylines of the density bundling (KDEEB, Hurter, Ersoy and Telea 2012). The ends of each polyline stay.
 * In each step, the sample points of all edges make a density. Each inner point moves `h / 4` up the gradient of the density, with `h` the width of the kernel.
 * The width then shrinks by `decay`, so the edges gather into ridges. A Laplacian smoothing keeps each polyline smooth.
 * With `mask`, the density is 0 in the boxes (RULE-028), and a point in a box moves out of it.
 */
export function kdeebLines(input: HighwayInput, finder: WayFinder, o: Readonly<KdeebOptions>, settings: Readonly<AdvectionSettings>): Map<string, Point[]> {
  const plugs = edgePlugs(input.graph);
  const out = new Map<string, Point[]>();
  if (plugs.length === 0) return out;
  const routes = o.source === "routes" ? firstRoutes(input) : undefined;
  const spacing = Math.max(1e-3, o.cell);
  let lines: Point[][] = plugs.map(({ edge, ps, pt }) => {
    const a = finder.out(ps);
    const b = finder.out(pt);
    const route = routes?.get(edge.id);
    const base = route && route.length > 2 ? [a, ...route.slice(1, -1), b] : [a, b];
    let len = 0;
    for (let i = 1; i < base.length; i++) len += dist(base[i - 1]!, base[i]!);
    return resample(base, Math.max(2, Math.min(129, Math.ceil(len / spacing) + 1)));
  });
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
  const pad = 3 * Math.max(0, o.bandwidth);
  const cell = Math.max(spacing, (x1 - x0 + 2 * pad) / 512, (y1 - y0 + 2 * pad) / 512);
  const g: DensityGrid = { cell, x0: x0 - pad, y0: y0 - pad, w: Math.max(1, Math.ceil((x1 - x0 + 2 * pad) / cell)), h: Math.max(1, Math.ceil((y1 - y0 + 2 * pad) / cell)) };
  const boxPad = finder.margin / 2;
  // The mask: the cells whose middle is in a box get no density.
  const masked = new Uint8Array(g.w * g.h);
  if (o.mask)
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) if (finder.obstacles.inside({ x: g.x0 + (x + 0.5) * cell, y: g.y0 + (y + 0.5) * cell }, boxPad)) masked[y * g.w + x] = 1;
  const smooth = Math.max(0, Math.min(1, o.smoothing));
  let h = Math.max(1e-3, o.bandwidth);
  for (let step = 0; step < Math.max(0, Math.round(o.steps)); step++) {
    const points = lines.flatMap((l) => l.slice(1, -1));
    const rho = pointDensity(points, g, h, settings.kernel);
    if (o.mask) for (let i = 0; i < rho.length; i++) if (masked[i]) rho[i] = 0;
    const eta = h / 4;
    const d = cell;
    lines = lines.map((l) => {
      const moved = l.map((p, i) => {
        if (i === 0 || i === l.length - 1) return p;
        const gx = sample(rho, g, { x: p.x + d, y: p.y }) - sample(rho, g, { x: p.x - d, y: p.y });
        const gy = sample(rho, g, { x: p.x, y: p.y + d }) - sample(rho, g, { x: p.x, y: p.y - d });
        const n = Math.hypot(gx, gy);
        return n > 1e-12 ? { x: p.x + (eta * gx) / n, y: p.y + (eta * gy) / n } : p;
      });
      const smoothed = moved.map((p, i) => {
        if (i === 0 || i === moved.length - 1 || smooth === 0) return p;
        const a = moved[i - 1]!;
        const b = moved[i + 1]!;
        return { x: (1 - smooth) * p.x + (smooth * (a.x + b.x)) / 2, y: (1 - smooth) * p.y + (smooth * (a.y + b.y)) / 2 };
      });
      const free = o.mask ? smoothed.map((p, i) => (i === 0 || i === smoothed.length - 1 ? p : outOfBoxes(finder.obstacles, p, boxPad))) : smoothed;
      if (settings.resample <= 0) return free;
      let len = 0;
      for (let i = 1; i < free.length; i++) len += dist(free[i - 1]!, free[i]!);
      return resample(free, Math.max(2, Math.min(129, Math.ceil(len / settings.resample) + 1)));
    });
    h *= Math.max(0, o.decay);
  }
  plugs.forEach(({ edge }, e) => out.set(edge.id, lines[e]!));
  return out;
}

/** This function gives the highways of the bundled polylines of `kdeebLines`. The points snap to a grid of side `snap`, and the ways go through the corner graph. */
export function densityPlan(input: HighwayInput, o: Readonly<KdeebOptions>, settings: Readonly<AdvectionSettings>, key: string): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const lines = kdeebLines(input, finder, o, settings);
  const waypoints = new Map([...lines].map(([edge, l]) => [edge, l.slice(1, -1)] as const));
  return tracePlan(input, finder, waypoints, { snap: o.snap, minSize: o.minSize, key });
}

/**
 * This function gives the highways of the density bundling with a mask of the free space (RULE-028 with HWY-006).
 * The kernel is direct: each sample point adds a Gaussian. The final ridges of the polylines become the highways.
 */
export function kdeebPlan(input: HighwayInput, o: Readonly<KdeebOptions>): HighwayPlan {
  return densityPlan(input, o, { kernel: "direct", resample: 0 }, "kdeeb");
}
