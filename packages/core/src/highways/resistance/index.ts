import { rng } from "../../fixtures.ts";
import type { Graph } from "../../model.ts";
import { groupedPlan, type EdgeGroup } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { compatibilityMatrix, edgeBlocks, edgeEnds, labelGroups, spectralLabels, type SpectralOptions } from "../spectral/index.ts";

/** The options of the highway strategy `resistance` (HWY-021 of the note on highways). */
export interface ResistanceOptions extends SpectralOptions {
  /** The number of random projections of the estimate of the resistance. The default is 16. */
  readonly projections: number;
  /** The weight of the resistance, from 0 to 1. A pair with `C >= c0` gets the weight `C (1 - weight R_e R_f)`. The default is 0.5. */
  readonly weight: number;
  /** With `true`, an edge with a resistance of 0.99 or more (a bridge) gets no pair. The default is `false`. */
  readonly sparsify: boolean;
}

/** The default options of the strategy `resistance`. */
export const RESISTANCE_DEFAULTS: Readonly<ResistanceOptions> = Object.freeze({
  c0: 0.5,
  clusters: 0,
  kMax: 16,
  minSize: 2,
  spine: "trunk",
  projections: 16,
  weight: 0.5,
  sparsify: false,
});

/** The seed of the random projections. One seed gives the same estimate each time. */
const SEED = 21;

/** A resistance of this value or more marks a bridge. */
const BRIDGE = 0.99;

/**
 * This function solves `L z = y` with the method of conjugate gradients. `L` is the Laplacian of the graph, and `y` has a sum of 0 on each connected part.
 * The result has a mean of 0 on each connected part.
 */
function solveLaplacian(n: number, adj: readonly (readonly number[])[], y: Float64Array, part: Int32Array, parts: number): Float64Array {
  const mul = (v: Float64Array, out: Float64Array): void => {
    for (let i = 0; i < n; i++) {
      let s = adj[i]!.length * v[i]!;
      for (const j of adj[i]!) s -= v[j]!;
      out[i] = s;
    }
  };
  const centre = (v: Float64Array): void => {
    const sum = new Float64Array(parts);
    const size = new Float64Array(parts);
    for (let i = 0; i < n; i++) {
      sum[part[i]!] = sum[part[i]!]! + v[i]!;
      size[part[i]!] = size[part[i]!]! + 1;
    }
    for (let i = 0; i < n; i++) v[i] = v[i]! - sum[part[i]!]! / size[part[i]!]!;
  };
  const z = new Float64Array(n);
  const r = Float64Array.from(y);
  centre(r);
  const p = Float64Array.from(r);
  const lp = new Float64Array(n);
  let rr = r.reduce((s, v) => s + v * v, 0);
  const stop = 1e-20 * Math.max(1, rr);
  for (let iter = 0; iter < 4 * n + 20 && rr > stop; iter++) {
    mul(p, lp);
    const pl = p.reduce((s, v, i) => s + v * lp[i]!, 0);
    if (pl <= 0) break;
    const a = rr / pl;
    for (let i = 0; i < n; i++) {
      z[i] = z[i]! + a * p[i]!;
      r[i] = r[i]! - a * lp[i]!;
    }
    const next = r.reduce((s, v) => s + v * v, 0);
    const b = next / rr;
    rr = next;
    for (let i = 0; i < n; i++) p[i] = r[i]! + b * p[i]!;
  }
  centre(z);
  return z;
}

/**
 * This function gives an estimate of the effective resistance of each edge of the graph (Spielman and Srivastava 2011).
 * It takes `k` random vectors `q` of the values `±1/√k` on the edges. It solves `L z = Bᵀ q` for each vector. Then `R(u, v) ≈ Σ (z_u - z_v)²`.
 * The value is from 0 to 1. A loop and an edge with an unknown node get 0. Parallel edges share the current, so each gets a lower value.
 */
export function edgeResistance(graph: Graph, projections: number): Map<string, number> {
  const index = new Map(graph.nodes.map((v, i) => [v.id, i] as const));
  const n = graph.nodes.length;
  const adj: number[][] = graph.nodes.map(() => []);
  const ends: { id: string; u: number; v: number }[] = [];
  for (const e of graph.edges) {
    const u = index.get(e.source.node);
    const v = index.get(e.target.node);
    if (u === undefined || v === undefined || u === v) continue;
    adj[u]!.push(v);
    adj[v]!.push(u);
    ends.push({ id: e.id, u, v });
  }
  // The connected parts of the graph.
  const part = new Int32Array(n).fill(-1);
  let parts = 0;
  for (let i = 0; i < n; i++) {
    if (part[i]! >= 0) continue;
    const stack = [i];
    part[i] = parts;
    while (stack.length > 0) {
      const a = stack.pop()!;
      for (const b of adj[a]!)
        if (part[b]! < 0) {
          part[b] = parts;
          stack.push(b);
        }
    }
    parts++;
  }
  const k = Math.max(1, Math.round(projections));
  const random = rng(SEED);
  const sum = new Float64Array(ends.length);
  for (let r = 0; r < k; r++) {
    const y = new Float64Array(n);
    for (const { u, v } of ends) {
      const q = (random() < 0.5 ? -1 : 1) / Math.sqrt(k);
      y[u] = y[u]! + q;
      y[v] = y[v]! - q;
    }
    const z = solveLaplacian(n, adj, y, part, parts);
    ends.forEach(({ u, v }, i) => {
      sum[i] = sum[i]! + (z[u]! - z[v]!) ** 2;
    });
  }
  const out = new Map<string, number>(graph.edges.map((e) => [e.id, 0] as const));
  ends.forEach(({ id }, i) => out.set(id, Math.max(0, Math.min(1, sum[i]!))));
  return out;
}

/**
 * This function gives the clusters of the edges with the compatibility scaled by the resistance (HWY-021).
 * The compatibility of a pair is `C (1 - weight R_e R_f)`. A pair of two bridges thus gets a lower value. Then the spectral clusters of `spectral` apply.
 */
export function resistanceClusters(input: HighwayInput, o: Readonly<ResistanceOptions>): Map<string, EdgeGroup> {
  const resistance = edgeResistance(input.graph, o.projections);
  const weight = Math.max(0, Math.min(1, o.weight));
  const groups = new Map<string, EdgeGroup>();
  edgeBlocks(edgeEnds(input)).forEach((block, b) => {
    const r = block.map((e) => resistance.get(e.edge) ?? 0);
    const scale = (i: number, j: number): number => (o.sparsify && (r[i]! >= BRIDGE || r[j]! >= BRIDGE) ? 0 : 1 - weight * r[i]! * r[j]!);
    const labels = spectralLabels(block.length, compatibilityMatrix(block, o.c0, scale), o);
    labelGroups(block, labels, `p${b}:`, groups);
  });
  return groups;
}

/**
 * This function gives the highways of the spectral clusters of the compatibility graph with the weights of the effective resistance (HWY-021).
 * The clusters with `minSize` edges or more get highways.
 */
export function resistancePlan(input: HighwayInput, o: Readonly<ResistanceOptions>): HighwayPlan {
  return groupedPlan(input, resistanceClusters(input, o), { spine: o.spine, minSize: Math.max(2, Math.round(o.minSize)) });
}
