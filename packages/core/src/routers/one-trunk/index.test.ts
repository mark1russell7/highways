import { describe, expect, it } from "vitest";
import { measureQuality, routePairCrossings } from "../../bench/quality.ts";
import { checkOptions } from "../../strategies/options.ts";
import type { Graph } from "../../model.ts";
import { oneTrunkRouter, oneTrunkStrategy } from "./index.ts";

const box = (id: string, x: number, y: number) => ({ id, box: { x, y, w: 40, h: 20 } });

/** Two boxes above the trunk and two boxes below it. The two edges interleave on the trunk. */
const BOARD: Graph = {
  nodes: [box("a", 0, 0), box("b", 100, 0), box("c", 200, 200), box("d", 300, 200)],
  edges: [
    { id: "e1", source: { node: "a" }, target: { node: "c" } },
    { id: "e2", source: { node: "b" }, target: { node: "d" } },
    { id: "e3", source: { node: "a" }, target: { node: "d" } },
  ],
};

describe("the control one-trunk", () => {
  it("gives the same routes on a second run", () => {
    expect(oneTrunkRouter.route(BOARD)).toEqual(oneTrunkRouter.route(BOARD));
  });

  it("puts each route on one line through the middle of the board", () => {
    const { routes } = oneTrunkRouter.route(BOARD);
    expect(routes.map((r) => r.edge)).toEqual(["e1", "e2", "e3"]);
    for (const route of routes) {
      expect(route.points[1]!.y).toBe(110);
      expect(route.points.at(-2)!.y).toBe(110);
      for (const p of route.points.slice(1, -1)) expect(p.y).toBe(110);
    }
  });

  it("shares each stretch by the same two vertices", () => {
    const { routes } = oneTrunkRouter.route(BOARD);
    const stretch = (edge: string): string[] => {
      const points = routes.find((r) => r.edge === edge)!.points.slice(1, -1);
      return points.slice(1).map((p, i) => `${points[i]!.x}-${p.x}`);
    };
    expect(stretch("e1").filter((s) => stretch("e3").includes(s))).toEqual(stretch("e1"));
  });

  it("buys the ink count and pays in the pair count", () => {
    const board: Graph = {
      nodes: [box("a", 0, 0), box("b", 100, 200), box("c", 200, 200), box("d", 300, 0)],
      edges: [
        { id: "e1", source: { node: "a" }, target: { node: "c" } },
        { id: "e2", source: { node: "b" }, target: { node: "d" } },
      ],
    };
    const result = oneTrunkRouter.route(board);
    expect(measureQuality(board, result).crossings).toBe(0);
    expect(routePairCrossings(result.routes).pairs).toBe(1);
  });

  it("keeps a fixed plug, and it does not repeat a point at a plug on the trunk", () => {
    const board: Graph = {
      nodes: [
        { ...box("a", 0, 0), ports: [{ id: "p", side: "east", along: 0.5 }] },
        { ...box("b", 100, 0), ports: [{ id: "q", side: "west", along: 0.5 }] },
      ],
      edges: [{ id: "e", source: { node: "a", port: "p" }, target: { node: "b", port: "q" } }],
    };
    expect(oneTrunkRouter.route(board).routes[0]!.points).toEqual([
      { x: 40, y: 10 },
      { x: 100, y: 10 },
    ]);
  });

  it("gives a route of two points when both ends take one place", () => {
    const board: Graph = {
      nodes: [{ ...box("a", 0, 0), ports: [{ id: "p", side: "east", along: 0.5 }] }],
      edges: [{ id: "e", source: { node: "a", port: "p" }, target: { node: "a", port: "p" } }],
    };
    expect(oneTrunkRouter.route(board).routes[0]!.points).toHaveLength(2);
  });

  it("has a strategy with the routes of the router and with no options", () => {
    expect(oneTrunkStrategy.run(BOARD, {})).toEqual(oneTrunkRouter.route(BOARD));
    expect(checkOptions(oneTrunkStrategy, {})).toEqual([]);
  });
});
