import { describe, expect, it } from "vitest";
import { makeFixture } from "../../fixtures.ts";
import type { Graph, Result } from "../../model.ts";
import { stableOrderStrategy } from "../../order/index.ts";
import { routerStrategies } from "../../strategies/builtins.ts";
import { orderFragility } from "./order.ts";

const board: Graph = makeFixture({ name: "order", kind: "collections", nodes: 24, edgesPerNode: 2, seed: 9 });

describe("orderFragility (W3)", () => {
  it("gives 0 for a router that routes each edge alone", () => {
    for (const name of ["straight", "corners"] as const) {
      const f = orderFragility(board, (g) => routerStrategies[name].run(g), { orders: 4 });
      expect(f.orders).toBe(4);
      expect(f.changed).toBe(0);
      expect(f.crossings).toBe(0);
      expect(f.ink).toBe(0);
      expect(f.poa).toBe(1);
    }
  });

  it("gives 0 for a router in the stable order", () => {
    const stable = stableOrderStrategy(routerStrategies.shared);
    const f = orderFragility(board, (g) => stable.run(g), { orders: 3 });
    expect(f.changed).toBe(0);
    expect(f.crossings).toBe(0);
  });

  it("counts the orders that change the routes", () => {
    // This router gives the first edge a bend, so each order that moves the first edge changes the routes.
    const route = (g: Graph): Result => ({
      routes: g.edges.map((e, i) => ({ edge: e.id, points: i === 0 ? [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }] : [{ x: 0, y: 0 }, { x: 10, y: 0 }] })),
    });
    const f = orderFragility(board, route, { orders: 10 });
    expect(f.changed).toBeGreaterThan(0.5);
  });
});
