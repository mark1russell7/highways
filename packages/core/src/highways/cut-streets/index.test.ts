import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { cutGroups } from "../../groups/cut/index.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { box, clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { CUT_STREET_DEFAULTS, cutLines, cutStreetPlan, streetGraph } from "./index.ts";

/** Two blocks of four boxes, on the left and on the right, and four edges from each box of the left block to a box of the right block. */
const blocks: Graph = {
  nodes: [0, 1, 2, 3].flatMap((i) => [
    { id: `l${i}`, box: box(0, 60 * i) },
    { id: `r${i}`, box: box(600, 60 * i) },
  ]),
  edges: [0, 1, 2, 3].map((i) => ({ id: `e${i}`, source: { node: `l${i}` }, target: { node: `r${3 - i}` } })),
};

describe("the highway strategy cut-streets (WILD-035)", () => {
  it("gives the cut lines of the tree inside the cells of their parents", () => {
    const root = cutGroups(clustered);
    const lines = cutLines(root, 2);
    expect(lines.length).toBeGreaterThan(0);
    const c = root.cell;
    for (const l of lines) {
      expect(l.hi).toBeGreaterThan(l.lo);
      if (l.axis === "x") expect(l.c).toBeGreaterThan(c.x);
      else expect(l.c).toBeGreaterThan(c.y);
    }
    expect(cutLines(root, 1).length).toBeLessThanOrEqual(lines.length);
  });

  it("makes a node where two streets cross", () => {
    const g = streetGraph([
      { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } },
      { a: { x: 40, y: 0 }, b: { x: 40, y: 100 } },
    ]);
    expect(g.points).toContainEqual({ x: 40, y: 50 });
    expect(g.points.length).toBe(5);
    const mid = g.points.findIndex((p) => p.x === 40 && p.y === 50);
    expect(g.adj[mid]!.length).toBe(4);
  });

  it("gives a plan whose highways follow the streets, with routes with no break of a hard rule", () => {
    for (const graph of [blocks, clustered]) {
      const plan = cutStreetPlan({ graph }, CUT_STREET_DEFAULTS);
      expect(checkPlan(graph, plan)).toEqual([]);
      expect(checkProperties(graph, follow(graph, plan), 1_000_000)).toEqual([]);
    }
  });

  it("makes no highway for edges with a straight line of sight", () => {
    expect(cutStreetPlan({ graph: parallel }, CUT_STREET_DEFAULTS).highways).toEqual([]);
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies["cut-streets"], CUT_STREET_DEFAULTS)).toEqual([]);
  });

  commonTests("cut-streets", CUT_STREET_DEFAULTS, cutStreetPlan, [flows, blocks]);
});
