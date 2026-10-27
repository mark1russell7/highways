import { describe, expect, it } from "vitest";
import type { Graph, Node } from "../../model.ts";
import { sectionsRouter } from "../../routers/sections.ts";
import { allSections, checkSections } from "../../sections.ts";
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
