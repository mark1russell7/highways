import { describe, expect, it } from "vitest";
import { boxesOverlap, measureLevelFaults } from "../../bench/links.ts";
import { benchLevelRoom, orderChanges } from "../../bench/room.ts";
import { CASES, nestedGridBoard, packedGridBoard } from "../../cases.ts";
import type { Node } from "../../model.ts";
import { sectionsRouter } from "../../routers/sections.ts";
import { buildSections, levelCut, treeDepth } from "../../sections.ts";
import { roomStrategies } from "../../strategies/builtins.ts";
import { openGaps, roomLinks } from "../index.ts";
import { levelPairs, levelRoom } from "./index.ts";

const nested = nestedGridBoard();
const root = buildSections(nested.nodes);
const links = roomLinks(nested);
const shared = levelRoom(nested.nodes, links, root, { gutter: 8, spacing: 4 });
const each = levelRoom(nested.nodes, links, root, { gutter: 8, spacing: 4, board: "each" });

const boxes = (nodes: readonly Node[]) => nodes.map((n) => n.box);

describe("levelCut", () => {
  it("gives the items of the levels of the router `sections`", () => {
    for (const c of CASES) {
      const graph = c.make();
      const tree = buildSections(graph.nodes);
      const levels = sectionsRouter({ name: "sections" }).route(graph).levels ?? [];
      for (const level of levels) expect(levelCut(graph.nodes, tree, level.depth).items, `${c.name} ${level.depth}`).toEqual(level.items);
    }
  });
});

describe("levelRoom (ROOM2)", () => {
  it("makes the nested grid a board with three levels of groups", () => {
    expect(treeDepth(root)).toBe(3);
    expect(shared.levels.map((l) => l.items.length)).toEqual([1, 4, 16, 64, 256]);
    expect(shared.levels.map((l) => l.gaps.length > 0)).toEqual([false, true, true, true, false]);
  });

  it("opens the far levels first, and a nearer level only adds growth", () => {
    expect(each.levels[0]!.nodes).toEqual(nested.nodes);
    for (let d = 1; d < each.levels.length; d++) {
      const before = each.levels[d - 1]!.nodes;
      each.levels[d]!.nodes.forEach((n, i) => {
        expect(n.box.x).toBeGreaterThanOrEqual(before[i]!.box.x);
        expect(n.box.y).toBeGreaterThanOrEqual(before[i]!.box.y);
        expect([n.box.w, n.box.h]).toEqual([before[i]!.box.w, before[i]!.box.h]);
      });
    }
    expect(each.items).toEqual(shared.items);
  });

  it("keeps the order and the alignment of the boxes at each level, and makes no overlap", () => {
    for (const room of [shared, each])
      for (const level of room.levels) {
        expect(orderChanges(boxes(nested.nodes), boxes(level.nodes))).toBe(0);
        expect(orderChanges(levelCut(nested.nodes, root, level.depth).items.map((i) => i.box), level.items.map((i) => i.box))).toBe(0);
      }
    const open = shared.items;
    for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) expect(boxesOverlap(open[i]!.box, open[j]!.box)).toBe(false);
  });

  it("gives the gaps of the nodes that open the board of the nearest level", () => {
    expect(openGaps(nested.nodes, shared.gaps)).toEqual(shared.items);
    expect(Math.max(...shared.gaps.map((g) => g.lanes))).toBeGreaterThan(0);
    for (const g of shared.gaps) expect(g.need).toBeGreaterThanOrEqual(g.width);
  });

  it("uses the board of the nearest level for each level by default", () => {
    for (const level of shared.levels) {
      expect(level.nodes).toEqual(shared.items);
      expect(level.items).toEqual(levelCut(shared.items, root, level.depth).items);
    }
  });

  it("counts the links of each level between its items", () => {
    const cut = levelCut(nested.nodes, root, 1);
    const pairs = levelPairs(cut.items, cut.owner, new Map(nested.nodes.map((n, i) => [n.id, i])), links);
    expect(pairs.length).toBe(6);
    const inside = links.filter((l) => cut.owner[nested.nodes.findIndex((n) => n.id === l.source)] === cut.owner[nested.nodes.findIndex((n) => n.id === l.target)]);
    expect(pairs.reduce((s, p) => s + p.count, 0)).toBe(links.reduce((s, l) => s + (l.count ?? 1), 0) - inside.reduce((s, l) => s + (l.count ?? 1), 0));
  });

  it("opens only the depths of the option `depths`, and the level of the nodes with `nodes`", () => {
    const one = levelRoom(nested.nodes, links, root, { depths: [2] });
    expect(one.levels.map((l) => l.gaps.length > 0)).toEqual([false, false, true, false, false]);
    const all = levelRoom(nested.nodes, links, root, { nodes: true });
    expect(all.levels[4]!.gaps.length).toBeGreaterThan(0);
  });

  it("gives a board where the router `sections` sends no level link through a box", () => {
    const before = measureLevelFaults(sectionsRouter({ name: "sections" }).route(nested));
    const after = measureLevelFaults(sectionsRouter({ name: "sections" }).route({ nodes: shared.items, edges: nested.edges }));
    expect(before.reduce((s, f) => s + f.through, 0)).toBeGreaterThan(0);
    expect(after.map((f) => f.through)).toEqual(after.map(() => 0));
  });
});

describe("the room strategy `levels`", () => {
  it("gives the gaps of levelRoom, with the quadtree or with the tree of the input", () => {
    expect(roomStrategies.levels.run({ items: nested.nodes, links })).toEqual(shared.gaps);
    const tree = buildSections(nested.nodes, { cap: 16 });
    expect(roomStrategies.levels.run({ items: nested.nodes, links, sections: tree }, { cap: 4 })).toEqual(levelRoom(nested.nodes, links, tree).gaps);
    expect(roomStrategies.levels.run({ items: nested.nodes, links }, { cap: 16 })).toEqual(levelRoom(nested.nodes, links, tree).gaps);
  });
});

describe("benchLevelRoom", () => {
  it("measures each level of each board, and the room removes the level links through a box", () => {
    const rows = benchLevelRoom("packed-grid", packedGridBoard(), { gutter: 8, spacing: 4 });
    expect(rows.map((r) => `${r.board} ${r.depth}`)).toEqual(["packed", "gutter", "routes", "levels", "levels each"].flatMap((b) => [`${b} 1`, `${b} 2`]));
    const at = (board: string, depth: number) => rows.find((r) => r.board === board && r.depth === depth)!;
    expect(at("packed", 2).through).toBeGreaterThan(0);
    for (const board of ["levels", "levels each"])
      for (const depth of [1, 2]) {
        const r = at(board, depth);
        expect([r.through, r.order, r.levelOrder]).toEqual([0, 0, 0]);
        expect(r.area).toBeLessThanOrEqual(1.5);
      }
    expect(at("levels", 2).shift).toBe(0);
    expect(at("levels each", 2).shift).toBeGreaterThan(0);
  });
});
