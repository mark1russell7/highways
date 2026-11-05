import { describe, expect, it } from "vitest";
import { measureRouteFaults } from "../../bench/links.ts";
import { checkOptions } from "../../strategies/options.ts";
import type { Graph } from "../../model.ts";
import { PERIMETER_MARGIN, perimeterRouter, perimeterStrategy } from "./index.ts";

const box = (id: string, x: number, y: number, w = 40, h = 40) => ({ id, box: { x, y, w, h } });

/** A frame of four boxes, with one box in the middle of the board. The frame is (0, 0) to (240, 240). */
const BOARD: Graph = {
  nodes: [box("nw", 0, 0), box("ne", 200, 0), box("sw", 0, 200), box("se", 200, 200), box("mid", 100, 100)],
  edges: [
    { id: "top", source: { node: "nw" }, target: { node: "ne" } },
    { id: "diagonal", source: { node: "nw" }, target: { node: "se" } },
    { id: "middle", source: { node: "mid" }, target: { node: "ne" } },
  ],
};

const RING = { x0: -PERIMETER_MARGIN, y0: -PERIMETER_MARGIN, x1: 240 + PERIMETER_MARGIN, y1: 240 + PERIMETER_MARGIN };

const onRing = (p: { readonly x: number; readonly y: number }): boolean =>
  ((p.x === RING.x0 || p.x === RING.x1) && p.y >= RING.y0 && p.y <= RING.y1) || ((p.y === RING.y0 || p.y === RING.y1) && p.x >= RING.x0 && p.x <= RING.x1);

const lengthOf = (points: readonly { readonly x: number; readonly y: number }[]): number =>
  points.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - points[i]!.x) + Math.abs(p.y - points[i]!.y), 0);

describe("the control perimeter", () => {
  it("gives the same routes on a second run", () => {
    expect(perimeterRouter.route(BOARD)).toEqual(perimeterRouter.route(BOARD));
  });

  it("keeps each point between the plugs on the ring", () => {
    for (const route of perimeterRouter.route(BOARD).routes) {
      for (const p of route.points.slice(1, -1)) expect(onRing(p), route.edge).toBe(true);
    }
  });

  it("goes by the shorter way around the ring", () => {
    const route = perimeterRouter.route(BOARD).routes.find((r) => r.edge === "diagonal")!;
    const ringPart = route.points.slice(1, -1);
    expect(lengthOf(ringPart)).toBeLessThanOrEqual((2 * (RING.x1 - RING.x0 + RING.y1 - RING.y0)) / 2);
  });

  it("takes no box on its way on a board with a free way out for each end", () => {
    expect(measureRouteFaults(BOARD, perimeterRouter.route(BOARD)).through).toBe(0);
  });

  it("takes the side with the fewest boxes on the way out", () => {
    const board: Graph = {
      nodes: [box("wall", 0, 0, 100, 40), box("a", 0, 100, 40, 40), box("b", 60, 100, 40, 40), box("floor", 0, 200, 100, 40)],
      edges: [{ id: "e", source: { node: "a" }, target: { node: "b" } }],
    };
    const { points } = perimeterRouter.route(board).routes[0]!;
    expect(points[0]).toEqual({ x: 0, y: 120 });
    expect(points.at(-1)).toEqual({ x: 100, y: 120 });
  });

  it("keeps a fixed plug, and it leaves by the side of the plug", () => {
    const board: Graph = {
      nodes: [{ ...box("a", 0, 0), ports: [{ id: "p", side: "south", along: 0.25 }] }, box("b", 100, 0)],
      edges: [{ id: "e", source: { node: "a", port: "p" }, target: { node: "b" } }],
    };
    const { points } = perimeterRouter.route(board).routes[0]!;
    expect(points[0]).toEqual({ x: 10, y: 40 });
    expect(points[1]).toEqual({ x: 10, y: 40 + PERIMETER_MARGIN });
  });

  it("reads through over 0 on a dense board, where each way out of a box crosses a box", () => {
    const nodes = Array.from({ length: 25 }, (_, i) => box(`n${i}`, (i % 5) * 50, Math.floor(i / 5) * 50));
    const board: Graph = { nodes, edges: [{ id: "e", source: { node: "n12" }, target: { node: "n0" } }] };
    expect(measureRouteFaults(board, perimeterRouter.route(board)).through).toBeGreaterThan(0);
  });

  it("has a strategy with the routes of the router and with no options", () => {
    expect(perimeterStrategy.run(BOARD, {})).toEqual(perimeterRouter.route(BOARD));
    expect(checkOptions(perimeterStrategy, {})).toEqual([]);
  });
});
