import { describe, expect, it } from "vitest";
import { measureLinks } from "../bench/links.ts";
import { countCrossings } from "../bench/quality.ts";
import { packedGridBoard } from "../cases.ts";
import type { Point } from "../geom.ts";
import { levelLinks } from "../levels.ts";
import type { LevelLink } from "../model.ts";
import { makeRoom, roomLinks, type Boxed } from "./index.ts";
import { gapLaneCounts, gapLanes, LANE_ORDERS, LANE_TRACKS } from "./lanes.ts";

/** Two columns of three boxes, 100 wide and 40 high, with a gap of 20 between the columns and between the rows. */
const boxes: Boxed[] = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) boxes.push({ id: `c${r}-${c}`, box: { x: c * 120, y: r * 60, w: 100, h: 40 } });

/** A link that leaves the box on the left at the height `y0`, goes down the column gap at `x`, and enters the box at `y1` on the side `to`. */
function along(x: number, y0: number, y1: number, to: "left" | "right"): LevelLink {
  const end = to === "right" ? 120 : 100;
  return {
    source: "a",
    target: "b",
    count: 1,
    points: [
      { x: 100, y: y0 },
      { x, y: y0 },
      { x, y: y1 },
      { x: end, y: y1 },
    ],
  };
}

const segs = (links: readonly LevelLink[]): [Point, Point][] => links.flatMap((l) => l.points.slice(1).map((b, i) => [l.points[i]!, b] as [Point, Point]));

describe("gapLanes (ROOM-C)", () => {
  it("gives each link of a gap its own lane around the middle of the gap, and keeps the plugs and the axes of the legs", () => {
    const links = [along(110, 20, 140, "right"), along(110, 20, 80, "right")];
    const out = gapLanes(boxes, links, { spacing: 4, order: "links" });
    expect(out.map((l) => l.points[1]!.x).sort()).toEqual([108, 112]);
    out.forEach((l, i) => {
      expect(l.points[0]).toEqual(links[i]!.points[0]);
      expect(l.points[3]).toEqual(links[i]!.points[3]);
      expect(l.points[1]!.x).toBe(l.points[2]!.x);
      expect(l.points[1]!.y).toBe(links[i]!.points[1]!.y);
    });
  });

  it("puts the lanes nearer in a narrow gap, so that they stay in the gap", () => {
    const links = [0, 1, 2, 3, 4].map((k) => along(110, 20, 140 - k, "right"));
    const xs = gapLanes(boxes, links, { spacing: 8 }).map((l) => l.points[1]!.x);
    for (const x of xs) expect(x > 100 && x < 120).toBe(true);
    expect(new Set(xs).size).toBe(5);
  });

  it("with the order `links`, keeps the order of the list. With the orders `ends` and `crossings`, it removes the crossing", () => {
    // The long link turns right at y 140. The short link turns right at y 80, inside the span of the long link.
    // When the long link is on the right of the short link, the turn of the short link crosses it.
    const links = [along(110, 20, 80, "right"), along(110, 20, 140, "right")];
    const crossings = (order: (typeof LANE_ORDERS)[number]): number => countCrossings(segs(gapLanes(boxes, links, { order })))[0];
    expect(crossings("links")).toBe(1);
    expect(crossings("crossings")).toBe(0);
    const mixed = [along(110, 20, 140, "left"), along(110, 20, 80, "right")];
    expect(countCrossings(segs(gapLanes(boxes, mixed, { order: "ends" })))[0]).toBe(0);
  });

  it("on packedGridBoard: the order `crossings` has fewer crossings than `ends`, and `ends` fewer than `links`", () => {
    const board = packedGridBoard();
    const links = roomLinks(board);
    const room = makeRoom(board.nodes, links, { gutter: 8, spacing: 4 });
    const level = levelLinks(
      room.items.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] })),
      links.map((l) => ({ source: l.source, target: l.target, count: l.count ?? 1 })),
    );
    const count = (order: (typeof LANE_ORDERS)[number]): number => countCrossings(segs(gapLanes(room.items, level, { order })))[0];
    const [byLinks, byEnds, best] = LANE_ORDERS.map(count) as [number, number, number];
    expect(byEnds).toBeLessThan(byLinks);
    expect(best).toBeLessThan(byEnds);
    // The local search removes at least 15% of the crossings of the order of the list.
    expect(best).toBeLessThanOrEqual(0.85 * byLinks);
  });

  it("on packedGridBoard: no lane goes through a box or out of the board, and no link goes out and back, for each order", () => {
    const board = packedGridBoard();
    const links = roomLinks(board);
    const room = makeRoom(board.nodes, links, { gutter: 8, spacing: 4 });
    const level = levelLinks(
      room.items.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] })),
      links.map((l) => ({ source: l.source, target: l.target, count: l.count ?? 1 })),
    );
    const boxes = new Map(room.items.map((n) => [n.id, n.box]));
    for (const order of LANE_ORDERS) {
      const f = measureLinks(boxes, gapLanes(room.items, level, { order, spacing: 8 }));
      expect([f.through, f.outside, f.backtrack]).toEqual([0, 0, 0]);
    }
  });
});

describe("gapLanes with the option tracks (EDA-004)", () => {
  // Three links in the column gap. A and B overlap, B and C overlap, A and C do not.
  // Each order of an overlapping pair costs one crossing, so the left-edge rule is free to put A and C in one lane.
  const three = [along(110, 5, 35, "right"), along(110, 85, 25, "right"), along(110, 75, 145, "right")];
  const lanesOf = (tracks: (typeof LANE_TRACKS)[number]) => gapLaneCounts(boxes, three, { order: "links", tracks }).find((c) => c.axis === "x")!;

  it("the rule `stack` is the default", () => {
    expect(gapLanes(boxes, three, { order: "links", tracks: "stack" })).toEqual(gapLanes(boxes, three, { order: "links" }));
  });

  it("the left-edge rule puts two pieces that do not overlap in one lane, at the same crossings", () => {
    expect(lanesOf("stack")).toMatchObject({ lanes: 3, pieces: 3, density: 2 });
    expect(lanesOf("left-edge").lanes).toBe(2);
    expect(lanesOf("free").lanes).toBe(2);
    const crossings = (tracks: (typeof LANE_TRACKS)[number]): number => countCrossings(segs(gapLanes(boxes, three, { order: "links", tracks })))[0];
    expect(crossings("left-edge")).toBeLessThanOrEqual(crossings("stack"));
    const xs = gapLanes(boxes, three, { order: "links", tracks: "left-edge" }).map((l) => l.points[1]!.x);
    expect(xs[0]).toBe(xs[2]);
    for (const x of xs) expect(x > 100 && x < 120).toBe(true);
  });

  it("keeps the order of two pieces that overlap where the swap adds crossings", () => {
    // The turn of the short link at y 80 is inside the span of the long link, so the long link stays on the far side.
    const pair = [along(110, 20, 80, "right"), along(110, 20, 140, "right")];
    for (const tracks of LANE_TRACKS.slice(0, 2)) {
      expect(countCrossings(segs(gapLanes(boxes, pair, { order: "crossings", tracks })))[0]).toBe(0);
    }
  });

  it("on packedGridBoard: each rule gives at least the density, the left edge gives fewer lanes than the stack, and no more crossings", () => {
    const board = packedGridBoard();
    const links = roomLinks(board);
    const room = makeRoom(board.nodes, links, { gutter: 8, spacing: 4 });
    const level = levelLinks(
      room.items.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] })),
      links.map((l) => ({ source: l.source, target: l.target, count: l.count ?? 1 })),
    );
    const sum = (tracks: (typeof LANE_TRACKS)[number]): number => {
      const counts = gapLaneCounts(room.items, level, { tracks });
      for (const c of counts) expect(c.lanes).toBeGreaterThanOrEqual(c.density);
      return counts.reduce((s, c) => s + c.lanes, 0);
    };
    const [stack, left, free] = LANE_TRACKS.map(sum) as [number, number, number];
    expect(left).toBeLessThan(stack);
    expect(free).toBeLessThanOrEqual(left);
    expect(gapLaneCounts(room.items, level, { tracks: "free" }).every((c) => c.lanes === c.density)).toBe(true);
    const crossings = (tracks: (typeof LANE_TRACKS)[number]): number => countCrossings(segs(gapLanes(room.items, level, { tracks })))[0];
    expect(crossings("left-edge")).toBeLessThanOrEqual(crossings("stack"));
    const boxes = new Map(room.items.map((n) => [n.id, n.box]));
    for (const tracks of LANE_TRACKS) {
      const f = measureLinks(boxes, gapLanes(room.items, level, { tracks, spacing: 8 }));
      expect([f.through, f.outside, f.backtrack]).toEqual([0, 0, 0]);
    }
  });
});
