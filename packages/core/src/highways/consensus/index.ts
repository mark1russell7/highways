import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { candidatePlan, type CandidateSource } from "../select/index.ts";
import { edgeEnds, labelGroups } from "../spectral/index.ts";

/** The linkage of the clusters of the vote matrix: `average` (the mean distance of the pairs) or `single` (the nearest pair). */
export type ConsensusLinkage = "average" | "single";

/** The values of `ConsensusLinkage`. */
export const CONSENSUS_LINKAGES: readonly ConsensusLinkage[] = Object.freeze(["average", "single"]);

/** The options of the highway strategy `consensus` (HWY-035 of the note on highways). */
export interface ConsensusOptions {
  /** The finders that vote. The default is `corridors`, `quickbundles`, `wspd` and `road-classes`. */
  readonly members: readonly CandidateSource[];
  /** Two clusters join while their distance `1 - A` is below this value. The default is 0.5: more than half of the votes. */
  readonly cut: number;
  /** The linkage of the clusters. The default is `average`. */
  readonly linkage: ConsensusLinkage;
  /** A cluster with this number of edges or more gets highways. The default is 2. */
  readonly minSize: number;
  /** The spine of each cluster. The default is `shared`. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `consensus`. */
export const CONSENSUS_DEFAULTS: Readonly<ConsensusOptions> = Object.freeze({
  members: Object.freeze(["corridors", "quickbundles", "wspd", "road-classes"] as CandidateSource[]),
  cut: 0.5,
  linkage: "average",
  minSize: 2,
  spine: "shared",
});

/**
 * This function gives the co-association matrix of the plans (Fred and Jain 2005). `A[e][f]` is the share of the plans with a highway that holds both `e` and `f`.
 * The edges are in the order of `edges`. An edge of no plan has no pair.
 */
export function coAssociation(edges: readonly string[], plans: readonly HighwayPlan[]): Float64Array {
  const n = edges.length;
  const index = new Map(edges.map((e, i) => [e, i] as const));
  const a = new Float64Array(n * n);
  if (plans.length === 0) return a;
  const share = 1 / plans.length;
  for (const plan of plans) {
    const pairs = new Set<number>();
    for (const h of plan.highways) {
      const list = [...new Set(h.members.map((m) => index.get(m.edge)).filter((i): i is number => i !== undefined))].sort((x, y) => x - y);
      for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) pairs.add(list[x]! * n + list[y]!);
    }
    for (const p of pairs) {
      const i = Math.floor(p / n);
      const j = p % n;
      a[i * n + j] = a[i * n + j]! + share;
      a[j * n + i] = a[j * n + i]! + share;
    }
  }
  return a;
}

/**
 * This function gives the clusters of the agglomerative linkage on the distance `1 - A`. Two clusters join while their distance is below `cut`.
 * The linkage `average` uses the mean of the distances of the pairs, and `single` the smallest distance.
 * The result is the cluster of each edge, and -1 for an edge that stays alone.
 */
export function consensusLabels(n: number, a: Float64Array, cut: number, linkage: ConsensusLinkage): Int32Array {
  const d = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) d[i] = 1 - a[i]!;
  const size = new Int32Array(n).fill(1);
  const alive = new Uint8Array(n).fill(1);
  const owner = new Int32Array(n);
  for (let i = 0; i < n; i++) owner[i] = i;
  for (;;) {
    let bi = -1;
    let bj = -1;
    let best = cut;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue;
        const v = d[i * n + j]!;
        if (v < best - 1e-12) [best, bi, bj] = [v, i, j];
      }
    }
    if (bi < 0) break;
    // The cluster `bj` joins the cluster `bi` (the formula of Lance and Williams).
    for (let k = 0; k < n; k++) {
      if (!alive[k] || k === bi || k === bj) continue;
      const v =
        linkage === "single"
          ? Math.min(d[bi * n + k]!, d[bj * n + k]!)
          : (size[bi]! * d[bi * n + k]! + size[bj]! * d[bj * n + k]!) / (size[bi]! + size[bj]!);
      d[bi * n + k] = v;
      d[k * n + bi] = v;
    }
    size[bi] = size[bi]! + size[bj]!;
    alive[bj] = 0;
    for (let k = 0; k < n; k++) if (owner[k] === bj) owner[k] = bi;
  }
  const labels = new Int32Array(n).fill(-1);
  const count = new Int32Array(n);
  for (let k = 0; k < n; k++) count[owner[k]!]!++;
  for (let k = 0; k < n; k++) if (count[owner[k]!]! > 1) labels[k] = owner[k]!;
  return labels;
}

/** This function gives the edge groups of the consensus of the plans of the finders `members` (HWY-035). */
export function consensusGroups(input: HighwayInput, o: Readonly<ConsensusOptions>): Map<string, EdgeGroup> {
  const plans = [...new Set(o.members)].map((m) => candidatePlan(input, m));
  // Only the edges on a highway of a plan get votes.
  const voted = new Set(plans.flatMap((p) => p.highways.flatMap((h) => h.members.map((m) => m.edge))));
  const ends = edgeEnds(input).filter((e) => voted.has(e.edge));
  const a = coAssociation(
    ends.map((e) => e.edge),
    plans,
  );
  const labels = consensusLabels(ends.length, a, Math.max(0, Math.min(1, o.cut)), o.linkage);
  const groups = new Map<string, EdgeGroup>();
  labelGroups(ends, labels, "c", groups);
  return groups;
}

/**
 * This function gives the highways of the consensus of clusterings (HWY-035). Each finder of `members` votes for the pairs of edges that share one of its highways.
 * The clusters of the vote matrix with `minSize` edges or more get highways. A small edit changes few votes, so the clusters are stable.
 */
export function consensusPlan(input: HighwayInput, o: Readonly<ConsensusOptions>): HighwayPlan {
  return groupedPlan(input, consensusGroups(input, o), { spine: o.spine, minSize: Math.max(2, Math.round(o.minSize)) });
}
