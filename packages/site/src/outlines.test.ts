import { describe, expect, it } from "vitest";
import type { Box, Level, LevelItem } from "@mark1russell7/highways";
import { endsOnOutlines, groupShapes } from "./outlines.ts";

/** This function makes a group of cards of 100 by 40, in rows 100 apart. Each row is a list of the left sides of its cards. */
function group(id: string, rows: number[][], y0 = 0): { item: LevelItem; cards: Map<string, Box> } {
  const cards = new Map<string, Box>();
  rows.forEach((xs, r) => xs.forEach((x, i) => cards.set(`${id}${r}${i}`, { x, y: y0 + r * 100, w: 100, h: 40 })));
  const boxes = [...cards.values()];
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { item: { id, box: { x: x0, y, w: x1 - x0, h: y1 - y }, nodes: [...cards.keys()] }, cards };
}

const inside = (b: Box, r: Box): boolean => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
const gap = (a: Box, b: Box): number => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));

describe("groupShapes", () => {
  it("gives a rectangle around a group with free space around it", () => {
    const a = group("a", [[0, 150], [0, 150]]);
    const level: Level = { depth: 1, items: [a.item], links: [] };
    const shape = groupShapes(level, (id) => a.cards.get(id), 10).get("a")!;
    expect(shape.pad).toBe(10);
    expect(shape.outline).toEqual([
      { x: -10, y: -10 },
      { x: -10, y: 150 },
      { x: 260, y: 150 },
      { x: 260, y: -10 },
    ]);
  });

  it("gives bands for the rows of two groups whose boxes overlap, and the bands keep apart", () => {
    // The last row of b starts left of the right side of a, so the boxes of the two groups overlap.
    const a = group("a", [[0, 150, 300], [0, 150, 300], [75, 225]]);
    const b = group("b", [[450, 600, 750], [450, 600, 750], [375, 525, 675]]);
    const cards = new Map([...a.cards, ...b.cards]);
    const level: Level = { depth: 1, items: [a.item, b.item], links: [] };
    expect(gap(a.item.box, b.item.box)).toBeLessThan(0);
    const shapes = groupShapes(level, (id) => cards.get(id), 10);
    const sa = shapes.get("a")!;
    const sb = shapes.get("b")!;
    for (const x of sa.boxes) for (const y of sb.boxes) expect(gap(x, y)).toBeGreaterThan(0);
    for (const [id, c] of cards) expect((id.startsWith("a") ? sa : sb).boxes.some((r) => inside(c, r))).toBe(true);
    // Each outline has legs parallel to the axes only.
    for (const s of [sa, sb])
      s.outline.forEach((p, i) => {
        const q = s.outline[(i + 1) % s.outline.length]!;
        expect(p.x === q.x || p.y === q.y).toBe(true);
      });
    // The last row of a grows to the left side of the group. The outline has one step on the right, so it has six corners.
    expect(sa.outline).toHaveLength(6);
    expect(sa.outline[0]).toEqual({ x: -10, y: -10 });
  });
});

describe("endsOnOutlines", () => {
  // A card next to the last row of the group makes the group take bands.
  const a = group("a", [[0, 150], [0, 150], [0]]);
  const single: LevelItem = { id: "s", box: { x: 260, y: 200, w: 100, h: 40 }, nodes: ["s"] };
  const level: Level = { depth: 1, items: [a.item, single], links: [] };
  const shape = groupShapes(level, (id) => a.cards.get(id), 8).get("a")!;

  it("moves an end on the box of the group out to the outline", () => {
    expect(endsOnOutlines([{ x: 250, y: 20 }, { x: 270, y: 20 }, { x: 400, y: 20 }], shape, undefined)[0]).toEqual({ x: 258, y: 20 });
  });

  it("moves an end in a step of the outline back to the outline", () => {
    // The last row has one card, so the box of the group is wider than the outline there.
    const p = endsOnOutlines([{ x: 400, y: 400 }, { x: 200, y: 400 }, { x: 200, y: 240 }], undefined, shape);
    expect(p[p.length - 1]).toEqual({ x: 200, y: 148 });
  });
});
