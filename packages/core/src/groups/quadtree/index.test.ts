import { describe, expect, it } from "vitest";
import { FIXTURES, makeFixture } from "../../fixtures.ts";
import { buildSections, checkSections } from "../../sections.ts";
import { groupStrategies, STRATEGIES } from "../../strategies/builtins.ts";
import { listStrategies } from "../../strategies/model.ts";
import { quadtreeGroups } from "./index.ts";

describe("the grouping rule quadtree", () => {
  const graph = makeFixture(FIXTURES.find((f) => f.name === "small-clustered")!);

  it("gives the tree of buildSections, with its options", () => {
    expect(quadtreeGroups(graph)).toEqual(buildSections(graph.nodes));
    expect(quadtreeGroups(graph, { cap: 4 })).toEqual(buildSections(graph.nodes, { cap: 4 }));
    expect(groupStrategies.quadtree.run(graph)).toEqual(buildSections(graph.nodes));
    expect(groupStrategies.quadtree.run(graph, { cap: 4, maxDepth: 2 })).toEqual(buildSections(graph.nodes, { cap: 4, maxDepth: 2 }));
    expect(() => checkSections(quadtreeGroups(graph), graph.nodes.length)).not.toThrow();
  });

  it("is the first strategy of the step group in the registry", () => {
    expect(listStrategies(STRATEGIES, "group").map((s) => s.name)).toEqual(["quadtree", "keys"]);
  });
});
