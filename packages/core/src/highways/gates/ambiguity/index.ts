import type { Graph } from "../../../model.ts";
import type { HighwayInput, HighwayPlan } from "../../model.ts";
import { keepMembers, type Gate } from "../model.ts";

/** The options of the gate `ambiguity` (HWY-049). */
export interface AmbiguityGuardOptions {
  /** Two groups of edges merge only when the merge adds this share of false pairs, or less. The default is 0.5. */
  readonly maxAmbiguity: number;
  /** With `node`, the default, two groups merge only when they share an end node. With `any`, only `maxAmbiguity` decides. */
  readonly link: "node" | "any";
}

/** The default options of the gate `ambiguity`. */
export const AMBIGUITY_GUARD_DEFAULTS: Readonly<AmbiguityGuardOptions> = Object.freeze({ maxAmbiguity: 0.5, link: "node" });

/** The adjacency of the nodes of a graph: the neighbours of each node, by the edges. */
function adjacency(graph: Graph): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (a: string, b: string): void => {
    const set = out.get(a);
    if (set) set.add(b);
    else out.set(a, new Set([b]));
  };
  for (const e of graph.edges) {
    add(e.source.node, e.target.node);
    add(e.target.node, e.source.node);
  }
  return out;
}

/**
 * This function gives the ambiguity of a set of nodes: the share of the pairs of distinct nodes without an edge between them.
 * The nodes are the ends of the edges of one highway. A set with fewer than two nodes gives 0.
 */
export function nodeAmbiguity(nodes: ReadonlySet<string>, adj: ReadonlyMap<string, ReadonlySet<string>>): number {
  const n = nodes.size;
  if (n < 2) return 0;
  let linked = 0;
  for (const v of nodes) for (const w of adj.get(v) ?? []) if (w !== v && nodes.has(w)) linked++;
  return 1 - linked / 2 / ((n * (n - 1)) / 2);
}

/** A group of the members of one highway: the edges, their end nodes and the ambiguity of the nodes. */
interface Group {
  readonly edges: string[];
  readonly nodes: Set<string>;
  readonly amb: number;
  /** The first lane of the group, for a fixed order. */
  readonly first: number;
}

/**
 * This function applies the ambiguity guard of HWY-049 to a plan. A highway joins edges that belong together.
 *
 * Two nodes are a false pair when their edges share a highway and no edge joins them. The ambiguity of a group of edges is the share of false pairs among the pairs of its end nodes.
 * In each highway, each edge starts as a group. Two groups merge only when `amb(A ∪ B) - max(amb A, amb B)` is at most `maxAmbiguity`.
 * With the link `node`, they also must share an end node. The merge with the smallest rise comes first.
 *
 * The largest group stays on the highway. The other edges leave it and go alone.
 */
export function ambiguityPlan(input: HighwayInput, plan: HighwayPlan, options: Readonly<AmbiguityGuardOptions>): HighwayPlan {
  const adj = adjacency(input.graph);
  const ends = new Map(input.graph.edges.map((e) => [e.id, [e.source.node, e.target.node] as const]));
  const stay = new Map<string, Set<string>>();
  for (const h of plan.highways) {
    let groups: Group[] = h.lanes.flatMap((edge, i): Group[] => {
      const end = ends.get(edge);
      if (!end) return [];
      const nodes = new Set(end);
      return [{ edges: [edge], nodes, amb: nodeAmbiguity(nodes, adj), first: i }];
    });
    for (;;) {
      let best: { a: number; b: number; rise: number; group: Group } | undefined;
      for (let a = 0; a < groups.length; a++)
        for (let b = a + 1; b < groups.length; b++) {
          const ga = groups[a]!;
          const gb = groups[b]!;
          if (options.link === "node" && ![...gb.nodes].some((v) => ga.nodes.has(v))) continue;
          const nodes = new Set([...ga.nodes, ...gb.nodes]);
          const amb = nodeAmbiguity(nodes, adj);
          const rise = amb - Math.max(ga.amb, gb.amb);
          if (rise > options.maxAmbiguity + 1e-12) continue;
          if (best === undefined || rise < best.rise - 1e-12)
            best = { a, b, rise, group: { edges: [...ga.edges, ...gb.edges], nodes, amb, first: Math.min(ga.first, gb.first) } };
        }
      if (!best) break;
      const merged = best.group;
      const { a, b } = best;
      groups = groups.filter((_, i) => i !== a && i !== b);
      groups.push(merged);
      groups.sort((p, q) => p.first - q.first);
    }
    let top: Group | undefined;
    for (const g of groups) if (top === undefined || g.edges.length > top.edges.length) top = g;
    stay.set(h.id, new Set(top?.edges ?? []));
  }
  return keepMembers(plan, (h, m) => stay.get(h.id)?.has(m.edge) ?? false);
}

/** The gate `ambiguity` (HWY-049): the ambiguity guard. A highway does not join edges whose end nodes have no edges between them. */
export const ambiguityGate: Gate<AmbiguityGuardOptions> = {
  name: "ambiguity",
  describe: "The gate `ambiguity` (HWY-049) keeps on each highway the largest group of edges that a reader can tell apart. A merge of two groups must add few false pairs of nodes.",
  defaults: AMBIGUITY_GUARD_DEFAULTS,
  schema: {
    maxAmbiguity: { type: "number", min: 0, max: 1, step: 0.05, marks: [0.3, 0.5], default: 0.5, describe: "Two groups merge only when the merge adds this share of false pairs, or less." },
    link: { type: "enum", values: ["node", "any"], default: "node", describe: "With `node`, two groups merge only when they share an end node. With `any`, only `maxAmbiguity` decides." },
  },
  apply: (input, plan, options) => ambiguityPlan(input, plan, options),
};
