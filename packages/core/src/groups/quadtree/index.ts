import type { Graph } from "../../model.ts";
import { buildSections, type Section, type SectionOptions } from "../../sections.ts";

/**
 * This function gives the tree of sections of the grouping rule `quadtree`: the cells of a quadtree of the plane (`buildSections`).
 * It is the default grouping rule of the router `sections`.
 */
export function quadtreeGroups(graph: Graph, options: SectionOptions = {}): Section {
  return buildSections(graph.nodes, options);
}
