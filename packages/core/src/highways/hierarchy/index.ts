import { center, type Point } from "../../geom.ts";
import { cutGroups, kdGroups, quadtreeGroups } from "../../groups/index.ts";
import type { Section } from "../../sections.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";
import { tracePlan } from "../trace.ts";

/** The trees of sections that the strategy `hierarchy` can use. */
export type HierarchyGroups = "quadtree" | "kd" | "cut";

/** The values of `HierarchyGroups`. */
export const HIERARCHY_GROUPS: readonly HierarchyGroups[] = Object.freeze(["quadtree", "kd", "cut"]);

/** The options of the highway strategy `hierarchy` (HWY-001 of the notes). */
export interface HierarchyOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The tree of sections. The default is `quadtree`. */
  readonly group: HierarchyGroups;
  /** A section with more nodes splits. The default is 8. */
  readonly cap: number;
  /** The pull of the hubs, from 0 to 1 (Holten 2006). The value 0 gives the straight line, and 1 goes through each hub. The default is 0.85. */
  readonly beta: number;
  /** The largest number of hubs on each side of the lowest common section. `Infinity` uses all of them. The default is `Infinity`. */
  readonly hubs: number;
  /** The side of the grid that the hubs snap to, in units of the board. The default is 8. */
  readonly snap: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `hierarchy`. */
export const HIERARCHY_DEFAULTS: Readonly<Required<Omit<HierarchyOptions, "margin" | "k">>> = Object.freeze({
  group: "quadtree",
  cap: 8,
  beta: 0.85,
  hubs: Infinity,
  snap: 8,
  minSize: 2,
});

/** This function gives the tree of sections of the option `group`. */
function treeOf(input: HighwayInput, group: HierarchyGroups, cap: number): Section {
  const c = Math.max(1, Math.round(cap));
  if (group === "kd") return kdGroups(input.graph, { cap: c });
  if (group === "cut") return cutGroups(input.graph, { cap: c });
  return quadtreeGroups(input.graph, { cap: c });
}

/**
 * This function gives the hub of each section of the tree: the mean of the middles of the boxes of its nodes.
 * A hub in a box moves to the nearest corner of the corner graph.
 */
function hubsOf(input: HighwayInput, root: Section, finder: WayFinder): Map<string, Point> {
  const middles = input.graph.nodes.map((n) => center(n.box));
  const hubs = new Map<string, Point>();
  const visit = (s: Section): void => {
    if (s.nodes.length > 0) {
      let x = 0;
      let y = 0;
      for (const i of s.nodes) {
        x += middles[i]!.x;
        y += middles[i]!.y;
      }
      let hub = { x: x / s.nodes.length, y: y / s.nodes.length };
      if (finder.obstacles.inside(hub, finder.margin / 2)) {
        const j = finder.corners.nearest(hub);
        if (j >= 0) hub = finder.corners.points[j]!;
      }
      hubs.set(s.id, hub);
    }
    for (const c of s.children) visit(c);
  };
  visit(root);
  return hubs;
}

/** This function gives the chain of sections from the root to the leaf of each node, by the index of the node. */
function chainsOf(root: Section, count: number): (readonly Section[])[] {
  const chains: Section[][] = Array.from({ length: count }, () => []);
  const visit = (s: Section, path: Section[]): void => {
    const here = [...path, s];
    if (s.children.length === 0) for (const i of s.nodes) chains[i] = here;
    for (const c of s.children) visit(c, here);
  };
  visit(root, []);
  return chains;
}

/**
 * This function gives the control points of one edge. They are the sections from the leaf of the source up to the lowest common section, then down to the target leaf.
 * The lowest common section is not in the chain (Holten 2006), so the edges do not all meet at the hub of the root.
 * `hubs` limits the sections on each side. The sections nearest to the common section stay.
 */
export function controlChain(from: readonly Section[], to: readonly Section[], hubs: number): Section[] {
  let lca = 0;
  while (lca < from.length && lca < to.length && from[lca]!.id === to[lca]!.id) lca++;
  // The first sections that differ are at the depth `lca`.
  const limit = Number.isFinite(hubs) ? Math.max(0, Math.round(hubs)) : Infinity;
  const up = from.slice(lca, lca + limit).reverse();
  const down = to.slice(lca, lca + limit);
  return [...up, ...down];
}

/**
 * This function gives the highways of the hierarchical edge bundling (HWY-001, Holten 2006).
 * The tree of sections gives a hub to each section. Each edge goes near the hubs of the sections between its two leaves.
 * The waypoint of a hub is `beta hub + (1 - beta) p`, with `p` the point of the straight line at the same share of the chain.
 * The waypoints snap to a grid of side `snap`, and the ways go through the corner graph. The stretches that `minSize` ways share become highways.
 */
export function hierarchyPlan(input: HighwayInput, o: Readonly<HierarchyOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const index = new Map(input.graph.nodes.map((n, i) => [n.id, i] as const));
  const waypoints = new Map<string, Point[]>();
  if (input.graph.nodes.length > 0) {
    const root = treeOf(input, o.group, o.cap);
    const hubs = hubsOf(input, root, finder);
    const chains = chainsOf(root, input.graph.nodes.length);
    const beta = Math.max(0, Math.min(1, o.beta));
    for (const { edge, ps, pt } of edgePlugs(input.graph)) {
      const s = index.get(edge.source.node);
      const t = index.get(edge.target.node);
      if (s === undefined || t === undefined) continue;
      const chain = controlChain(chains[s] ?? [], chains[t] ?? [], o.hubs)
        .map((c) => hubs.get(c.id))
        .filter((p): p is Point => p !== undefined);
      if (chain.length === 0) continue;
      const a = finder.out(ps);
      const b = finder.out(pt);
      waypoints.set(
        edge.id,
        chain.map((h, i) => {
          const u = (i + 1) / (chain.length + 1);
          const line = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
          return { x: beta * h.x + (1 - beta) * line.x, y: beta * h.y + (1 - beta) * line.y };
        }),
      );
    }
  }
  return tracePlan(input, finder, waypoints, { snap: o.snap, minSize: o.minSize, key: "hierarchy" });
}
