import { describe, expect, it } from "vitest";
import { packedGridBoard } from "../cases.ts";
import { benchRoom, formatRoom, growthSettings, laneSettings, passSettings, sweepRoom, type RoomBenchRow } from "./room.ts";

describe("benchRoom on the packed grid (ROOM)", () => {
  const graph = packedGridBoard();
  const rows = benchRoom("packed-grid", graph, { gutter: 8, spacing: 4 });
  const row = (board: string) => rows.find((r) => r.board === board)!;

  it("is a made-up board of touching boxes of one size, the same each time", () => {
    expect(graph.nodes).toHaveLength(96);
    expect(graph.edges).toHaveLength(132);
    expect(packedGridBoard()).toEqual(graph);
    expect(formatRoom(rows).split("\n")).toHaveLength(2 + 4);
  });

  it("packed: the links of the far view go through the boxes, because the boxes leave no channel", () => {
    const packed = row("packed");
    // ER3d: the soft way of the level links moves 6 links out of the boxes. Before ER3d, the value was 62.
    expect(packed.faults.through).toBe(56);
    expect(packed.faults.worstDetour).toBeCloseTo(1.48, 2);
    expect(packed.laneThrough).toBe(94);
  });

  // These values are the values of ROOM at gutter 8 and spacing 4. A change that makes one of them worse fails here.
  it("open with the method routes: no link through a box or outside the board, and the lanes fit in the gaps", () => {
    const open = row("routes");
    expect(open.faults.through).toBe(0);
    expect(open.faults.outside).toBe(0);
    expect(open.faults.backtrack).toBe(0);
    expect(open.crossings).toBeLessThanOrEqual(276);
    expect(open.detour).toBeLessThanOrEqual(1.3214);
    expect(open.faults.worstDetour).toBeLessThanOrEqual(2.087);
    expect(open.area).toBeLessThanOrEqual(1.5042);
    expect(open.laneThrough).toBeLessThanOrEqual(2);
  });

  it("the gutter alone and the method lines are worse: more crossings, or much more area", () => {
    expect(row("gutter").crossings).toBeGreaterThan(row("routes").crossings);
    expect(row("gutter").laneThrough).toBeGreaterThan(row("routes").laneThrough);
    expect(row("lines").area).toBeGreaterThan(2 * row("routes").area);
  });
});

const hard = (r: RoomBenchRow): number[] => [r.faults.through, r.faults.outside, r.faults.backtrack];

describe("the sweeps of the room on the packed grid (ROOM-A, ROOM-C, ROOM-D)", () => {
  const graph = packedGridBoard();

  it("ROOM-A: the area grows with maxGrowth and stays flat when the demand is met, with no link through a box", () => {
    const rows = sweepRoom("packed-grid", graph, growthSettings([0, 0.12, 0.25, 0.3, Infinity]));
    const [fair, zero, low, knee, met, free] = rows as [RoomBenchRow, RoomBenchRow, RoomBenchRow, RoomBenchRow, RoomBenchRow, RoomBenchRow];
    expect([fair.crossings, fair.laneThrough]).toEqual([345, 10]);
    // Each gap keeps its gutter, so the smallest board is the board open to the gutter.
    expect(zero.area).toBeCloseTo(fair.area, 6);
    expect(low.area).toBeGreaterThan(zero.area);
    expect(knee.area).toBeGreaterThan(low.area);
    expect(knee.area).toBeLessThan(free.area);
    expect(met.area).toBeCloseTo(free.area, 6);
    expect(knee.laneThrough).toBeLessThanOrEqual(2);
    for (const r of rows) expect(hard(r)).toEqual([0, 0, 0]);
  });

  it("ROOM-C: the order crossings has the fewest crossings of the lane orders, and the spacing changes the crossings less than 5%", () => {
    const rows = sweepRoom("packed-grid", graph, laneSettings([2, 8]));
    const row = (board: string): RoomBenchRow => rows.find((r) => r.board === board)!;
    for (const s of [2, 8]) {
      expect(row(`crossings spacing ${s}`).crossings).toBeLessThan(row(`ends spacing ${s}`).crossings);
      expect(row(`ends spacing ${s}`).crossings).toBeLessThan(row(`links spacing ${s}`).crossings);
      expect(row(`crossings spacing ${s}`).crossings).toBeLessThanOrEqual(0.85 * row(`links spacing ${s}`).crossings);
    }
    for (const order of ["shared", "crossings"]) {
      const [a, b] = [row(`${order} spacing 2`).crossings, row(`${order} spacing 8`).crossings];
      expect(Math.abs(a - b) / Math.min(a, b)).toBeLessThan(0.05);
    }
    for (const r of rows) expect(hard(r)).toEqual([0, 0, 0]);
  });

  it("ROOM-D: a second pass adds at most 5% area and does not make the worst detour worse", () => {
    const rows = sweepRoom("packed-grid", graph, passSettings([8, 12], [1, 2]));
    const row = (board: string): RoomBenchRow => rows.find((r) => r.board === board)!;
    for (const g of [8, 12]) {
      const [one, two] = [row(`gutter ${g} passes 1`), row(`gutter ${g} passes 2`)];
      expect(two.area).toBeLessThanOrEqual(1.05 * one.area);
      expect(two.faults.worstDetour).toBeLessThanOrEqual(one.faults.worstDetour);
      expect(two.detour).toBeLessThanOrEqual(one.detour);
    }
    const [g8, g12] = [row("gutter 8 passes 1"), row("gutter 12 passes 1")];
    expect(Math.abs(g12.detour - g8.detour) / g8.detour).toBeLessThan(0.05);
    for (const r of rows) expect(hard(r)).toEqual([0, 0, 0]);
  });
});
