import type { WayOptions } from "../../ways.ts";
import { nodeLinks, type GroupScope } from "../confluent/index.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";

/** The rule of a module: the nodes with the same neighbours (`exact`), or with near neighbours by the Jaccard index (`near`). */
export type ModuleRule = "exact" | "near";

/** The values of `ModuleRule`. */
export const MODULE_RULES: readonly ModuleRule[] = Object.freeze(["exact", "near"]);

/** The options of the highway strategy `power` (HWY-014 of the notes). */
export interface PowerOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The rule of the modules. The default is `exact`. */
  readonly modules: ModuleRule;
  /** With the rule `near`, a node joins a module at this Jaccard index or more with the first node of the module. The default is 0.8. */
  readonly jaccard: number;
  /** A power edge saves the number of its edges less 1. It becomes a highway when it saves this number of edges or more. The default is 2. */
  readonly minSaved: number;
  /** The edges of one power edge. With `collection`, a power edge holds the edges of one collection. The default is `all`. */
  readonly scope: GroupScope;
  /** The spine of each power edge. The default is `trunk`. */
  readonly spine: GroupSpine;
  /** An edge rides the trunk only when each of its legs is this share of the trunk or shorter. `Infinity` sets no limit. The default is 1. */
  readonly legMax: number;
}

/** The default options of the strategy `power`. */
export const POWER_DEFAULTS: Readonly<Required<Omit<PowerOptions, "margin" | "k">>> = Object.freeze({
  modules: "exact",
  jaccard: 0.8,
  minSaved: 2,
  scope: "all",
  spine: "trunk",
  legMax: 1,
});

/** This function gives the Jaccard index of two sets: the size of their common part over the size of their union. Two empty sets give 1. */
export function jaccardIndex(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let common = 0;
  for (const x of a) if (b.has(x)) common++;
  const union = a.size + b.size - common;
  return union === 0 ? 1 : common / union;
}

/**
 * This function gives the module of each node. With `exact`, the nodes with the same set of neighbours are one module.
 * With `near`, the nodes go in the order of their degree, the largest first. A node joins the first module whose first node has a Jaccard index of `jaccard` or more with it.
 * The function gives the modules as lists of nodes, each in the order of the ids.
 */
export function modulesOf(links: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>, rule: ModuleRule, jaccard: number): string[][] {
  const nodes = [...links.keys()].sort();
  const sets = new Map(nodes.map((u) => [u, new Set(links.get(u)!.keys())] as const));
  if (rule === "exact") {
    const byKey = new Map<string, string[]>();
    for (const u of nodes) {
      const key = [...sets.get(u)!].sort().join("\u0000");
      const list = byKey.get(key);
      if (list) list.push(u);
      else byKey.set(key, [u]);
    }
    return [...byKey.values()];
  }
  const order = [...nodes].sort((u, v) => sets.get(v)!.size - sets.get(u)!.size || (u < v ? -1 : u > v ? 1 : 0));
  const modules: string[][] = [];
  for (const u of order) {
    const home = modules.find((m) => !sets.get(m[0]!)!.has(u) && jaccardIndex(sets.get(m[0]!)!, sets.get(u)!) >= jaccard);
    if (home) home.push(u);
    else modules.push([u]);
  }
  return modules.map((m) => [...m].sort());
}

/**
 * This function gives the highways of the edge compression with modules and power graphs (HWY-014, Dwyer, Henry Riche, Marriott and Mears 2013).
 * The edges between two modules are one power edge. With modules of the rule `exact`, each node of one module links to each node of the other.
 * A power edge that saves `minSaved` edges or more is one highway from module to module.
 * Its trunk goes between the Weber points of the two ends.
 * The search does not nest modules, so it finds no power edge inside a power edge.
 */
export function powerPlan(input: HighwayInput, o: Readonly<PowerOptions>): HighwayPlan {
  const groups = new Map<string, EdgeGroup>();
  const sourceOf = new Map(input.graph.edges.map((e) => [e.id, e.source.node] as const));
  for (const scope of nodeLinks(input.graph, o.scope)) {
    const modules = modulesOf(scope.links, o.modules, o.jaccard);
    const moduleOf = new Map<string, number>();
    modules.forEach((m, i) => {
      for (const u of m) moduleOf.set(u, i);
    });
    // The edges between each pair of modules, with the smaller index first.
    const between = new Map<string, { i: number; j: number; edges: string[] }>();
    for (const [u, m] of scope.links)
      for (const [v, edges] of m) {
        const i = moduleOf.get(u)!;
        const j = moduleOf.get(v)!;
        if (i >= j) continue;
        const key = `${i},${j}`;
        let p = between.get(key);
        if (!p) between.set(key, (p = { i, j, edges: [] }));
        for (const e of edges) if (!p.edges.includes(e)) p.edges.push(e);
      }
    const pairs = [...between.values()].sort((p, q) => q.edges.length - p.edges.length || p.i - q.i || p.j - q.j);
    for (const p of pairs) {
      if (p.edges.length - 1 < Math.max(1, o.minSaved)) continue;
      const first = new Set(modules[p.i]);
      const key = `p${scope.key}/${p.i}-${p.j}`;
      for (const e of p.edges) if (!groups.has(e)) groups.set(e, { key, flip: !first.has(sourceOf.get(e)!) });
    }
  }
  return groupedPlan(input, groups, {
    ...(o.margin === undefined ? {} : { margin: o.margin }),
    ...(o.k === undefined ? {} : { k: o.k }),
    spine: o.spine,
    minSize: 2,
    legMax: o.legMax,
  });
}
