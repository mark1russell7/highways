import { describe, expect, it } from "vitest";
import { packedGridBoard } from "../cases.ts";
import type { Box } from "../geom.ts";
import type { Graph, Router } from "../model.ts";
import { boardGaps, makeRoom, openGaps, roomDemand, roomLinks, type Boxed } from "./index.ts";

/** A grid of touching boxes of one size: `c{row}-{col}`. */
function grid(rows: number, cols: number, w = 100, h = 40, gap = 0): Boxed[] {
  const out: Boxed[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ id: `c${r}-${c}`, box: { x: c * (w + gap), y: r * (h + gap), w, h } });
  return out;
}

const overlap = (a: Box, b: Box): boolean => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-9 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-9;

describe("boardGaps", () => {
  it("gives a gap between each two columns and each two rows of a grid, with the boxes on each side", () => {
    const gaps = boardGaps(grid(2, 3));
    expect(gaps.map((g) => [g.axis, g.index, g.at, g.width])).toEqual([
      ["x", 0, 100, 0],
      ["x", 1, 200, 0],
      ["y", 0, 40, 0],
    ]);
    expect(gaps[0]!.before).toEqual(["c0-0", "c1-0"]);
    expect(gaps[0]!.after).toEqual(["c0-1", "c1-1"]);
    expect(gaps[2]!.before).toEqual(["c0-0", "c0-1", "c0-2"]);
  });

  it("gives the current width of a gap, and joins box edges nearer than the snap", () => {
    const boxes = grid(2, 2, 100, 40, 12);
    expect(boardGaps(boxes).map((g) => g.width)).toEqual([12, 12]);
    const ragged = [...boxes, { id: "z", box: { x: 112.3, y: 200, w: 50, h: 10 } }];
    expect(boardGaps(ragged).filter((g) => g.axis === "x")).toHaveLength(1);
    expect(boardGaps(ragged, 0.1).filter((g) => g.axis === "x")).toHaveLength(2);
  });
});

describe("openGaps", () => {
  it("opens each gap to its need, and a grid stays a grid with no overlap", () => {
    const boxes = grid(3, 4);
    const gaps = boardGaps(boxes).map((g) => ({ ...g, need: 8 + g.index * 4 }));
    const open = openGaps(boxes, gaps);
    expect(open.map((b) => [b.box.w, b.box.h])).toEqual(boxes.map((b) => [b.box.w, b.box.h]));
    // Each column keeps one x, and each row keeps one y.
    for (const b of open) {
      const [r, c] = b.id.slice(1).split("-").map(Number) as [number, number];
      expect(b.box.x).toBe(open.find((o) => o.id === `c0-${c}`)!.box.x);
      expect(b.box.y).toBe(open.find((o) => o.id === `c${r}-0`)!.box.y);
    }
    for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) expect(overlap(open[i]!.box, open[j]!.box)).toBe(false);
    expect(boardGaps(open).map((g) => g.width)).toEqual(gaps.map((g) => g.need));
  });

  it("moves no box nearer to another box on a board that is not a grid", () => {
    const boxes: Boxed[] = [
      { id: "a", box: { x: 0, y: 0, w: 100, h: 40 } },
      { id: "b", box: { x: 100, y: 0, w: 50, h: 40 } },
      { id: "c", box: { x: 50, y: 40, w: 70, h: 40 } },
      { id: "d", box: { x: 120, y: 40, w: 30, h: 60 } },
    ];
    const gaps = boardGaps(boxes).map((g) => ({ ...g, need: g.width + 10 }));
    const open = openGaps(boxes, gaps);
    for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) expect(overlap(open[i]!.box, open[j]!.box)).toBe(false);
    expect(open.map((b) => b.box.x)).toEqual([0, 120, 60, 150]);
  });
});

describe("roomDemand", () => {
  // Two columns of three boxes. Each link goes from a box on the left to a box on the right in another row, so it runs along the gap between the columns.
  const boxes = grid(3, 2);
  const along = [
    { source: "c0-0", target: "c2-1" },
    { source: "c2-0", target: "c0-1" },
  ];

  it("counts the routes that run along a gap side by side, and gives the need from the gutter and the spacing", () => {
    const gaps = roomDemand(boxes, along, { gutter: 8, spacing: 4 });
    const column = gaps.find((g) => g.axis === "x")!;
    expect(column.lanes).toBe(2);
    expect(column.need).toBe(16);
    // A route that crosses a gap needs no lane in it.
    for (const g of gaps.filter((x) => x.axis === "y")) expect([g.lanes, g.need]).toEqual([0, 8]);
  });

  it("counts a link one time for each edge with the lanes `count`", () => {
    const gaps = roomDemand(boxes, [{ ...along[0]!, count: 3 }, along[1]!], { lanes: "count" });
    expect(gaps.find((g) => g.axis === "x")!.lanes).toBe(4);
  });

  it("counts the straight lines that cross each gap with the method `lines`", () => {
    const gaps = roomDemand(boxes, along, { method: "lines" });
    expect(gaps.map((g) => g.lanes)).toEqual([2, 2, 2]);
  });

  it("never makes a gap narrower than it is", () => {
    const wide = grid(3, 2, 100, 40, 30);
    expect(roomDemand(wide, along).map((g) => g.need)).toEqual([30, 30, 30]);
  });

  it("routes the probe with the router of the options", () => {
    let seen: Graph | undefined;
    const router: Router = {
      name: "probe",
      route(g) {
        seen = g;
        // Each route goes down the middle of the gap between the columns, on the board open to the gutter.
        return { routes: g.edges.map((e) => ({ edge: e.id, points: [{ x: 104, y: 0 }, { x: 104, y: 136 }] })) };
      },
    };
    const gaps = roomDemand(boxes, along, { router, gutter: 8 });
    expect(seen!.nodes.find((n) => n.id === "c0-1")!.box.x).toBe(108);
    expect(gaps.find((g) => g.axis === "x")!.lanes).toBe(2);
  });

  it("keeps the gutter of each gap and shares the rest of the growth with `maxGrowth`", () => {
    const many = Array.from({ length: 10 }, () => along).flat();
    const free = roomDemand(boxes, many, { method: "lines" });
    const capped = roomDemand(boxes, many, { method: "lines", maxGrowth: 0.1 });
    expect(free.find((g) => g.axis === "x")!.need).toBe(8 + 20 * 4);
    // The board is 200 wide, so the column gap grows by at most 20.
    expect(capped.find((g) => g.axis === "x")!.need).toBeCloseTo(20);
    // The board is 120 high, so the two row gaps grow by at most 12 together. Each keeps its gutter of 8.
    expect(capped.filter((g) => g.axis === "y").map((g) => g.need)).toEqual([8, 8]);
  });
});

describe("makeRoom", () => {
  it("gives the demand and the board with each gap open to it", () => {
    const boxes = grid(3, 2);
    const room = makeRoom(boxes, [{ source: "c0-0", target: "c2-1" }], { gutter: 8, spacing: 4 });
    expect(room.gaps.map((g) => g.need)).toEqual([12, 8, 8]);
    expect(room.items.map((b) => [b.box.x, b.box.y])).toEqual([
      [0, 0],
      [112, 0],
      [0, 48],
      [112, 48],
      [0, 96],
      [112, 96],
    ]);
  });

  it("takes the links of a graph from `roomLinks`, with the count of the edges of each pair", () => {
    const g: Graph = {
      nodes: [],
      edges: [
        { id: "1", source: { node: "a" }, target: { node: "b" } },
        { id: "2", source: { node: "b" }, target: { node: "a" } },
        { id: "3", source: { node: "a" }, target: { node: "a" } },
        { id: "4", source: { node: "a" }, target: { node: "c" } },
      ],
    };
    expect(roomLinks(g)).toEqual([
      { source: "a", target: "b", count: 2 },
      { source: "a", target: "c", count: 1 },
    ]);
  });
});

describe("the option passes (ROOM-D)", () => {
  const board = packedGridBoard();
  const links = roomLinks(board);
  const one = roomDemand(board.nodes, links);
  const two = roomDemand(board.nodes, links, { passes: 2 });

  it("gives the demand of one pass by default, and with `passes: 1`", () => {
    expect(roomDemand(board.nodes, links, { passes: 1 })).toEqual(one);
    expect(roomDemand(board.nodes, links, { passes: 0 })).toEqual(one);
  });

  it("adds the growth that a second demand finds on the open board", () => {
    const first = openGaps(board.nodes, one);
    const again = roomDemand(first, links);
    const twice = openGaps(first, again);
    // The two passes open the board as the second demand opens the board of the first.
    expect(openGaps(board.nodes, two).map((n) => n.box)).toEqual(twice.map((n) => n.box));
    two.forEach((g, i) => {
      expect(g.need).toBeGreaterThanOrEqual(one[i]!.need);
      expect(g.lanes).toBeGreaterThanOrEqual(one[i]!.lanes);
    });
    expect(two.some((g, i) => g.need > one[i]!.need)).toBe(true);
  });

  it("keeps the sum of the passes in `maxGrowth`", () => {
    const capped = roomDemand(board.nodes, links, { passes: 2, maxGrowth: 0.1 });
    const width = 12 * 140;
    const growth = capped.filter((g) => g.axis === "x").reduce((s, g) => s + g.need - g.width, 0);
    expect(growth).toBeLessThanOrEqual(0.1 * width + 1e-6);
  });
});
