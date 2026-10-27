import { describe, expect, it } from "vitest";
import { measureRouteFaults } from "../bench/links.ts";
import { checkProperties } from "../bench/properties.ts";
import { measureQuality } from "../bench/quality.ts";
import { makeFixture, type FixtureKind } from "../fixtures.ts";
import { polylineLength, type Box } from "../geom.ts";
import type { Graph } from "../model.ts";
import { buildSections, treeDepth } from "../sections.ts";
import { cornersRouter } from "./corners.ts";
import { sectionsRouter } from "./sections.ts";

const box = (x: number, y: number): Box => ({ x, y, w: 40, h: 20 });

// Two groups of two nodes, far apart. Each node at the top left has an edge to each node at the bottom right.
const groups: Graph = {
  nodes: [
    { id: "a0", box: box(0, 0) },
    { id: "a1", box: box(60, 0) },
    { id: "b0", box: box(1000, 1000) },
    { id: "b1", box: box(1060, 1000) },
  ],
  edges: [
    { id: "e00", source: { node: "a0" }, target: { node: "b0" } },
    { id: "e01", source: { node: "a0" }, target: { node: "b1" } },
    { id: "e10", source: { node: "a1" }, target: { node: "b0" } },
    { id: "e11", source: { node: "a1" }, target: { node: "b1" } },
  ],
};

const length = (g: Graph, stretch: number): number =>
  sectionsRouter({ name: "s", stretch })
    .route(g)
    .routes.reduce((s, r) => s + polylineLength(r.points), 0);

describe("sectionsRouter", () => {
  it("gives the edges between two far groups one shared way", () => {
    const result = sectionsRouter({ name: "sections", cap: 2 }).route(groups);
    expect(checkProperties(groups, result)).toEqual([]);
    const widest = [...(result.runs ?? [])].sort((p, q) => q.edges.length - p.edges.length)[0];
    expect([...(widest?.edges ?? [])].sort()).toEqual(["e00", "e01", "e10", "e11"]);
  });

  it("keeps the hard rules on generated graphs, without routes that go out and back (property, 5 kinds × 3 seeds)", () => {
    const kinds: FixtureKind[] = ["uniform", "clustered", "grid", "hubs", "collections"];
    for (const stretch of [2, Infinity]) {
      for (const kind of kinds) {
        for (let seed = 1; seed <= 3; seed++) {
          const g = makeFixture({ name: "t", kind, nodes: 120, edgesPerNode: 2, seed, fixedPorts: 0.2 });
          const result = sectionsRouter({ name: "sections", stretch }).route(g);
          const tag = `${stretch} ${kind} ${seed}`;
          expect(checkProperties(g, result), tag).toEqual([]);
          expect(measureRouteFaults(g, result).backtrack, tag).toBe(0);
          const levels = result.levels ?? [];
          expect(levels).toHaveLength(treeDepth(buildSections(g.nodes)) + 2);
          // The first level is one item with all the nodes. The last level shows each node alone.
          expect(levels[0]!.items).toHaveLength(1);
          expect(levels[0]!.links).toHaveLength(0);
          expect(levels[levels.length - 1]!.items).toHaveLength(g.nodes.length);
          if (stretch === Infinity) expect((result.runs ?? []).length, tag).toBeGreaterThan(0);
        }
      }
    }
  });

  it("gives shorter routes with a stretch limit, and less ink than the corner router without one", () => {
    const g = makeFixture({ name: "t", kind: "collections", nodes: 150, edgesPerNode: 2, seed: 9 });
    expect(length(g, 2)).toBeLessThan(length(g, Infinity));
    const corners = measureQuality(g, cornersRouter({ name: "corners" }).route(g)).ink;
    const tree = measureQuality(g, sectionsRouter({ name: "sections-tree", stretch: Infinity }).route(g)).ink;
    expect(tree).toBeLessThan(corners);
  });

  it("gives the same result for the same input", () => {
    const g = makeFixture({ name: "t", kind: "hubs", nodes: 100, edgesPerNode: 3, seed: 4 });
    const router = sectionsRouter({ name: "sections" });
    expect(JSON.stringify(router.route(g))).toBe(JSON.stringify(router.route(g)));
  });
});
