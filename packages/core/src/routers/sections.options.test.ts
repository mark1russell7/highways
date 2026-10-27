import { describe, expect, it } from "vitest";
import { sameData } from "../bench/run.ts";
import { CASES } from "../cases.ts";
import { LEVEL_LINK_DEFAULTS } from "../levels.ts";
import type { Graph } from "../model.ts";
import { PICK } from "../pick.ts";
import { buildSections, SECTION_DEFAULTS, type Section } from "../sections.ts";
import { groupStrategies } from "../strategies/builtins.ts";
import { defineStrategy } from "../strategies/model.ts";
import { sectionsRouter, SECTIONS_DEFAULTS } from "./sections.ts";

const board = (name: string): Graph => CASES.find((c) => c.name === name)!.make();

describe("the options of the levels (CUSTOM)", () => {
  it("gives each fixed number of the levels a name and a default", () => {
    // The hub limit, the slack of the hubs, the section limit, the depth limit, the collapse limit and the limits of the level links.
    expect(SECTIONS_DEFAULTS).toEqual({
      cap: 8,
      maxDepth: 16,
      collapse: 32,
      tightMargin: 1,
      plugInset: 6,
      hubs: Infinity,
      stretch: 2,
      stretchPad: 4,
      hubSlack: 80,
    });
    expect(SECTION_DEFAULTS).toEqual({ cap: 8, maxDepth: 16, collapse: 32 });
    expect(LEVEL_LINK_DEFAULTS).toEqual({ tightMargin: 1, plugInset: 6 });
    // The far-view thresholds of `pickLevel`.
    expect(PICK).toEqual({ routesAt: 22, itemAt: 120 });
    expect(groupStrategies.quadtree.defaults).toEqual(SECTION_DEFAULTS);
    for (const frozen of [SECTIONS_DEFAULTS, SECTION_DEFAULTS, LEVEL_LINK_DEFAULTS, PICK]) expect(Object.isFrozen(frozen)).toBe(true);
  });

  it("gives the same output with the defaults written out, and with the grouping rule quadtree", () => {
    for (const c of CASES) {
      const g = c.make();
      const plain = sectionsRouter({ name: "sections" }).route(g);
      expect(sameData(sectionsRouter({ name: "sections", ...SECTIONS_DEFAULTS }).route(g), plain), c.name).toBe(true);
      expect(sameData(sectionsRouter({ name: "sections", group: groupStrategies.quadtree }).route(g), plain), c.name).toBe(true);
      const levels = plain.levels!.map((l) => l.depth);
      expect(sameData(sectionsRouter({ name: "sections", levels: levels.slice(0, -1) }).route(g), plain), c.name).toBe(true);
    }
  });

  it("gives the quadtree its options through groupOptions", () => {
    const g = board("case-dense-groups");
    const a = sectionsRouter({ name: "a", cap: 16, maxDepth: 3 }).route(g);
    const b = sectionsRouter({ name: "a", group: groupStrategies.quadtree, groupOptions: { cap: 16, maxDepth: 3 } }).route(g);
    expect(sameData(a, b)).toBe(true);
    expect(a.levels!.length).toBeLessThanOrEqual(5);
  });

  it("keeps only the depths of the option levels, then the level of single nodes", () => {
    const g = board("case-many-groups");
    const all = sectionsRouter({ name: "sections" }).route(g).levels!;
    const some = sectionsRouter({ name: "sections", levels: [1, 2] }).route(g).levels!;
    expect(some.map((l) => l.depth)).toEqual([1, 2, all[all.length - 1]!.depth]);
    expect(sameData(some[0], all[1])).toBe(true);
    expect(sectionsRouter({ name: "sections", levels: [] }).route(g).levels!).toHaveLength(1);
  });

  it("stops a cell that shrinks more times than collapse", () => {
    // Nine nodes near the origin and one node far away. The near cell shrinks four times before it splits.
    const node = (id: string, x: number, y: number) => ({ id, box: { x, y, w: 40, h: 20 } });
    const nodes = [...Array.from({ length: 9 }, (_, i) => node(`n${i}`, (i % 3) * 50, Math.floor(i / 3) * 30)), node("far", 2000, 2000)];
    expect(buildSections(nodes, { cap: 4 }).children[0]!.children.length).toBeGreaterThan(0);
    expect(buildSections(nodes, { cap: 4, collapse: 2 }).children[0]!.children).toHaveLength(0);
  });

  it("refuses a grouping rule whose tree loses a node", () => {
    const broken = defineStrategy({
      step: "group",
      name: "broken",
      describe: "A test rule: the root has each node, but its one leaf has only the first node.",
      defaults: {},
      run: (graph): Section => {
        const all = graph.nodes.map((_, i) => i);
        const cell = { x: 0, y: 0, w: 1, h: 1 };
        return { id: "s", depth: 0, cell, nodes: all, children: [{ id: "s0", depth: 1, cell, nodes: [0], children: [] }] };
      },
    });
    expect(() => sectionsRouter({ name: "x", group: broken }).route(board("case-hub-chain"))).toThrow(/not valid/);
  });
});
