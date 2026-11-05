import { describe, expect, it } from "vitest";
import { highwayCurves } from "./curves/highway/index.ts";
import { sampleCurve } from "./curves/sample.ts";
import { LANE_CLEAR, LANE_LEAST, LANE_ROOM_LIMIT, laneRoom, withLaneRoom } from "./lane-room.ts";
import type { Node, Result, SharedRun } from "./model.ts";
import { laneRoutes, pullApart, runKey, segmentsOf } from "./segments.ts";
import { Obstacles } from "./visibility.ts";

const box = (id: string, x: number, y: number, w: number, h: number): Node => ({ id, box: { x, y, w, h } });
const room = (nodes: readonly Node[], points: readonly { x: number; y: number }[]) => laneRoom(points, new Obstacles(nodes, 50));

const EDGES = ["a", "b", "c", "d", "e"];

/** This function gives a result with one run of five lanes, from (0, 0) to (100, 0), with routes that go on to each side. */
function runOf(side: { left: number; right: number } | undefined): Result {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  return {
    routes: EDGES.map((edge) => ({ edge, points: [{ x: -10, y: 0 }, ...points, { x: 110, y: 0 }] })),
    runs: [{ id: "r0", key: "k", points, edges: EDGES, ...(side === undefined ? {} : { room: side }) }],
  };
}

/** This function gives the y of each lane at the middle of the run, in lane order. */
function lanesAt(side: { left: number; right: number } | undefined, width: number) {
  const result = runOf(side);
  const routes = laneRoutes(result, new Set([runKey(EDGES)]), width);
  return { routes, ys: EDGES.map((edge) => routes.find((r) => r.edge === edge)!.points[2]!.y) };
}

describe("laneRoom", () => {
  it("reads the nearest box on each side of a way, less the clearance", () => {
    // The y axis points down, so the left of a way that goes east is north.
    const nodes = [box("north", 20, -30, 20, 18), box("south", 50, 7, 20, 20)];
    expect(room(nodes, [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ left: 12, right: 7 });
  });

  it("swaps the sides when the way runs the other way", () => {
    const nodes = [box("north", 20, -30, 20, 18), box("south", 50, 7, 20, 20)];
    expect(room(nodes, [{ x: 100, y: 0 }, { x: 0, y: 0 }])).toEqual({ left: 7, right: 12 });
  });

  it("reads each leg of a way with a bend, on both axes", () => {
    const nodes = [box("east", 110, 40, 20, 20)];
    // The way goes east, then south. The box stands to the left of the second leg.
    expect(room(nodes, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toEqual({ left: 10, right: LANE_ROOM_LIMIT });
  });

  it("does not count a box past the end of a leg, or a box that a leg leaves from", () => {
    const nodes = [box("past", 120, -5, 10, 10), box("source", -20, -10, 20, 20)];
    expect(room(nodes, [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ left: LANE_ROOM_LIMIT, right: LANE_ROOM_LIMIT });
  });

  it("reads a box beyond a bend, at the outer side, where a lane reaches past both legs", () => {
    // The way goes east, then south. Its left is the outer side. The corner of the box is 5 from each leg line.
    const nodes = [box("corner", 105, -25, 20, 20)];
    expect(room(nodes, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]).left).toBeCloseTo(5);
  });

  it("does not read a box past the end of a slanted leg as a box on the way", () => {
    // The corners of the box project over the leg, and on both sides of it. The box itself stays past the end.
    const nodes = [box("past", 80, 80, 40, 40)];
    expect(room(nodes, [{ x: 0, y: 0 }, { x: 70, y: 70 }])).toEqual({ left: LANE_ROOM_LIMIT, right: LANE_ROOM_LIMIT });
  });

  it("gives no room for a way through a box", () => {
    expect(room([box("mid", 40, -10, 20, 20)], [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ left: 0, right: 0 });
  });

  it("gives no room on one side when a way runs on the wall of a box", () => {
    expect(room([box("wall", 40, -20, 20, 20)], [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ left: 0, right: LANE_ROOM_LIMIT });
  });
});

describe("the room at a join of two ways (LANE-ROOM)", () => {
  // Two ways meet at (0, 0): one comes from the west, and one goes to the south. The wedge at the outer side of the join is to the north-east.
  const [west, south] = [{ x: -100, y: 0 }, { x: 0, y: 100 }];
  const corner = { x: 0, y: 0 };
  const ways = (first: readonly { x: number; y: number }[], second: readonly { x: number; y: number }[]): readonly SharedRun[] => [
    { id: "a", key: "a", points: first, edges: ["e", "f"] },
    { id: "b", key: "b", points: second, edges: ["e", "f"] },
  ];
  const wedge = [box("n", 6, -40, 30, 30)];

  it("reads a box in the wedge, on the outer side of both ways", () => {
    const [a, b] = withLaneRoom(ways([west, corner], [corner, south]), new Obstacles(wedge, 50));
    expect(laneRoom([west, corner], new Obstacles(wedge, 50)).left).toBe(LANE_ROOM_LIMIT);
    expect(a!.room!.left).toBeLessThan(LANE_ROOM_LIMIT);
    expect(b!.room!.left).toBeLessThan(LANE_ROOM_LIMIT);
    expect(a!.room!.right).toBe(LANE_ROOM_LIMIT);
    expect(b!.room!.right).toBe(LANE_ROOM_LIMIT);
  });

  it("keeps the sides of each way when a way runs toward the join or away from it", () => {
    const [a] = withLaneRoom(ways([corner, west], [corner, south]), new Obstacles(wedge, 50));
    expect(a!.room!.right).toBeLessThan(LANE_ROOM_LIMIT);
    expect(a!.room!.left).toBe(LANE_ROOM_LIMIT);
  });

  it("reads the offset where the link reaches the corner of the box", () => {
    // The link at an offset r runs from (0, -r) to (r, 0). It reaches the corner (6, -6) at r = 12.
    const [a] = withLaneRoom(ways([west, corner], [corner, south]), new Obstacles([box("n", 6, -36, 30, 30)], 50));
    expect(a!.room!.left).toBeCloseTo(12, 5);
  });

  it("does not read a box beside a way past a join as a box in the wedge", () => {
    // This box is to the east of the way to the south, so it is outside the wedge. It limits that way alone.
    const beside = [box("n", 8, 6, 30, 30)];
    const [a, b] = withLaneRoom(ways([west, corner], [corner, south]), new Obstacles(beside, 50));
    expect(a!.room!.left).toBe(LANE_ROOM_LIMIT);
    expect(b!.room!.left).toBeLessThan(10);
  });

  it("does not read a wedge when no other way meets the end of a way", () => {
    const [a] = withLaneRoom(ways([west, corner], [{ x: 500, y: 500 }, { x: 600, y: 500 }]), new Obstacles(wedge, 50));
    expect(a!.room!.left).toBe(LANE_ROOM_LIMIT);
  });

  it("does not read a way that goes back along the same leg as a join", () => {
    const [a] = withLaneRoom(ways([west, corner], [corner, west]), new Obstacles(wedge, 50));
    expect(a!.room!.left).toBe(LANE_ROOM_LIMIT);
  });

  it("keeps a lane out of the box on the link from one way to the next", () => {
    const [a, b] = withLaneRoom(ways([west, corner], [corner, south]), new Obstacles(wedge, 50));
    const edges = ["e", "f", "g", "h", "i"];
    const result: Result = {
      routes: edges.map((edge) => ({ edge, points: [{ x: -110, y: 0 }, west, corner, south, { x: 0, y: 110 }] })),
      runs: [{ ...a!, edges }, { ...b!, edges }],
    };
    const graph = segmentsOf(result);
    const open = new Set(graph.segments.map((s) => runKey(s.edges)));
    for (const route of laneRoutes(result, open, 5, 30)) {
      for (let i = 1; i < route.points.length; i++) {
        const [p, q] = [route.points[i - 1]!, route.points[i]!];
        for (let t = 0; t <= 1; t += 0.05) {
          const [x, y] = [p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t];
          expect(x > 6 && x < 36 && y > -40 && y < -10, route.edge).toBe(false);
        }
      }
    }
  });
});

describe("the lanes of a way with a room (LANE-ROOM)", () => {
  it("keeps the full width when the room holds it", () => {
    const { routes, ys } = lanesAt({ left: 10 + LANE_CLEAR, right: 10 + LANE_CLEAR }, 5);
    expect(ys).toEqual(lanesAt(undefined, 5).ys);
    expect(ys).toEqual([-10, -5, 0, 5, 10]);
    expect(routes.some((r) => r.outOfRoom)).toBe(false);
  });

  it("compresses each side on its own, and keeps the order and the side of each lane", () => {
    const { routes, ys } = lanesAt({ left: 5 + LANE_CLEAR, right: 20 }, 5);
    expect(ys).toEqual([-5, -2.5, 0, 5, 10]);
    expect(routes.some((r) => r.outOfRoom)).toBe(false);
  });

  it("holds each lane in the room, on both sides, over widths and rooms", () => {
    for (const width of [2, 5, 15]) {
      for (const [left, right] of [[3, 4], [8, 2], [40, 5], [6, 40]] as const) {
        const { routes, ys } = lanesAt({ left, right }, width);
        expect([...ys].sort((a, b) => a - b)).toEqual(ys);
        expect(ys[2]).toBe(0);
        const fits = Math.min(left, right) > 2 * LANE_LEAST;
        if (fits) {
          expect(Math.min(...ys)).toBeGreaterThanOrEqual(-left - 1e-9);
          expect(Math.max(...ys)).toBeLessThanOrEqual(right + 1e-9);
          expect(routes.some((r) => r.outOfRoom)).toBe(false);
        }
      }
    }
  });

  it("stops at the smallest distance, and marks each lane that the room cannot hold", () => {
    const { routes, ys } = lanesAt({ left: 1, right: 20 }, 5);
    expect(ys).toEqual([-2 * LANE_LEAST, -LANE_LEAST, 0, 5, 10]);
    expect(routes.filter((r) => r.outOfRoom).map((r) => r.edge)).toEqual(["a", "b"]);
  });

  it("marks both outer lanes on a way with no room", () => {
    const { routes, ys } = lanesAt({ left: 0, right: 0 }, 5);
    expect(ys).toEqual([-2, -1, 0, 1, 2]);
    expect(routes.filter((r) => r.outOfRoom).map((r) => r.edge)).toEqual(["a", "b", "d", "e"]);
  });

  it("keeps a closed way as one way, with no mark", () => {
    const routes = laneRoutes(runOf({ left: 0, right: 0 }), new Set(), 5);
    expect(routes.every((r) => r.outOfRoom === undefined && r.points[2]!.y === 0)).toBe(true);
  });

  it("leaves a smaller distance of the caller as it is", () => {
    const routes = laneRoutes(runOf({ left: 40, right: 40 }), new Set([runKey(EDGES)]), 0.5);
    expect(routes[0]!.points[2]!.y).toBe(-1);
  });

  it("draws each highway curve at the offset of its lane, so a curve keeps the room too", () => {
    const side = { left: 4, right: 20 };
    const { ys } = lanesAt(side, 5);
    const curves = highwayCurves(runOf(side), new Set([runKey(EDGES)]), 5);
    const at = EDGES.map((edge) => {
      const samples = sampleCurve(curves.find((c) => c.edge === edge)!.segments, 0.1);
      return samples.reduce((best, q) => (Math.abs(q.x - 50) < Math.abs(best.x - 50) ? q : best)).y;
    });
    expect(at.map((y) => Math.round(y * 1000) / 1000)).toEqual(ys.map((y) => Math.round(y * 1000) / 1000));
  });

  it("gives the room to `pullApart` too", () => {
    const routes = pullApart(segmentsOf(runOf({ left: 2, right: 8 })), { spacing: 5, maxWidth: 20 });
    expect(routes.map((r) => r.points[2]!.y)).toEqual([-2, -1, 0, 3.5, 7]);
  });
});
