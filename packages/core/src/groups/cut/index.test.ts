import { describe, expect, it } from "vitest";
import { checkLevels } from "../../bench/properties.ts";
import { nestingFaults } from "../../bench/measures/levels.ts";
import { CASES, nestedGridBoard } from "../../cases.ts";
import { FIXTURES, makeFixture } from "../../fixtures.ts";
import type { Edge, Graph, Node } from "../../model.ts";
import { sectionsRouter } from "../../routers/sections.ts";
import { allSections, buildSections, checkSections, type Section } from "../../sections.ts";
import { groupStrategies } from "../../strategies/builtins.ts";
import { CUT_DEFAULTS, cutGroups, type CutOptions } from "./index.ts";

const fixture = (name: string): Graph => makeFixture(FIXTURES.find((f) => f.name === name)!);
const boards: [string, Graph][] = [
  ["tiny-uniform", fixture("tiny-uniform")],
  ["small-clustered", fixture("small-clustered")],
  ...CASES.map((c): [string, Graph] => [c.name, c.make()]),
  ["nested-grid", nestedGridBoard()],
];

/** This function counts the edges with their ends in two different children of the root. */
function rootCut(graph: Graph, root: Section): number {
  const owner = new Map<string, number>();
  root.children.forEach((c, k) => {
    for (const i of c.nodes) owner.set(graph.nodes[i]!.id, k);
  });
  return graph.edges.filter((e) => owner.get(e.source.node) !== owner.get(e.target.node)).length;
}

/** A made-up board: two clusters of `n` boxes each, with a wide gap between them. Each cluster is a chain of links. */
function twoClusters(n: number): Graph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (const [side, x0] of [
    ["a", 0],
    ["b", 600],
  ] as const) {
    for (let i = 0; i < n; i++) {
      nodes.push({ id: `${side}${i}`, box: { x: x0 + (i % 4) * 30, y: Math.floor(i / 4) * 30, w: 20, h: 20 } });
      if (i > 0) edges.push({ id: `${side}${i - 1}-${side}${i}`, source: { node: `${side}${i - 1}` }, target: { node: `${side}${i}` } });
    }
  }
  return { nodes, edges };
}

describe("the grouping rule cut", () => {
  const settings: CutOptions[] = [];
  for (const objective of ["ratio", "normalized", "sparsest"] as const) for (const fanout of [2, 4]) for (const guard of [true, false]) settings.push({ objective, fanout, guard });

  it("gives a valid tree on each board, for each objective, fan-out and guard", () => {
    for (const [name, graph] of boards)
      for (const o of settings) {
        const tree = cutGroups(graph, o);
        expect(() => checkSections(tree, graph.nodes.length), `${name} ${JSON.stringify(o)}`).not.toThrow();
        for (const s of allSections(tree)) {
          expect(s.children.length === 0 || s.children.length >= 2).toBe(true);
          expect(s.children.length).toBeLessThanOrEqual(o.fanout!);
        }
      }
  });

  it("gives levels that nest and pass the hard rules of the levels in the router sections", () => {
    for (const [name, graph] of boards) {
      const result = sectionsRouter({ name: "cut", group: groupStrategies.cut }).route(graph);
      // On the board `nested-grid`, the router `sections` gives link ends off the item boundaries with each rule, the quadtree too. This test checks only the counts there.
      const faults = checkLevels(graph, result.levels ?? []).filter((v) => name !== "nested-grid" || v.rule !== "link-ends");
      expect(faults, name).toEqual([]);
      expect(nestingFaults(result.levels ?? []), name).toBe(0);
    }
  });

  it("cuts no more edges at the root than the quadtree when the guard is on", () => {
    for (const [name, graph] of boards) {
      const quad = rootCut(graph, buildSections(graph.nodes));
      expect(rootCut(graph, cutGroups(graph)), name).toBeLessThanOrEqual(quad);
    }
  });

  it("puts the line through the gap between two clusters, and cuts no edge there", () => {
    const graph = twoClusters(20);
    const tree = cutGroups(graph, { fanout: 2, guard: false });
    expect(rootCut(graph, tree)).toBe(0);
    expect(tree.children.map((c) => c.nodes.length)).toEqual([20, 20]);
  });

  it("keeps at least the share `balance` of the nodes in each part of a split", () => {
    const graph = fixture("small-clustered");
    for (const balance of [0.1, 0.25, 0.4]) {
      const tree = cutGroups(graph, { fanout: 2, guard: false, balance });
      for (const s of allSections(tree)) for (const c of s.children) expect(c.nodes.length).toBeGreaterThanOrEqual(Math.min(Math.ceil(balance * s.nodes.length), Math.floor(s.nodes.length / 2)));
    }
  });

  it("puts the line near the middle of the cell with a large pull", () => {
    // A row of evenly spaced boxes without links: each line cuts no edge, so the pull alone picks the line.
    const nodes: Node[] = Array.from({ length: 21 }, (_, i) => ({ id: `r${i}`, box: { x: i * 20, y: 0, w: 10, h: 10 } }));
    const tree = cutGroups({ nodes, edges: [] }, { fanout: 2, guard: false, pull: 4, cap: 1, maxDepth: 1 });
    const [a, b] = tree.children.map((c) => c.nodes.length);
    expect(Math.abs(a! - b!)).toBeLessThanOrEqual(1);
  });

  it("works with no nodes, one node and boxes with one center, and gives the same tree twice", () => {
    expect(cutGroups({ nodes: [], edges: [] }).nodes).toEqual([]);
    const one = cutGroups({ nodes: [{ id: "a", box: { x: 0, y: 0, w: 10, h: 10 } }], edges: [] });
    expect(one.nodes).toEqual([0]);
    expect(one.children).toEqual([]);
    const same: Node[] = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, box: { x: 5, y: 5, w: 10, h: 10 } }));
    for (const o of settings) {
      const tree = cutGroups({ nodes: same, edges: [] }, o);
      expect(() => checkSections(tree, 12)).not.toThrow();
      expect(tree.children).toEqual([]);
    }
    const graph = fixture("small-clustered");
    expect(cutGroups(graph)).toEqual(cutGroups(graph));
  });

  it("is the strategy cut of the step group, with the declared defaults", () => {
    const graph = fixture("small-clustered");
    expect(groupStrategies.cut.defaults).toEqual(CUT_DEFAULTS);
    expect(groupStrategies.cut.run(graph)).toEqual(cutGroups(graph));
    expect(groupStrategies.cut.run(graph, { objective: "sparsest", fanout: 2 })).toEqual(cutGroups(graph, { objective: "sparsest", fanout: 2 }));
  });
});
