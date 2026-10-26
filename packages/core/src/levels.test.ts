import { describe, expect, it } from "vitest";
import { makeFixture } from "./fixtures.ts";
import { inflate, pointBoxDistance, segmentHitsBox, type Box, type Point } from "./geom.ts";
import { facingPlugs, levelLinks } from "./levels.ts";
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
