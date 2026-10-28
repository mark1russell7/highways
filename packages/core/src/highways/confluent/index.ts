import type { Graph } from "../../model.ts";
import { byCollection } from "../../routers/trunks.ts";
import type { WayOptions } from "../../ways.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";

/** The edges that one group can hold: the edges of one collection, or each edge. */
export type GroupScope = "collection" | "all";

/** The values of `GroupScope`. */
export const GROUP_SCOPES: readonly GroupScope[] = Object.freeze(["collection", "all"]);

/** The options of the highway strategy `confluent` (HWY-013 of the notes). */
export interface ConfluentOptions extends Pick<WayOptions, "margin" | "k"> {
  /** A biclique `K(A, B)` becomes a track when `|A| |B|` is this value or more. The default is 4. */
  readonly minBiclique: number;
  /** The edges of one track. With `collection`, a track holds the edges of one collection, and an edge without a collection is on no track. The default is `all`. */
  readonly scope: GroupScope;
  /** The spine of each track. The default is `trunk`: one trunk from the merge junction to the split junction. */
  readonly spine: GroupSpine;
  /** An edge rides the trunk only when each of its legs is this share of the trunk or shorter. `Infinity` sets no limit. The default is 1. */
  readonly legMax: number;
}

/** The default options of the strategy `confluent`. */
export const CONFLUENT_DEFAULTS: Readonly<Required<Omit<ConfluentOptions, "margin" | "k">>> = Object.freeze({
  minBiclique: 4,
  scope: "all",
  spine: "trunk",
  legMax: 1,
});

/** The edges between pairs of nodes of one scope: for each node, its neighbours and the edges to each of them. */
export interface NodeLinks {
  /** The key of the scope. */
  readonly key: string;
  /** For each node, the edges to each neighbour, by the id of the neighbour. */
  readonly links: Map<string, Map<string, string[]>>;
}

/** This function gives the links of each scope. A loop (an edge from a node to itself) is not a link. The order of the maps follows the order of the edges. */
export function nodeLinks(graph: Graph, scope: GroupScope): NodeLinks[] {
  const byKey = new Map<string, Map<string, Map<string, string[]>>>();
  const nodes = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    const s = e.source.node;
    const t = e.target.node;
    if (s === t || !nodes.has(s) || !nodes.has(t)) continue;
    const key = scope === "all" ? "" : byCollection(e);
    if (key === undefined) continue;
    let links = byKey.get(key);
    if (!links) byKey.set(key, (links = new Map()));
    for (const [u, v] of [
      [s, t],
      [t, s],
    ] as const) {
      let m = links.get(u);
      if (!m) links.set(u, (m = new Map()));
      const list = m.get(v);
      if (list) list.push(e.id);
      else m.set(v, [e.id]);
    }
  }
  return [...byKey].map(([key, links]) => ({ key, links }));
}

/** A biclique: the two sets of nodes, with a link from each node of `a` to each node of `b`. */
export interface Biclique {
  readonly a: readonly string[];
  readonly b: readonly string[];
}

/**
 * This function gives the bicliques of a greedy search (HWY-013). Each search starts at one node `x` with `A = {x}` and `B` its neighbours.
 * It then adds to `A` the node that gives the largest `|A| |B|`, with `B` cut to the common neighbours, while the product grows.
 * The best biclique of all starts with `|A| |B| >= min` becomes a track, its links go away, and the search repeats.
 * The nodes of `A` and `B` are apart. The largest set is `b`.
 */
export function greedyBicliques(links: Map<string, Map<string, string[]>>, min: number): Biclique[] {
  const live = new Map<string, Set<string>>();
  for (const [u, m] of links) live.set(u, new Set(m.keys()));
  const out: Biclique[] = [];
  const order = [...live.keys()].sort();
  for (;;) {
    let best: { a: string[]; b: Set<string>; size: number } | undefined;
    for (const x of order) {
      const nx = live.get(x)!;
      if (nx.size === 0) continue;
      const a = [x];
      let b = new Set(nx);
      for (;;) {
        // The candidates: the other neighbours of the nodes of B, outside A and B.
        let pick: { y: string; b: Set<string> } | undefined;
        let pickSize = a.length * b.size;
        const seen = new Set<string>();
        for (const v of [...b].sort())
          for (const y of [...live.get(v)!].sort()) {
            if (seen.has(y) || a.includes(y) || b.has(y)) continue;
            seen.add(y);
            const ny = live.get(y)!;
            const common = new Set([...b].filter((z) => ny.has(z)));
            const size = (a.length + 1) * common.size;
            if (size > pickSize) [pick, pickSize] = [{ y, b: common }, size];
          }
        if (!pick) break;
        a.push(pick.y);
        b = pick.b;
      }
      const size = a.length * b.size;
      if (size >= min && (!best || size > best.size)) best = { a: [...a], b, size };
    }
    if (!best) break;
    const a = [...best.a].sort();
    const b = [...best.b].sort();
    out.push(a.length > b.length ? { a: b, b: a } : { a, b });
    for (const u of a)
      for (const v of b) {
        live.get(u)!.delete(v);
        live.get(v)!.delete(u);
      }
  }
  return out;
}

/**
 * This function gives the group of each edge of a set of bicliques. The edges of one biclique are one group, with the key `<prefix><scope>/<index>`.
 * An edge from a node of `b` to a node of `a` has `flip`, so each trunk goes from the side `a` to the side `b`.
 */
export function bicliqueGroups(graph: Graph, scope: NodeLinks, bicliques: readonly Biclique[], prefix: string, into: Map<string, EdgeGroup>): void {
  const sourceOf = new Map(graph.edges.map((e) => [e.id, e.source.node] as const));
  bicliques.forEach((bc, i) => {
    const key = `${prefix}${scope.key}/${i}`;
    const inA = new Set(bc.a);
    for (const u of bc.a)
      for (const v of bc.b) for (const edge of scope.links.get(u)?.get(v) ?? []) if (!into.has(edge)) into.set(edge, { key, flip: !inA.has(sourceOf.get(edge)!) });
  });
}

/**
 * This function gives the highways of the confluent drawing (HWY-013, Dickerson, Eppstein, Goodrich and Meng 2005).
 * Each biclique `K(A, B)` of the greedy search is one track. The track merges the edges near the side `A` and splits them near the side `B`.
 * The junctions are the Weber points of the ends, as in the spine `trunk` of `groupedPlan`.
 */
export function confluentPlan(input: HighwayInput, o: Readonly<ConfluentOptions>): HighwayPlan {
  const groups = new Map<string, EdgeGroup>();
  for (const scope of nodeLinks(input.graph, o.scope)) bicliqueGroups(input.graph, scope, greedyBicliques(scope.links, Math.max(2, o.minBiclique)), "c", groups);
  return groupedPlan(input, groups, {
    ...(o.margin === undefined ? {} : { margin: o.margin }),
    ...(o.k === undefined ? {} : { k: o.k }),
    spine: o.spine,
    minSize: 2,
    legMax: o.legMax,
  });
}
