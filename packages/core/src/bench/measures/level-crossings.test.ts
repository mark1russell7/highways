import { describe, expect, it } from "vitest";
import type { Box } from "../../geom.ts";
import type { Level, LevelItem } from "../../model.ts";
import { freeSpace, levelCrossings } from "./level-crossings.ts";

const item = (id: string, x: number, y: number, w: number, h: number, nodes = 1): LevelItem => ({ id, box: { x, y, w, h }, nodes: Array.from({ length: nodes }, (_, i) => `${id}${i}`) });

/** This function gives a level with one straight link from `a` to `b`. */
function level(items: readonly LevelItem[], from: { x: number; y: number }, to: { x: number; y: number }): Level {
  return { depth: 1, items, links: [{ source: "a", target: "b", count: 1, points: [from, to] }] };
}

/** The four walls of a closed room around the point (50, 50). */
const ROOM: readonly Box[] = [
  { x: 0, y: 0, w: 100, h: 10 },
  { x: 0, y: 90, w: 100, h: 10 },
  { x: 0, y: 10, w: 10, h: 80 },
  { x: 90, y: 10, w: 10, h: 80 },
];

describe("freeSpace", () => {
  it("separates a closed room from the outside", () => {
    const inner: Box = { x: 40, y: 40, w: 20, h: 20 };
    const outer: Box = { x: 200, y: 40, w: 20, h: 20 };
    const free = freeSpace([...ROOM, inner, outer]);
    const near = free.around(inner);
    expect(near.size).toBe(1);
    expect([...free.around(outer)].some((l) => near.has(l))).toBe(false);
  });

  it("joins the room to the outside through a door", () => {
    const walls: Box[] = [ROOM[0]!, ROOM[1]!, ROOM[2]!, { x: 90, y: 10, w: 10, h: 30 }, { x: 90, y: 60, w: 10, h: 30 }];
    const inner: Box = { x: 40, y: 40, w: 20, h: 20 };
    const outer: Box = { x: 200, y: 40, w: 20, h: 20 };
    const free = freeSpace([...walls, inner, outer]);
    expect([...free.around(outer)].some((l) => free.around(inner).has(l))).toBe(true);
  });

  it("treats two boxes that meet at a corner as closed", () => {
    const boxes: Box[] = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 10, w: 10, h: 10 },
    ];
    const free = freeSpace(boxes);
    expect(free.around(boxes[0]!).size).toBe(1);
  });
});

describe("levelCrossings", () => {
  it("counts no crossing on a clean link", () => {
    const m = levelCrossings(level([item("a", 0, 0, 10, 10), item("b", 100, 0, 10, 10), item("w", 50, 50, 10, 10)], { x: 10, y: 5 }, { x: 100, y: 5 }));
    expect(m.crossed).toEqual([]);
    expect(m.perLink).toEqual([0]);
    expect(m.overlaps).toBe(0);
  });

  it("gives the way clear when the link could go around the box", () => {
    const m = levelCrossings(level([item("a", 0, 0, 10, 10), item("b", 100, 0, 10, 10), item("w", 50, -10, 10, 30)], { x: 10, y: 5 }, { x: 100, y: 5 }));
    expect(m.crossed).toHaveLength(1);
    expect(m.crossed[0]).toMatchObject({ way: "clear", items: ["w"], single: 1, overlapEnd: 0 });
  });

  it("gives the way none when a wall closes the end", () => {
    const walls = ROOM.map((b, i) => item(`w${i}`, b.x, b.y, b.w, b.h, 2));
    const m = levelCrossings(level([...walls, item("a", 40, 40, 20, 20), item("b", 200, 40, 20, 20)], { x: 60, y: 50 }, { x: 200, y: 50 }));
    expect(m.crossed[0]).toMatchObject({ way: "none", items: ["w3"], single: 0 });
  });

  it("gives the way ends-overlap when one end is inside the other", () => {
    const m = levelCrossings(level([item("a", 0, 0, 200, 40, 9), item("b", 100, 10, 20, 20), item("w", 40, 5, 20, 30)], { x: 0, y: 20 }, { x: 100, y: 20 }));
    expect(m.crossed[0]).toMatchObject({ way: "ends-overlap", items: ["w"], overlapEnd: 1 });
    expect(m.overlaps).toBe(2);
  });

  it("shows a way that only the box of a section closes", () => {
    const nodes = [
      { id: "a0", box: { x: 0, y: 0, w: 10, h: 10 } },
      { id: "b0", box: { x: 100, y: 0, w: 10, h: 10 } },
      { id: "w0", box: { x: 50, y: -100, w: 4, h: 4 } },
      { id: "w1", box: { x: 50, y: 100, w: 4, h: 4 } },
    ];
    const items: LevelItem[] = [
      { id: "a", box: nodes[0]!.box, nodes: ["a0"] },
      { id: "b", box: nodes[1]!.box, nodes: ["b0"] },
      { id: "w", box: { x: 50, y: -100, w: 4, h: 204 }, nodes: ["w0", "w1"] },
    ];
    const m = levelCrossings(level(items, { x: 10, y: 5 }, { x: 100, y: 5 }), nodes);
    expect(m.crossed[0]).toMatchObject({ way: "clear", boardWay: true, single: 0 });
  });

  it("gives no board way when the nodes close the room", () => {
    const walls = ROOM.map((box, i) => ({ id: `w${i}`, box }));
    const nodes = [...walls, { id: "a0", box: { x: 40, y: 40, w: 20, h: 20 } }, { id: "b0", box: { x: 200, y: 40, w: 20, h: 20 } }];
    const items: LevelItem[] = nodes.map((n) => ({ id: n.id === "a0" ? "a" : n.id === "b0" ? "b" : n.id, box: n.box, nodes: [n.id] }));
    const m = levelCrossings(level(items, { x: 60, y: 50 }, { x: 200, y: 50 }), nodes);
    expect(m.crossed[0]).toMatchObject({ way: "none", boardWay: false });
  });
});
