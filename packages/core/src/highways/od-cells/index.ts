import { buildSections, levelCut } from "../../sections.ts";
import { groupedPlan, type EdgeGroup, type GroupSpine } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";

/** The options of the highway strategy `od-cells` (EDA-033 with WILD-032 of the notes). */
export interface OdCellOptions {
  /** The depth of the cells in the tree of sections. Depth 1 is the level below the root. The default is 2. */
  readonly level: number;
  /** A pair of cells with this number of edges or more gets a trunk. The default is 3. */
  readonly minGroup: number;
  /** An edge rides the trunk only when each of its legs is this share of the span or shorter. The default is 0.3. */
  readonly legMax: number;
  /** The spine of each pair of cells. The default is `trunk`. */
  readonly spine: GroupSpine;
}

/** The default options of the strategy `od-cells`. */
export const OD_CELL_DEFAULTS: Readonly<OdCellOptions> = Object.freeze({ level: 2, minGroup: 3, legMax: 0.3, spine: "trunk" });

/**
 * This function gives the groups of the edges by the pair of the cells of their two nodes (EDA-033, WILD-032).
 * The cells are the items of the zoom level at the depth `level`. The edges of one pair of cells, in either direction, are one group.
 * An edge inside one cell is in no group.
 */
export function odGroups(input: HighwayInput, o: Readonly<OdCellOptions>): Map<string, EdgeGroup> {
  const nodes = input.graph.nodes;
  const groups = new Map<string, EdgeGroup>();
  if (nodes.length === 0) return groups;
  const { owner } = levelCut(nodes, buildSections(nodes), Math.max(0, Math.round(o.level)));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  for (const e of input.graph.edges) {
    const u = index.get(e.source.node);
    const v = index.get(e.target.node);
    if (u === undefined || v === undefined) continue;
    const a = owner[u]!;
    const b = owner[v]!;
    if (a === b) continue;
    groups.set(e.id, a < b ? { key: `od${a}:${b}`, flip: false } : { key: `od${b}:${a}`, flip: true });
  }
  return groups;
}

/**
 * This function gives the highways of the consolidation by origin and destination cells (EDA-033, WILD-032).
 * Carriers merge the loads from one region to another into one truck between two terminals. Thus each pair of cells with `minGroup` edges or more gets one trunk.
 * The terminals are the Weber points of the plugs in each cell. An edge with a leg longer than `legMax` times the span goes alone.
 */
export function odCellPlan(input: HighwayInput, o: Readonly<OdCellOptions>): HighwayPlan {
  return groupedPlan(input, odGroups(input, o), { spine: o.spine, minSize: o.minGroup, legMax: o.legMax });
}
