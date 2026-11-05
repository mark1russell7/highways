import { describe, expect, it } from "vitest";
import { overlapLimitRows, routeOverlap, type OverlapRecord } from "./overlap.ts";

const route = (edge: string, ...points: [number, number][]) => ({ edge, points: points.map(([x, y]) => ({ x, y })) });

describe("the overlap of the routes (B11)", () => {
  it("gives 0 share and a peak of 1 for routes that share no line", () => {
    expect(routeOverlap([route("a", [0, 0], [10, 0]), route("b", [0, 5], [10, 5])])).toEqual({ share: 0, peak: 1 });
  });

  it("counts legs that overlap in part", () => {
    const r = routeOverlap([route("a", [0, 0], [10, 0]), route("b", [5, 0], [15, 0])]);
    expect(r.peak).toBe(2);
    expect(r.share).toBeCloseTo(0.5);
  });

  it("counts a route one time when it runs back along its own line", () => {
    expect(routeOverlap([route("a", [0, 0], [10, 0], [0, 0])])).toEqual({ share: 0, peak: 1 });
  });

  it("gives 0 for no routes", () => {
    expect(routeOverlap([])).toEqual({ share: 0, peak: 0 });
  });

  it("does not change with the order of the routes", () => {
    const a = route("a", [0, 0], [10, 0]);
    const b = route("b", [2, 0], [8, 0]);
    const c = route("c", [4, 0], [4, 9]);
    expect(routeOverlap([a, b, c])).toEqual(routeOverlap([c, b, a]));
  });
});

describe("the limits of B11", () => {
  const record = (strategy: string, input: string, share: number, peak: number): OverlapRecord => ({
    strategy,
    input,
    measures: { "route.overlap.share": share, "route.overlap.peak": peak },
  });
  const family = (input: string): string => input.split("/")[1]!;

  it("is within on a board where the router keeps the routes of the base", () => {
    const rows = overlapLimitRows([record("corners", "s/hub-chain/s0", 0.6, 10), record("seams", "s/hub-chain/s0", 0.6, 10)], family);
    expect(rows.map((r) => r.label)).toEqual(["within", "within"]);
  });

  it("is over on a board with a rise above each limit, and it names the family", () => {
    const rows = overlapLimitRows([record("corners", "s/packed-grid/s0", 0.07, 2), record("seams", "s/packed-grid/s0", 0.88, 9)], family);
    expect(rows.map((r) => r.label)).toEqual(["over", "over"]);
    expect(rows[0]!.families).toEqual(["packed-grid"]);
    expect(rows[1]!.worst).toBe(7);
  });

  it("gives no row for a screen with no router without lanes", () => {
    expect(overlapLimitRows([record("corners", "s/a/s0", 0, 1), record("shared", "s/a/s0", 0.9, 30)], family)).toEqual([]);
  });

  it("stops when the base has no value, so a missing measure cannot pass", () => {
    expect(() => overlapLimitRows([record("seams", "s/a/s0", 0, 1)], family)).toThrow(/no value/);
  });
});
