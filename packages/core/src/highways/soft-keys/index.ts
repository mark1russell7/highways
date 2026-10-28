import type { GroupRule } from "../../model.ts";
import { byCollection } from "../../routers/trunks.ts";
import { chainClusters, flowDistance, type Linkage } from "../flow-clusters/index.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `soft-keys` (HWY-019 of the note on highways). */
export interface SoftKeyOptions {
  /** The rule that gives the key of each edge. The default is `byCollection`: the string `data.collection`. */
  readonly rule: GroupRule;
  /** The distance that two different keys add. `Infinity` keeps the edges of two keys apart, as the hard keys do. The default is 0.25. */
  readonly lambda: number;
  /** Two clusters join while their distance is this value or less. The default is 0.5. */
  readonly tau: number;
  /** The names of number fields of `data` that add a distance. The default is no field. */
  readonly attributes: readonly string[];
  /** The weight of each field of `attributes`. The distance of a field is its difference over its range. The default is 1. */
  readonly weight: number;
  /** The linkage of the clustering. The default is `average`. */
  readonly linkage: Linkage;
  /** A cluster with this number of edges or more gets highways. The default is 2. */
  readonly minSize: number;
  /** The spine of each cluster. The default is `shared`: the router `shared` with the cluster as the key. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `soft-keys`. */
export const SOFT_KEY_DEFAULTS: Readonly<SoftKeyOptions> = Object.freeze({
  rule: byCollection,
  lambda: 0.25,
  tau: 0.5,
  attributes: Object.freeze([]) as readonly string[],
  weight: 1,
  linkage: "average",
  minSize: 2,
  spine: "shared",
});

/** The largest number of edges in one distance matrix. A larger graph splits into blocks of edges in the order of their sources. */
const BLOCK = 2500;

/**
 * This function gives the soft-key distance of two edges (Peysakhovich, Hurter and Telea 2015): `d = d_geom + lambda [key(e) != key(f)] + sum_a w |a(e) - a(f)| / range(a)`.
 * `d_geom` is the flow distance of HWY-023. The key term is 0 when an edge has no key.
 */
export function softDistance(geom: number, keyA: string | undefined, keyB: string | undefined, lambda: number, attributes: number): number {
  const key = keyA !== undefined && keyB !== undefined && keyA !== keyB ? lambda : 0;
  return geom + key + attributes;
}

/**
 * This function gives the soft-key clusters of the edges (HWY-019). It clusters the edges with `softDistance`, with the cut at `tau`.
 * Each edge of a cluster gets the key of the cluster. It gets `flip` when it goes opposite to the first edge of the cluster.
 */
export function softKeyClusters(input: HighwayInput, o: Readonly<SoftKeyOptions>): Map<string, EdgeGroup> {
  const ends = edgePlugs(input.graph).map(({ edge, ps, pt }) => ({
    edge: edge.id,
    s: ps.point,
    t: pt.point,
    key: o.rule(edge),
    values: o.attributes.map((a) => {
      const v = edge.data?.[a];
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    }),
  }));
  // The range of each field, so that each field adds a distance from 0 to `weight`.
  const ranges = o.attributes.map((_, ai) => {
    const values = ends.map((e) => e.values[ai]).filter((v): v is number => v !== undefined);
    return values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  });
  const extra = (a: (typeof ends)[number], b: (typeof ends)[number]): number => {
    let sum = 0;
    ranges.forEach((range, ai) => {
      const va = a.values[ai];
      const vb = b.values[ai];
      if (range > 0 && va !== undefined && vb !== undefined) sum += (o.weight * Math.abs(va - vb)) / range;
    });
    return sum;
  };
  const groups = new Map<string, EdgeGroup>();
  const order = ends.length > BLOCK ? [...ends].sort((a, b) => a.s.x - b.s.x || a.s.y - b.s.y || (a.edge < b.edge ? -1 : 1)) : ends;
  for (let from = 0; from < order.length; from += BLOCK) {
    const block = order.slice(from, from + BLOCK);
    const n = block.length;
    const d = new Float64Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = block[i]!;
        const b = block[j]!;
        const v = softDistance(flowDistance(a.s, a.t, b.s, b.t, false).d, a.key, b.key, o.lambda, extra(a, b));
        d[i * n + j] = v;
        d[j * n + i] = v;
      }
    const cluster = chainClusters(n, d, o.tau, o.linkage);
    const first = new Map<number, number>();
    block.forEach((e, i) => {
      const c = cluster[i]!;
      if (!first.has(c)) first.set(c, i);
      const lead = block[first.get(c)!]!;
      const flip = i === first.get(c) ? false : flowDistance(lead.s, lead.t, e.s, e.t, false).flip;
      groups.set(e.edge, { key: `k${from + first.get(c)!}`, flip });
    });
  }
  return groups;
}

/**
 * This function gives the highways of the soft keys (HWY-019). The key of an edge is one more term of the distance, not a hard split.
 * Edges of two keys still share a highway when they are very near, and edges of one key do not bundle when they are far.
 */
export function softKeyPlan(input: HighwayInput, o: Readonly<SoftKeyOptions>): HighwayPlan {
  return groupedPlan(input, softKeyClusters(input, o), { spine: o.spine, minSize: o.minSize });
}
