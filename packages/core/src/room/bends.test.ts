import { describe, expect, it } from "vitest";
import type { Point } from "../geom.ts";
import type { Router } from "../model.ts";
import { bendGrowth } from "./bends.ts";
import { boardGaps, makeRoom, roomDemand, type Boxed, type RoomLink } from "./index.ts";

// Two boxes in two rows. Three edges from `p` to `q` share one way with a short middle leg: east, south for 10, then east.
const items: Boxed[] = [
  { id: "p", box: { x: 50, y: -30, w: 40, h: 25 } },
  { id: "q", box: { x: 110, y: 15, w: 40, h: 25 } },
];
const links: RoomLink[] = [{ source: "p", target: "q", count: 3 }];

/** A router that gives each edge the same way, with a middle leg of the length `leg`. The edges share the way as one run. */
const fixed = (leg: number): Router => ({
  name: "fixed",
  route: (g) => {
    const p = (y: number): Point[] => [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y },
      { x: 200, y },
    ];
    const routes = g.edges.map((e) => ({ edge: e.id, points: p(leg) }));
    return { routes, runs: [{ id: "run", key: "k", points: p(leg), edges: g.edges.map((e) => e.id) }] };
  },
});

describe("bendGrowth", () => {
  it("grows the gap between the two ends of a leg that is too short for the bends of a bundle", () => {
    // The bundle has 3 lanes 4 apart, so W = 8 and the center line needs R = W/2 + 4 = 8. At 90°, T = R, and the leg needs 2T = 16.
    const gaps = boardGaps(items);
    const grow = bendGrowth(items, links, gaps, { router: fixed(10), spacing: 4, minRadius: 4 }, 0.5);
    expect(gaps.map((g) => [g.axis, g.at])).toEqual([
      ["x", 110],
      ["y", 15],
    ]);
    expect(grow[0]).toBe(0);
    expect(grow[1]).toBeCloseTo(6, 9);
  });

  it("gives no growth when the leg is long enough, or when the edges make no bundle", () => {
    const gaps = boardGaps(items);
    expect(bendGrowth(items, links, gaps, { router: fixed(20), spacing: 4, minRadius: 4 }, 0.5)).toEqual([0, 0]);
    expect(bendGrowth(items, [{ source: "p", target: "q" }], gaps, { router: fixed(4), spacing: 4, minRadius: 4 }, 0.5)).toEqual([0, 0]);
  });
});

describe("roomDemand with bends", () => {
  it("is off by default, and with it the need of a gap grows by the growth of the bends", () => {
    const base = roomDemand(items, links, { method: "lines" });
    expect(roomDemand(items, links, { method: "lines" })).toEqual(roomDemand(items, links, { method: "lines", passes: 1 }));
    const bent = roomDemand(items, links, { method: "lines", bends: { router: fixed(10), spacing: 4, minRadius: 4 } });
    const added = bent.map((g, i) => g.need - base[i]!.need);
    expect(added[0]).toBe(0);
    expect(added[1]).toBeCloseTo(6, 9);
    expect(makeRoom(items, links, { method: "lines", bends: { router: fixed(10), spacing: 4, minRadius: 4 } }).items[1]!.box.y).toBeCloseTo(21, 9);
  });

  it("keeps the growth of the bends under `maxGrowth`", () => {
    const bent = roomDemand(items, links, { method: "lines", maxGrowth: 0.05, bends: { router: fixed(10), spacing: 4, minRadius: 4 } });
    const y = bent.find((g) => g.axis === "y")!;
    // The board is 70 high, so the growth on y is at most 3.5.
    expect(y.need - y.width).toBeLessThanOrEqual(3.5 + 1e-9);
  });
});
