import { describe, expect, it } from "vitest";
import { makeFixture } from "../../fixtures.ts";
import { straightRouter } from "../../routers/index.ts";
import { roomOrderFaults } from "./room.ts";
import { changeGraph, moveResponse, routeStability } from "./stability.ts";

describe("changeGraph and routeStability (Z10)", () => {
  const graph = makeFixture({ name: "t", kind: "uniform", nodes: 40, edgesPerNode: 2, seed: 5 });

  it("makes the same small change for the same seed", () => {
    const a = changeGraph(graph, 3);
    expect(changeGraph(graph, 3)).toEqual(a);
    expect(a.graph.nodes).toHaveLength(graph.nodes.length);
    expect(a.graph.edges).toHaveLength(graph.edges.length);
    expect(a.removed).toBeDefined();
    expect(a.added).toBe(`${a.removed}~`);
    const moved = graph.nodes.filter((n, i) => n.box !== a.graph.nodes[i]!.box);
    expect(moved.map((n) => n.id)).toEqual(a.moved ? [a.moved] : []);
  });

  it("gives 0 for the same routes, and a move for a moved node", () => {
    const before = straightRouter.route(graph);
    expect(routeStability(graph, before, before)).toEqual({ mean: 0, max: 0, moved: 0 });
    const change = changeGraph(graph, 3);
    const after = routeStability(graph, before, straightRouter.route(change.graph));
    expect(after.max).toBeGreaterThan(0);
  });
});

describe("roomOrderFaults (M2, room-order)", () => {
  const box = (id: string, x: number, y = 0) => ({ id, box: { x, y, w: 10, h: 10 } });
  const before = [box("a", 0), box("b", 10), box("c", 20)];

  it("gives 0 when the gaps open and the order stays", () => {
    expect(roomOrderFaults(before, [box("a", 0), box("b", 18), box("c", 36)])).toBe(0);
  });

  it("counts each pair whose order changes", () => {
    expect(roomOrderFaults(before, [box("a", 0), box("b", 30), box("c", 15)])).toBe(1);
    // A box that moves down out of its row changes its relation with each other box on y.
    expect(roomOrderFaults(before, [box("a", 0), box("b", 10, 30), box("c", 20)])).toBe(2);
  });
});

describe("changeGraph with edges: false and moveResponse (Z11)", () => {
  const graph = makeFixture({ name: "t", kind: "uniform", nodes: 40, edgesPerNode: 2, seed: 5 });

  it("moves the node of the full change, and keeps the edges", () => {
    const full = changeGraph(graph, 3);
    const move = changeGraph(graph, 3, { edges: false });
    expect(move.moved).toBe(full.moved);
    expect(move.graph.edges).toEqual(graph.edges);
    expect(move.added).toBeUndefined();
    expect(move.removed).toBeUndefined();
  });

  it("gives a local response for straight routes: only the edges of the moved node move", () => {
    const move = changeGraph(graph, 3, { edges: false });
    const router = straightRouter;
    const z = moveResponse(graph, move, router.route(graph), router.route(move.graph));
    expect(z).toBeDefined();
    expect(z!.spill).toBe(0);
    // An end of each edge of the moved node moves by one unit, so the gain is at most 1.
    expect(z!.gain).toBeGreaterThan(0);
    expect(z!.gain).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("gives undefined when no node moved", () => {
    const router = straightRouter;
    const r = router.route(graph);
    expect(moveResponse(graph, { graph }, r, r)).toBeUndefined();
  });
});
