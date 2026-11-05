import { describe, expect, it } from "vitest";
import { measureRouteFaults } from "../../bench/links.ts";
import { measureQuality } from "../../bench/quality.ts";
import { checkOptions } from "../../strategies/options.ts";
import type { Graph } from "../../model.ts";
import { BORDER_WALK_DEFAULTS, borderWalkRouter, borderWalkStrategy } from "./index.ts";

const box = (id: string, x: number, y: number, w = 40, h = 40) => ({ id, box: { x, y, w, h } });

/** A grid of 4 by 4 boxes with no gap, so each way between two boxes that do not touch runs on the shared sides. */
const PACKED: Graph = {
  nodes: Array.from({ length: 16 }, (_, i) => box(`b${i}`, (i % 4) * 40, Math.floor(i / 4) * 40)),
  edges: [
    { id: "across", source: { node: "b0" }, target: { node: "b3" } },
    { id: "down", source: { node: "b1" }, target: { node: "b13" } },
    { id: "diagonal", source: { node: "b0" }, target: { node: "b15" } },
  ],
};

/** Two boxes with a wide wall between them, and open room above and below the wall. */
const WALLED: Graph = {
  nodes: [box("left", 0, 100), box("wall", 100, 40, 40, 160), box("right", 200, 100)],
  edges: [{ id: "over", source: { node: "left" }, target: { node: "right" } }],
};

const WALK = borderWalkRouter({ name: "border-walk" });
const SHORT = borderWalkRouter({ name: "border-walk-short", leave: 1 });

describe("the control border-walk", () => {
  it("gives the same routes on a second run", () => {
    expect(WALK.route(PACKED)).toEqual(WALK.route(PACKED));
    expect(SHORT.route(PACKED)).toEqual(SHORT.route(PACKED));
  });

  it("gives a route for each edge", () => {
    expect(WALK.route(PACKED).routes.map((r) => r.edge)).toEqual(["across", "down", "diagonal"]);
  });

  it("reads no route through a box on a board with no gap, where a straight line reads each of them", () => {
    expect(measureRouteFaults(PACKED, { routes: PACKED.edges.map((e) => ({ edge: e.id, points: straightOf(e.source.node, e.target.node) })) }).through).toBe(3);
    expect(measureRouteFaults(PACKED, WALK.route(PACKED)).through).toBe(0);
    expect(measureRouteFaults(PACKED, SHORT.route(PACKED)).through).toBe(0);
  });

  it("pays no clearance for it: each form touches the wall", () => {
    const route = (router: typeof WALK) => measureQuality(WALLED, router.route(WALLED));
    expect(route(WALK).clearance).toBeLessThan(1);
    expect(route(SHORT).clearance).toBeLessThan(1);
  });

  it("gives a route that is no longer when a link off a side costs less", () => {
    const length = (router: typeof WALK): number =>
      router.route(WALLED).routes[0]!.points.reduce((sum, p, i, all) => (i === 0 ? 0 : sum + Math.hypot(p.x - all[i - 1]!.x, p.y - all[i - 1]!.y)), 0);
    expect(length(SHORT)).toBeLessThanOrEqual(length(WALK));
  });

  it("does not mark through and gives no shared run", () => {
    const result = WALK.route(PACKED);
    for (const route of result.routes) expect(route.through).toBeUndefined();
    expect(result.runs).toBeUndefined();
  });

  it("gives no route for an edge with an unknown box", () => {
    const board: Graph = { nodes: WALLED.nodes, edges: [{ id: "gone", source: { node: "left" }, target: { node: "none" } }] };
    expect(WALK.route(board).routes).toEqual([]);
  });

  it("has a strategy with valid defaults, which the router reads", () => {
    expect(checkOptions(borderWalkStrategy, BORDER_WALK_DEFAULTS)).toEqual([]);
    expect(borderWalkStrategy.run(PACKED, BORDER_WALK_DEFAULTS)).toEqual(WALK.route(PACKED));
  });
});

/** This function gives the straight line between the centers of two boxes of `PACKED`. */
function straightOf(source: string, target: string): { readonly x: number; readonly y: number }[] {
  const at = (id: string) => {
    const b = PACKED.nodes.find((n) => n.id === id)!.box;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  };
  return [at(source), at(target)];
}
