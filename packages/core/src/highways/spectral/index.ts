import type { Point } from "../../geom.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import { compatibility } from "../hdbscan/index.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `spectral` (HWY-029 of the note on highways). */
export interface SpectralOptions {
  /** Two edges are a pair of the graph only when their compatibility is this value or more. The default is 0.5. */
  readonly c0: number;
  /** The number of clusters of each part of the graph. The value 0 lets the largest eigengap choose it. The default is 0. */
  readonly clusters: number;
  /** The eigengap chooses at most this number of clusters in each part of the graph. The default is 16. */
  readonly kMax: number;
  /** A cluster with this number of edges or more gets highways. The default is 2. */
  readonly minSize: number;
  /** The spine of each cluster. The default is `trunk`: one trunk from one area to the other area. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `spectral`. */
export const SPECTRAL_DEFAULTS: Readonly<SpectralOptions> = Object.freeze({ c0: 0.5, clusters: 0, kMax: 16, minSize: 2, spine: "trunk" });

/** The largest number of edges in one part of the graph. A larger part splits into blocks of edges in the order of their sources. */
const BLOCK = 400;

/** The ends of one edge of the board. */
export interface EdgeEnds {
  readonly edge: string;
  readonly s: Point;
  readonly t: Point;
}

/** This function gives the ends of each edge of the input: the points of its two plugs. */
export function edgeEnds(input: HighwayInput): EdgeEnds[] {
  return edgePlugs(input.graph).map(({ edge, ps, pt }) => ({ edge: edge.id, s: ps.point, t: pt.point }));
}

/**
 * This function gives the eigenvalues and the eigenvectors of a symmetric matrix of `n` rows (the Householder steps and the QL steps of JAMA).
 * The values are in increasing order. The column `j` of `vectors` (the values `vectors[i * n + j]`) is the unit vector of the value `j`.
 */
export function symmetricEigen(n: number, a: Float64Array): { values: Float64Array; vectors: Float64Array } {
  const V = Float64Array.from(a);
  const d = new Float64Array(n);
  const e = new Float64Array(n);
  if (n === 0) return { values: d, vectors: V };
  if (n === 1) return { values: Float64Array.of(a[0]!), vectors: Float64Array.of(1) };
  const at = (i: number, j: number): number => V[i * n + j]!;
  const set = (i: number, j: number, v: number): void => {
    V[i * n + j] = v;
  };
  // The reduction to a tridiagonal matrix.
  for (let j = 0; j < n; j++) d[j] = at(n - 1, j);
  for (let i = n - 1; i > 0; i--) {
    let scale = 0;
    let h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]!);
    if (scale === 0) {
      e[i] = d[i - 1]!;
      for (let j = 0; j < i; j++) {
        d[j] = at(i - 1, j);
        set(i, j, 0);
        set(j, i, 0);
      }
    } else {
      for (let k = 0; k < i; k++) {
        d[k] = d[k]! / scale;
        h += d[k]! * d[k]!;
      }
      let f = d[i - 1]!;
      let g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g;
      h -= f * g;
      d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j]!;
        set(j, i, f);
        g = e[j]! + at(j, j) * f;
        for (let k = j + 1; k <= i - 1; k++) {
          g += at(k, j) * d[k]!;
          e[k] = e[k]! + at(k, j) * f;
        }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) {
        e[j] = e[j]! / h;
        f += e[j]! * d[j]!;
      }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] = e[j]! - hh * d[j]!;
      for (let j = 0; j < i; j++) {
        f = d[j]!;
        g = e[j]!;
        for (let k = j; k <= i - 1; k++) set(k, j, at(k, j) - (f * e[k]! + g * d[k]!));
        d[j] = at(i - 1, j);
        set(i, j, 0);
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    set(n - 1, i, at(i, i));
    set(i, i, 1);
    const h = d[i + 1]!;
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = at(k, i + 1) / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += at(k, i + 1) * at(k, j);
        for (let k = 0; k <= i; k++) set(k, j, at(k, j) - g * d[k]!);
      }
    }
    for (let k = 0; k <= i; k++) set(k, i + 1, 0);
  }
  for (let j = 0; j < n; j++) {
    d[j] = at(n - 1, j);
    set(n - 1, j, 0);
  }
  set(n - 1, n - 1, 1);
  e[0] = 0;
  // The QL steps with implicit shifts.
  for (let i = 1; i < n; i++) e[i - 1] = e[i]!;
  e[n - 1] = 0;
  let f = 0;
  let tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]!) + Math.abs(e[l]!));
    let m = l;
    while (m < n - 1 && Math.abs(e[m]!) > eps * tst1) m++;
    if (m > l) {
      for (let iter = 0; iter < 64; iter++) {
        let g = d[l]!;
        let p = (d[l + 1]! - g) / (2 * e[l]!);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l]! / (p + r);
        d[l + 1] = e[l]! * (p + r);
        const dl1 = d[l + 1]!;
        let h = g - d[l]!;
        for (let i = l + 2; i < n; i++) d[i] = d[i]! - h;
        f += h;
        p = d[m]!;
        let c = 1;
        let c2 = c;
        let c3 = c;
        const el1 = e[l + 1]!;
        let s = 0;
        let s2 = 0;
        for (let i = m - 1; i >= l; i--) {
          c3 = c2;
          c2 = c;
          s2 = s;
          g = c * e[i]!;
          h = c * p;
          r = Math.hypot(p, e[i]!);
          e[i + 1] = s * r;
          s = e[i]! / r;
          c = p / r;
          p = c * d[i]! - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]!);
          for (let k = 0; k < n; k++) {
            const hk = at(k, i + 1);
            set(k, i + 1, s * at(k, i) + c * hk);
            set(k, i, c * at(k, i) - s * hk);
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]!) / dl1;
        e[l] = s * p;
        d[l] = c * p;
        if (Math.abs(e[l]!) <= eps * tst1) break;
      }
    }
    d[l] = d[l]! + f;
    e[l] = 0;
  }
  // The values in increasing order, with their vectors.
  for (let i = 0; i < n - 1; i++) {
    let k = i;
    let p = d[i]!;
    for (let j = i + 1; j < n; j++)
      if (d[j]! < p) {
        k = j;
        p = d[j]!;
      }
    if (k !== i) {
      d[k] = d[i]!;
      d[i] = p;
      for (let j = 0; j < n; j++) {
        const t = at(j, i);
        set(j, i, at(j, k));
        set(j, k, t);
      }
    }
  }
  return { values: d, vectors: V };
}

/**
 * This function puts the rows of a matrix of `n` rows and `k` columns into `k` clusters (the steps of Lloyd).
 * The first centre is row 0. Each next centre is the row farthest from the centres that exist. The result is the cluster of each row.
 */
export function kMeans(n: number, k: number, rows: Float64Array, iterations = 50): Int32Array {
  const label = new Int32Array(n);
  if (k <= 1 || n <= 1) return label;
  const dim = rows.length / n;
  const d2 = (i: number, c: Float64Array, ci: number): number => {
    let s = 0;
    for (let j = 0; j < dim; j++) {
      const v = rows[i * dim + j]! - c[ci * dim + j]!;
      s += v * v;
    }
    return s;
  };
  const centres = new Float64Array(k * dim);
  for (let j = 0; j < dim; j++) centres[j] = rows[j]!;
  const near = new Float64Array(n).fill(Infinity);
  let count = 1;
  for (; count < k; count++) {
    let far = -1;
    let best = -1;
    for (let i = 0; i < n; i++) {
      near[i] = Math.min(near[i]!, d2(i, centres, count - 1));
      if (near[i]! > best) [best, far] = [near[i]!, i];
    }
    if (best <= 1e-12) break;
    for (let j = 0; j < dim; j++) centres[count * dim + j] = rows[far * dim + j]!;
  }
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let c = 0;
      let best = Infinity;
      for (let ci = 0; ci < count; ci++) {
        const v = d2(i, centres, ci);
        if (v < best - 1e-12) [best, c] = [v, ci];
      }
      if (label[i] !== c) [label[i], moved] = [c, true];
    }
    if (!moved && iter > 0) break;
    const sums = new Float64Array(count * dim);
    const sizes = new Int32Array(count);
    for (let i = 0; i < n; i++) {
      sizes[label[i]!]!++;
      for (let j = 0; j < dim; j++) sums[label[i]! * dim + j] = sums[label[i]! * dim + j]! + rows[i * dim + j]!;
    }
    for (let ci = 0; ci < count; ci++) if (sizes[ci]! > 0) for (let j = 0; j < dim; j++) centres[ci * dim + j] = sums[ci * dim + j]! / sizes[ci]!;
  }
  return label;
}

/**
 * This function gives the spectral clusters of the points of a weight matrix (von Luxburg 2007, with the normalization of Ng, Jordan and Weiss).
 * Each connected part of the graph is one problem. `L_sym = I - D^-1/2 W D^-1/2`.
 * The number of clusters `k` of a part is `clusters`, or the place of the largest gap of the first `kMax + 1` eigenvalues.
 * The first `k` eigenvectors, with each row at the length 1, go into `kMeans`. The result is the cluster of each point, and -1 for a point with no pair.
 */
export function spectralLabels(n: number, w: Float64Array, o: Readonly<Pick<SpectralOptions, "clusters" | "kMax">>): Int32Array {
  const labels = new Int32Array(n).fill(-1);
  // The connected parts of the graph.
  const part = new Int32Array(n).fill(-1);
  const parts: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (part[i]! >= 0) continue;
    let alone = true;
    for (let j = 0; j < n && alone; j++) if (j !== i && w[i * n + j]! > 0) alone = false;
    if (alone) continue;
    const list = [i];
    part[i] = parts.length;
    for (let q = 0; q < list.length; q++) {
      const a = list[q]!;
      for (let b = 0; b < n; b++)
        if (part[b]! < 0 && b !== a && w[a * n + b]! > 0) {
          part[b] = parts.length;
          list.push(b);
        }
    }
    list.sort((x, y) => x - y);
    parts.push(list);
  }
  let next = 0;
  for (const list of parts) {
    const m = list.length;
    if (m <= 2) {
      for (const i of list) labels[i] = next;
      next++;
      continue;
    }
    const deg = list.map((i) => list.reduce((s, j) => s + (i === j ? 0 : w[i * n + j]!), 0));
    const a = new Float64Array(m * m);
    for (let x = 0; x < m; x++)
      for (let y = 0; y < m; y++) {
        const v = x === y ? 0 : w[list[x]! * n + list[y]!]! / Math.sqrt(deg[x]! * deg[y]!);
        a[x * m + y] = (x === y ? 1 : 0) - v;
      }
    const { values, vectors } = symmetricEigen(m, a);
    let k = Math.max(1, Math.min(m, Math.round(o.clusters)));
    if (Math.round(o.clusters) <= 0) {
      k = 1;
      let gap = -Infinity;
      const top = Math.max(1, Math.min(Math.round(o.kMax), m - 1));
      for (let i = 1; i <= top; i++) {
        const g = values[i]! - values[i - 1]!;
        if (g > gap + 1e-12) [gap, k] = [g, i];
      }
    }
    if (k <= 1) {
      for (const i of list) labels[i] = next;
      next++;
      continue;
    }
    const rows = new Float64Array(m * k);
    for (let x = 0; x < m; x++) {
      let len = 0;
      for (let j = 0; j < k; j++) len += vectors[x * m + j]! ** 2;
      len = Math.sqrt(len) || 1;
      for (let j = 0; j < k; j++) rows[x * k + j] = vectors[x * m + j]! / len;
    }
    const found = kMeans(m, k, rows);
    const ids = new Map<number, number>();
    list.forEach((i, x) => {
      const c = found[x]!;
      if (!ids.has(c)) ids.set(c, next++);
      labels[i] = ids.get(c)!;
    });
  }
  return labels;
}

/** This function gives the matrix of the compatibility of the pairs of edges, with 0 for a pair below `c0`. Then a `scale` changes the value of each pair that stays. */
export function compatibilityMatrix(ends: readonly EdgeEnds[], c0: number, scale?: (i: number, j: number) => number): Float64Array {
  const n = ends.length;
  const w = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const raw = compatibility(ends[i]!.s, ends[i]!.t, ends[j]!.s, ends[j]!.t);
      if (raw < c0) continue;
      const c = raw * (scale ? scale(i, j) : 1);
      if (c <= 0) continue;
      w[i * n + j] = c;
      w[j * n + i] = c;
    }
  return w;
}

/**
 * This function gives the edge groups of the clusters of the edges of one matrix. Each edge of a cluster gets `flip` when it goes opposite to the first edge of the cluster.
 * An edge with the label -1 gets no group.
 */
export function labelGroups(ends: readonly EdgeEnds[], labels: Int32Array, prefix: string, groups: Map<string, EdgeGroup>): void {
  const lead = new Map<number, number>();
  ends.forEach((e, i) => {
    const c = labels[i]!;
    if (c < 0) return;
    if (!lead.has(c)) lead.set(c, i);
    const l = ends[lead.get(c)!]!;
    const flip = (e.t.x - e.s.x) * (l.t.x - l.s.x) + (e.t.y - e.s.y) * (l.t.y - l.s.y) < 0;
    groups.set(e.edge, { key: `${prefix}${c}`, flip });
  });
}

/** This function splits the edges into blocks of at most `BLOCK` edges, in the order of their sources. A small graph is one block. */
export function edgeBlocks<T extends EdgeEnds>(ends: readonly T[]): T[][] {
  if (ends.length <= BLOCK) return [[...ends]];
  const order = [...ends].sort((a, b) => a.s.x - b.s.x || a.s.y - b.s.y || (a.edge < b.edge ? -1 : 1));
  const out: T[][] = [];
  for (let from = 0; from < order.length; from += BLOCK) out.push(order.slice(from, from + BLOCK));
  return out;
}

/** This function gives the spectral clusters of the edges (HWY-029). A pair of edges is in the graph when its compatibility of FDEB is `c0` or more. */
export function spectralClusters(input: HighwayInput, o: Readonly<SpectralOptions>): Map<string, EdgeGroup> {
  const groups = new Map<string, EdgeGroup>();
  edgeBlocks(edgeEnds(input)).forEach((block, b) => {
    const labels = spectralLabels(block.length, compatibilityMatrix(block, o.c0), o);
    labelGroups(block, labels, `p${b}:`, groups);
  });
  return groups;
}

/**
 * This function gives the highways of the spectral clusters of the compatibility graph (HWY-029). The eigengap gives the number of highways of each part.
 * The clusters with `minSize` edges or more get highways.
 */
export function spectralPlan(input: HighwayInput, o: Readonly<SpectralOptions>): HighwayPlan {
  return groupedPlan(input, spectralClusters(input, o), { spine: o.spine, minSize: Math.max(2, Math.round(o.minSize)) });
}
