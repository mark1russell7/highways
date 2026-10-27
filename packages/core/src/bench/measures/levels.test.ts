import { describe, expect, it } from "vitest";
import type { Box } from "../../geom.ts";
import type { Graph, Level } from "../../model.ts";
import type { Section } from "../../sections.ts";
import { cutShare, farLevel, groupStability, leafGroups, levelGrouping, modularity, treeCost } from "./groups.ts";
import { nestingFaults, orderStability, positionStability } from "./levels.ts";

const B = (x: number, y: number, w = 10, h = 10): Box => ({ x, y, w, h });
const item = (id: string, box: Box, ...nodes: string[]) => ({ id, box, nodes });
const level = (depth: number, ...items: ReturnType<typeof item>[]): Level => ({ depth, items, links: [] });

// Four cards in a square: a and b on top, c and d below.
const square: Graph = {
  nodes: [
    { id: "a", box: B(0, 0) },
    { id: "b", box: B(20, 0) },
    { id: "c", box: B(0, 20) },
    { id: "d", box: B(20, 20) },
  ],
  edges: [],
};
const leaves = level(2, item("a", B(0, 0), "a"), item("b", B(20, 0), "b"), item("c", B(0, 20), "c"), item("d", B(20, 20), "d"));
const levels: Level[] = [level(0, item("root", B(0, 0, 30, 30), "a", "b", "c", "d")), level(1, item("top", B(0, 0, 30, 10), "a", "b"), item("bottom", B(0, 20, 30, 10), "c", "d")), leaves];

describe("the measures of the levels (Z6, Z7, Z8)", () => {
  it("level-nesting: counts the items whose nodes come from two coarser items", () => {
    expect(nestingFaults(levels)).toBe(0);
    const crossed = [levels[0]!, levels[1]!, level(2, item("ac", B(0, 0, 10, 30), "a", "c"), item("b", B(20, 0), "b"), item("d", B(20, 20), "d"))];
    expect(nestingFaults(crossed)).toBe(1);
  });

  it("Z7: gives the mean move of a node from its item to its finer item, over the size of the item", () => {
    // Each move is 10 units, and each item has a size of 30.
    expect(positionStability(levels)).toBeCloseTo(1 / 3);
  });

  it("Z8: gives 1 when the groups keep the order of their nodes, and less when they swap", () => {
    expect(orderStability(square, levels)).toBe(1);
    const swapped = [levels[0]!, level(1, item("top", B(0, 20, 30, 10), "a", "b"), item("bottom", B(0, 0, 30, 10), "c", "d")), leaves];
    // On y the order is the inverse (-1). On x each item has the same center, so the order is not broken (1).
    expect(orderStability(square, swapped)).toBe(0);
  });
});

// Two triangles and one bridge between them.
const triangles: Graph = {
  nodes: ["1", "2", "3", "4", "5", "6"].map((id, i) => ({ id, box: B(i * 20, 0) })),
  edges: [
    ["1", "2"],
    ["2", "3"],
    ["1", "3"],
    ["4", "5"],
    ["5", "6"],
    ["4", "6"],
    ["3", "4"],
  ].map(([s, t], i) => ({ id: `e${i}`, source: { node: s! }, target: { node: t! } })),
};
const triangleLevels: Level[] = [
  level(0, item("root", B(0, 0, 110, 10), "1", "2", "3", "4", "5", "6")),
  level(1, item("A", B(0, 0, 50, 10), "1", "2", "3"), item("B", B(60, 0, 50, 10), "4", "5", "6")),
  level(2, ...triangles.nodes.map((n) => item(n.id, n.box, n.id))),
];

describe("the measures of the groups (G1, G2, G8, G9)", () => {
  const groups = levelGrouping(farLevel(triangleLevels)!);

  it("G1 and G2: give the modularity and the cut share of the far level", () => {
    expect(farLevel(triangleLevels)!.depth).toBe(1);
    // Q = 2 · (3/7 - (7/14)²).
    expect(modularity(triangles, groups)).toBeCloseTo(5 / 14);
    expect(cutShare(triangles, groups)).toBeCloseTo(1 / 7);
    // One group for each node gives no edge inside a group.
    expect(cutShare(triangles, new Map())).toBe(1);
  });

  it("G8: gives the leaves of the smallest item that holds both ends of each edge, over m · n", () => {
    // Six edges inside a triangle (3 leaves) and the bridge (6 leaves).
    expect(treeCost(triangles, triangleLevels)).toBeCloseTo((6 * 3 + 6) / (7 * 6));
  });

  it("G9: gives 1 for the same leaves and less for other leaves", () => {
    const section = (id: string, nodes: number[], children: Section[] = []): Section => ({ id, depth: id.length - 1, cell: B(0, 0), nodes, children });
    const before = section("s", [0, 1, 2, 3, 4, 5], [section("s0", [0, 1, 2]), section("s1", [3, 4, 5])]);
    const after = section("s", [0, 1, 2, 3, 4, 5], [section("s0", [0, 1]), section("s1", [2, 3]), section("s2", [4, 5])]);
    expect(leafGroups(after, 6)).toEqual(["s0", "s0", "s1", "s1", "s2", "s2"]);
    expect(groupStability(before, before, 6)).toBe(1);
    // The adjusted Rand index of {012, 345} and {01, 23, 45} is (2 - 1.2) / (4.5 - 1.2).
    expect(groupStability(before, after, 6)).toBeCloseTo(0.8 / 3.3);
  });
});
