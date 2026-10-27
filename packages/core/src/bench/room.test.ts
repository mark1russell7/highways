import { describe, expect, it } from "vitest";
import { packedGridBoard } from "../cases.ts";
import { benchRoom, formatRoom } from "./room.ts";

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
    expect(packed.faults.through).toBe(62);
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
