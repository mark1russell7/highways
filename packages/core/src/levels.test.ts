import { describe, expect, it } from "vitest";
import { measureLinks } from "./bench/links.ts";
import { sameData } from "./bench/run.ts";
import { CASES } from "./cases.ts";
import { makeFixture, rng } from "./fixtures.ts";
import { inflate, pointBoxDistance, segmentHitsBox, type Box, type Point } from "./geom.ts";
import { facingPlugs, levelLinks, type ItemPair } from "./levels.ts";
import type { Edge, Graph, Level, LevelItem, Node } from "./model.ts";
import { sectionsRouter } from "./routers/sections.ts";

/** This function tells if the point is on the boundary of the box, within half a unit. */
const onBoundary = (p: Point, b: Box): boolean => {
  const inner = inflate(b, -0.5);
  const deep = p.x > inner.x && p.x < inner.x + inner.w && p.y > inner.y && p.y < inner.y + inner.h;
  return !deep && pointBoxDistance(p, b) <= 0.5;
};

/** This function gives the faults of the links of a level: an end off its item, a pass through an item, a turn back or a diagonal leg. */
function faults(level: Level, square: boolean): string[] {
  const out: string[] = [];
  const boxOf = new Map(level.items.map((i) => [i.id, i.box]));
  for (const l of level.links) {
    const tag = `level ${level.depth}, ${l.source} to ${l.target}`;
    const p = l.points;
    if (!onBoundary(p[0]!, boxOf.get(l.source)!)) out.push(`${tag}: the start is off the source`);
    if (!onBoundary(p[p.length - 1]!, boxOf.get(l.target)!)) out.push(`${tag}: the end is off the target`);
    for (let i = 1; i < p.length; i++) {
      for (const it of level.items) if (segmentHitsBox(p[i - 1]!, p[i]!, inflate(it.box, -0.5))) out.push(`${tag}: leg ${i} goes through ${it.id}`);
      if (square && Math.abs(p[i]!.x - p[i - 1]!.x) > 1e-6 && Math.abs(p[i]!.y - p[i - 1]!.y) > 1e-6) out.push(`${tag}: leg ${i} is diagonal`);
      if (i >= 2) {
        const [a, b, c] = [p[i - 2]!, p[i - 1]!, p[i]!];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
        if (Math.abs(cross) < 1e-6 && dot < 0) out.push(`${tag}: leg ${i} turns back`);
      }
    }
  }
  return out;
}

/** This function makes four districts of cards in a square, with edges in each district and between the districts. */
function districts(): Graph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const id = (d: number, i: number): string => `d${d}c${i}`;
  for (let d = 0; d < 4; d++) {
    const ox = (d % 2) * 700;
    const oy = Math.floor(d / 2) * 460;
    for (let i = 0; i < 12; i++) nodes.push({ id: id(d, i), box: { x: ox + (i % 4) * 140, y: oy + Math.floor(i / 4) * 100, w: 100, h: 40 } });
    for (let i = 0; i < 11; i++) edges.push({ id: `e${edges.length}`, source: { node: id(d, i) }, target: { node: id(d, i + 1) } });
  }
  for (let d = 0; d < 4; d++)
    for (const i of [0, 5, 10]) edges.push({ id: `e${edges.length}`, source: { node: id(d, i) }, target: { node: id((d + 1) % 4, (i + 3) % 12) } });
  edges.push({ id: `e${edges.length}`, source: { node: id(0, 0) }, target: { node: id(3, 11) } });
  return { nodes, edges };
}

describe("levelLinks", () => {
  it("gives links between the groups of a board that end on the groups, go around the other groups, and have square legs", () => {
    const result = sectionsRouter({ name: "sections", margin: 16, cap: 4 }).route(districts());
    const levels = result.levels ?? [];
    expect(levels.length).toBeGreaterThan(2);
    // The last level gives the routes of the edges. The levels before it give the links between groups.
    for (const level of levels.slice(0, -1)) expect(faults(level, true)).toEqual([]);
    expect(levels.slice(1, -1).some((l) => l.links.length > 0)).toBe(true);
  });

  it("gives links that end on their items and do not go through an item on generated grids", () => {
    for (let seed = 1; seed <= 3; seed++) {
      const g = makeFixture({ name: "t", kind: "grid", nodes: 120, edgesPerNode: 2, seed });
      const levels = sectionsRouter({ name: "sections" }).route(g).levels ?? [];
      for (const level of levels.slice(0, -1)) expect(faults(level, false), `seed ${seed}`).toEqual([]);
    }
  });

  it("goes around an item between the two ends", () => {
    const items: LevelItem[] = [
      { id: "a", box: { x: 0, y: 0, w: 100, h: 40 }, nodes: ["a"] },
      { id: "wall", box: { x: 200, y: -100, w: 60, h: 240 }, nodes: ["wall"] },
      { id: "b", box: { x: 400, y: 0, w: 100, h: 40 }, nodes: ["b"] },
    ];
    const links = levelLinks(items, [{ source: "a", target: "b", count: 3 }], { margin: 10 });
    expect(links).toHaveLength(1);
    expect(links[0]!.count).toBe(3);
    expect(faults({ depth: 0, items, links }, true)).toEqual([]);
    // The link goes over or under the wall.
    expect(links[0]!.points.some((p) => p.y < -100 || p.y > 140)).toBe(true);
  });

  it("turns in the middle of a narrow space between two sides that face each other", () => {
    const items: LevelItem[] = [
      { id: "a", box: { x: 0, y: 0, w: 100, h: 60 }, nodes: ["a"] },
      { id: "b", box: { x: 126, y: 80, w: 100, h: 60 }, nodes: ["b"] },
    ];
    const links = levelLinks(items, [{ source: "a", target: "b", count: 1 }], { margin: 20 });
    expect(faults({ depth: 0, items, links }, true)).toEqual([]);
    // The link has three legs, and its middle leg is in the middle of the space.
    expect(links[0]!.points).toHaveLength(4);
    expect(links[0]!.points[1]!.x).toBe(113);
    expect(links[0]!.points[2]!.x).toBe(113);
  });

  it("gives a straight link between two sides that face each other", () => {
    const a: Box = { x: 0, y: 0, w: 100, h: 60 };
    const b: Box = { x: 200, y: 30, w: 100, h: 60 };
    const [pa, pb] = facingPlugs(a, b, 6);
    expect(pa.point).toEqual({ x: 100, y: 45 });
    expect(pb.point).toEqual({ x: 200, y: 45 });
    const items: LevelItem[] = [
      { id: "a", box: a, nodes: ["a"] },
      { id: "b", box: b, nodes: ["b"] },
    ];
    expect(levelLinks(items, [{ source: "a", target: "b", count: 1 }], { margin: 10 })[0]!.points).toEqual([
      { x: 100, y: 45 },
      { x: 200, y: 45 },
    ]);
  });
});

/**
 * This function makes a walled-in level of made-up data: a grid of `n` × `n` groups.
 * Each group overlaps its neighbours on all sides, and random links join two groups.
 */
function walledLevel(n: number, seed: number): { items: LevelItem[]; pairs: ItemPair[] } {
  const R = rng(seed);
  const items: LevelItem[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      items.push({
        id: `g${r}-${c}`,
        box: { x: c * 90 + Math.floor(R() * 10), y: r * 90 + Math.floor(R() * 10), w: 100 + Math.floor(R() * 30), h: 100 + Math.floor(R() * 30) },
        nodes: [`g${r}-${c}-a`, `g${r}-${c}-b`],
      });
  const pairs: ItemPair[] = [];
  for (let i = 0; i < 3 * items.length; i++) {
    const source = items[Math.floor(R() * items.length)]!.id;
    const target = items[Math.floor(R() * items.length)]!.id;
    if (source !== target) pairs.push({ source, target, count: 1 });
  }
  return { items, pairs };
}

describe("the soft way on a walled-in level (ER3d)", () => {
  const { items, pairs } = walledLevel(6, 1);
  const boxes = new Map(items.map((i) => [i.id, i.box]));

  it("uses throughCost 8 when the option is not set", () => {
    expect(sameData(levelLinks(items, pairs, { margin: 20, throughCost: 8 }), levelLinks(items, pairs, { margin: 20 }))).toBe(true);
  });

  it("keeps most links out of the far boxes, with no new out and back and no longer worst detour", () => {
    const before = measureLinks(boxes, levelLinks(items, pairs, { margin: 20, throughCost: 0 }));
    const links = levelLinks(items, pairs, { margin: 20, throughCost: 8 });
    const after = measureLinks(boxes, links);
    // Each group overlaps its neighbours, so a link can find no way around the groups.
    expect(before.avoidable).toBe(19);
    expect(after.avoidable).toBe(2);
    expect(after.through).toBe(before.through);
    expect(after.backtrack).toBeLessThanOrEqual(before.backtrack);
    expect(after.worstDetour).toBeLessThanOrEqual(before.worstDetour);
    expect(after.outside).toBe(0);
    for (const l of links) {
      expect(onBoundary(l.points[0]!, boxes.get(l.source)!), `${l.source} to ${l.target}`).toBe(true);
      expect(onBoundary(l.points[l.points.length - 1]!, boxes.get(l.target)!), `${l.source} to ${l.target}`).toBe(true);
    }
  });

  it("gives a link of two points between two items that touch (SEC-V)", () => {
    // The soft way leaves `a` and enters `b` at the same point of their common side. Before SEC-V, the link had one point only.
    const touching: LevelItem[] = [
      { id: "a", box: { x: 12, y: 487, w: 287, h: 262 } },
      { id: "b", box: { x: 259, y: 273, w: 236, h: 214 } },
      { id: "c", box: { x: 48, y: 250, w: 226, h: 237 } },
      { id: "d", box: { x: 263, y: 3, w: 285, h: 261 } },
      { id: "e", box: { x: 511, y: 243, w: 242, h: 259 } },
      { id: "f", box: { x: 299, y: 506, w: 248, h: 207 } },
      { id: "g", box: { x: 546, y: 484, w: 224, h: 271 } },
    ].map((i) => ({ ...i, nodes: [i.id] }));
    const boxOf = new Map(touching.map((i) => [i.id, i.box]));
    for (const [source, target] of [["a", "b"], ["b", "a"]] as const) {
      const [link] = levelLinks(touching, [{ source, target, count: 1 }]);
      const p = link!.points;
      expect(p.length, `${source} to ${target}`).toBe(2);
      expect(onBoundary(p[0]!, boxOf.get(source)!), `${source} to ${target}`).toBe(true);
      expect(onBoundary(p[1]!, boxOf.get(target)!), `${source} to ${target}`).toBe(true);
    }
  });

  it("does not change the links of a level without far boxes in the way", () => {
    for (const c of CASES) {
      const g = c.make();
      expect(sameData(sectionsRouter({ name: "s", throughCost: 0 }).route(g).levels, sectionsRouter({ name: "s" }).route(g).levels), c.name).toBe(true);
    }
  });
});
