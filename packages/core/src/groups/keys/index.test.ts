import { describe, expect, it } from "vitest";
import type { Graph, Node } from "../../model.ts";
import { sectionsRouter } from "../../routers/sections.ts";
import { allSections, checkSections, type Section } from "../../sections.ts";
import { groupStrategies } from "../../strategies/builtins.ts";
import { defineStrategy } from "../../strategies/model.ts";
import { byDataGroup, keyedSections, keyGroups } from "./index.ts";

/** A made-up board: three teams of six cards, in rows that mix the teams. Each card links to the next card and to a card two rows down. */
function teamBoard(): Graph {
  const teams = ["red", "green", "blue"];
  const nodes: Node[] = [];
  for (let i = 0; i < 18; i++) nodes.push({ id: `card${i}`, box: { x: (i % 6) * 120, y: Math.floor(i / 6) * 80, w: 90, h: 40 }, data: { team: teams[i % 3] } });
  const edges = nodes.flatMap((n, i) => [
    ...(i + 1 < nodes.length ? [{ id: `n${i}`, source: { node: n.id }, target: { node: nodes[i + 1]!.id } }] : []),
    ...(i + 12 < nodes.length ? [{ id: `d${i}`, source: { node: n.id }, target: { node: nodes[i + 12]!.id } }] : []),
  ]);
  return { nodes, edges };
}

describe("the grouping rule keys", () => {
  it("lets a consumer group the nodes by a field of its own, in a rule of a few lines (the example of the README)", () => {
    const byTeam = defineStrategy({
      step: "group",
      name: "team",
      describe: "One group for each team.",
      defaults: {},
      run: (graph) => keyedSections(graph.nodes, { key: (n) => String(n.data?.["team"]) }),
    });
    const result = sectionsRouter({ name: "teams", group: byTeam }).route(teamBoard());
    const far = result.levels!.find((l) => l.items.length > 1)!;
    expect(far.items.map((i) => i.id)).toEqual(["s:red", "s:green", "s:blue"]);
    expect(far.items.map((i) => i.nodes.length)).toEqual([6, 6, 6]);
    // The levels: the board as one item, the three teams, and each card alone.
    expect(result.levels!.map((l) => l.items.length)).toEqual([1, 3, 18]);
    expect(result.routes).toHaveLength(teamBoard().edges.length);
  });

  it("reads the string data.group by default, and puts a node without a key in a group alone", () => {
    const nodes: Node[] = [
      { id: "a", box: { x: 0, y: 0, w: 10, h: 10 }, data: { group: "left" } },
      { id: "b", box: { x: 0, y: 40, w: 10, h: 10 }, data: { group: "left" } },
      { id: "c", box: { x: 90, y: 0, w: 10, h: 10 }, data: { group: 7 } },
      { id: "d", box: { x: 90, y: 40, w: 10, h: 10 } },
    ];
    expect(nodes.map((n, i) => byDataGroup(n, i))).toEqual(["left", "left", undefined, undefined]);
    const root = keyedSections(nodes);
    expect(root.children.map((c) => [c.id, c.nodes])).toEqual([
      ["s:left", [0, 1]],
      ["s#2", [2]],
      ["s#3", [3]],
    ]);
    expect(root.children[0]!.cell).toEqual({ x: 0, y: 0, w: 10, h: 50 });
    expect(() => checkSections(root, nodes.length)).not.toThrow();
    expect(groupStrategies.keys.run({ nodes, edges: [] })).toEqual(root);
  });

  it("gives a group in a group for each part of a key path with the option nest (KEYS-PATH)", () => {
    // Made-up keys: two outer groups, inner groups in G1, a node with the key of G1 itself, an empty part and a node without a key.
    const keys = ["G1/g1", "G2", "G1/g2", "G1", "G1/g1", undefined, "G2/", "G1//g2"];
    const nodes: Node[] = keys.map((k, i) => ({ id: `n${i}`, box: { x: i * 30, y: (i % 3) * 30, w: 20, h: 20 }, ...(k === undefined ? {} : { data: { group: k } }) }));
    const root = keyedSections(nodes, { nest: true });
    expect(() => checkSections(root, nodes.length)).not.toThrow();
    const shape = (s: Section): unknown => (s.children.length ? [s.id, s.depth, s.children.map(shape)] : [s.id, s.depth, s.nodes]);
    expect(root.children.map(shape)).toEqual([
      ["s:G1", 1, [["s:G1/g1", 2, [0, 4]], ["s:G1/g2", 2, [2, 7]], ["s:G1/", 2, [3]]]],
      ["s:G2", 1, [1, 6]],
      ["s#5", 1, [5]],
    ]);
    expect(root.children[0]!.nodes).toEqual([0, 2, 3, 4, 7]);
    expect(groupStrategies.keys.run({ nodes, edges: [] }, { nest: true })).toEqual(root);
    // Without nest, each key stays one group at depth 1, as before.
    expect(keyedSections(nodes).children.map((c) => c.id)).toEqual(["s:G1/g1", "s:G2", "s:G1/g2", "s:G1", "s#5", "s:G2/", "s:G1//g2"]);
    // With split, a large inner group splits below its own depth.
    const big: Node[] = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, box: { x: (i % 4) * 50, y: Math.floor(i / 4) * 50, w: 20, h: 20 }, data: { group: `G${i % 2}/g${i % 3}` } }));
    const tree = keyedSections(big, { nest: true, split: { cap: 1 } });
    expect(() => checkSections(tree, big.length)).not.toThrow();
    const deep = allSections(tree).filter((s) => s.depth === 3);
    expect(deep.length).toBeGreaterThan(0);
    expect(deep.every((s) => /^s:G[01]\/g[012]\/./.test(s.id))).toBe(true);
    expect(sectionsRouter({ name: "nest", group: groupStrategies.keys, groupOptions: { nest: true } }).route({ nodes: big, edges: [{ id: "e", source: { node: "b0" }, target: { node: "b11" } }] }).levels!.length).toBeGreaterThan(2);
  });

  it("splits a large group into a quadtree with the option split", () => {
    const graph = teamBoard();
    const key = (n: Node): string => String(n.data?.["team"]);
    const root = keyGroups(graph, { key, split: { cap: 2 } });
    expect(() => checkSections(root, graph.nodes.length)).not.toThrow();
    const sections = allSections(root);
    expect(sections.filter((s) => s.depth === 1).map((s) => s.id)).toEqual(["s:red", "s:green", "s:blue"]);
    expect(sections.some((s) => s.depth > 1 && s.id.startsWith("s:red/"))).toBe(true);
    for (const s of sections) if (s.children.length === 0) expect(s.nodes.length).toBeLessThanOrEqual(2);
    expect(sectionsRouter({ name: "split", group: groupStrategies.keys, groupOptions: { key, split: { cap: 2 } } }).route(graph).levels!.length).toBeGreaterThan(3);
  });
});
