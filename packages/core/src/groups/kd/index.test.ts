import { describe, expect, it } from "vitest";
import { checkLevels } from "../../bench/properties.ts";
import { balance, farLevel } from "../../bench/measures/index.ts";
import { nestingFaults } from "../../bench/measures/levels.ts";
import { CASES, nestedGridBoard } from "../../cases.ts";
import { FIXTURES, makeFixture } from "../../fixtures.ts";
import type { Box } from "../../geom.ts";
import type { Graph, Node } from "../../model.ts";
import { sectionsRouter } from "../../routers/sections.ts";
import { allSections, checkSections, levelCut, type Section } from "../../sections.ts";
import { groupStrategies } from "../../strategies/builtins.ts";
import { KD_DEFAULTS, kdGroups, type KdOptions } from "./index.ts";

const fixture = (name: string): Graph => makeFixture(FIXTURES.find((f) => f.name === name)!);
const boards: [string, Graph][] = [
  ["tiny-uniform", fixture("tiny-uniform")],
  ["small-clustered", fixture("small-clustered")],
  ...CASES.map((c): [string, Graph] => [c.name, c.make()]),
  ["nested-grid", nestedGridBoard()],
];

/** This function tells if the box `a` is inside the box `b`, within a small tolerance. */
const inside = (a: Box, b: Box): boolean => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;

/** This function gives the area of the overlap of two boxes. */
const overlap = (a: Box, b: Box): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** This function examines the cells of a tree: each child cell is in the cell of its parent, and the cells of two siblings do not overlap. */
function expectNestedCells(root: Section): void {
  for (const s of allSections(root)) {
    for (const c of s.children) expect(inside(c.cell, s.cell), c.id).toBe(true);
    for (let i = 0; i < s.children.length; i++) for (let j = i + 1; j < s.children.length; j++) expect(overlap(s.children[i]!.cell, s.children[j]!.cell)).toBeLessThan(1e-6);
  }
}

/** A made-up board of `n` boxes in one row. */
function row(n: number, at: (i: number) => number = (i) => i * 20): Graph {
  const nodes: Node[] = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, box: { x: at(i), y: 0, w: 10, h: 10 } }));
  return { nodes, edges: [] };
}

describe("the grouping rule kd", () => {
  const settings: KdOptions[] = [];
  for (const line of ["median", "middle", "slide"] as const) for (const fanout of [2, 4]) for (const axis of ["longer", "alternate"] as const) settings.push({ line, fanout, axis });

  it("gives a valid tree with nested cells on each board, for each line, fan-out and axis", () => {
    for (const [name, graph] of boards)
      for (const o of settings) {
        const tree = kdGroups(graph, o);
        expect(() => checkSections(tree, graph.nodes.length), `${name} ${JSON.stringify(o)}`).not.toThrow();
        expectNestedCells(tree);
        for (const s of allSections(tree)) {
          expect(s.children.length === 0 || s.children.length >= 2).toBe(true);
          expect(s.children.length).toBeLessThanOrEqual(o.fanout!);
          if (s.children.length === 0 && s.depth < KD_DEFAULTS.maxDepth && o.line !== "middle") expect(s.nodes.length).toBeLessThanOrEqual(KD_DEFAULTS.cap);
        }
      }
  });

  it("gives levels that nest and pass the hard rules of the levels in the router sections", () => {
    for (const [name, graph] of boards) {
      const result = sectionsRouter({ name: "kd", group: groupStrategies.kd }).route(graph);
      expect(checkLevels(graph, result.levels ?? []), name).toEqual([]);
      expect(nestingFaults(result.levels ?? []), name).toBe(0);
    }
  });

  it("puts half of the nodes on each side with the line median", () => {
    const graph = fixture("small-clustered");
    const tree = kdGroups(graph, { line: "median", fanout: 2 });
    for (const s of allSections(tree)) if (s.children.length === 2) expect(Math.abs(s.children[0]!.nodes.length - s.children[1]!.nodes.length)).toBeLessThanOrEqual(1);
    const far = farLevel(sectionsRouter({ name: "kd", group: groupStrategies.kd, groupOptions: { line: "median" } }).route(graph).levels ?? [])!;
    expect(far.items).toHaveLength(4);
    expect(balance(far)).toBeGreaterThan(0.999);
  });

  it("gives four items at the far view with the fan-out 4, and two with the fan-out 2", () => {
    const graph = fixture("small-clustered");
    expect(levelCut(graph.nodes, kdGroups(graph), 1).items).toHaveLength(4);
    expect(levelCut(graph.nodes, kdGroups(graph, { fanout: 2 }), 1).items).toHaveLength(2);
  });

  it("slides a line with an empty side to the nearest node, and shrinks the cell with the line middle", () => {
    // Nine boxes on the left and one box far to the right: the middle of the row has no box on its left side after the first split.
    const graph = row(10, (i) => (i < 9 ? i * 12 : 1000));
    const slide = kdGroups(graph, { cap: 1, fanout: 2, maxDepth: 2 });
    expect(slide.children.map((c) => c.nodes.length)).toEqual([9, 1]);
    const left = slide.children[0]!;
    // The middle of the cell of the nine boxes is right of each box. The line slides to the last box.
    expect(left.children.map((c) => c.nodes.length)).toEqual([8, 1]);
    const middle = kdGroups(graph, { cap: 1, fanout: 2, maxDepth: 2, line: "middle" });
    expect(middle.children[0]!.children.map((c) => c.nodes.length).reduce((a, b) => a + b, 0)).toBe(9);
    expect(middle.children[0]!.children.length).toBe(2);
    expect(() => checkSections(middle, 10)).not.toThrow();
  });

  it("cuts across the longer side, or across x and y in turn", () => {
    const graph = row(16);
    const longer = kdGroups(graph, { cap: 1, fanout: 2, maxDepth: 1 });
    expect(longer.children.map((c) => c.cell.h)).toEqual([10, 10]);
    const alternate = kdGroups(graph, { cap: 1, fanout: 2, maxDepth: 2, axis: "alternate" });
    // The second split is across y, but each box of the row is at one y. The split takes the other axis.
    expect(alternate.children.every((c) => c.children.length === 2)).toBe(true);
  });

  it("stops at boxes with one center, and gives the same tree twice", () => {
    const same = row(12, () => 0);
    for (const o of settings) expect(() => checkSections(kdGroups(same, o), 12)).not.toThrow();
    expect(kdGroups(same).children).toEqual([]);
    expect(kdGroups(same, { line: "median" }).children.length).toBeGreaterThan(1);
    const graph = fixture("small-clustered");
    expect(kdGroups(graph)).toEqual(kdGroups(graph));
    expect(kdGroups({ nodes: [], edges: [] }).nodes).toEqual([]);
  });

  it("is the strategy kd of the step group, with the declared defaults", () => {
    const graph = fixture("small-clustered");
    expect(groupStrategies.kd.defaults).toEqual(KD_DEFAULTS);
    expect(groupStrategies.kd.run(graph)).toEqual(kdGroups(graph));
    expect(groupStrategies.kd.run(graph, { line: "median", fanout: 2 })).toEqual(kdGroups(graph, { line: "median", fanout: 2 }));
  });
});
