import { describe, expect, it } from "vitest";
import { sameData } from "../bench/run.ts";
import { makeFixture } from "../fixtures.ts";
import type { Graph } from "../model.ts";
import { routerStrategies } from "../strategies/builtins.ts";
import { asRouter } from "../strategies/model.ts";
import { routeInStableOrder, shuffleEdges, stableOrder, stableOrderStrategy, withStableOrder } from "./index.ts";

const board: Graph = makeFixture({ name: "order", kind: "collections", nodes: 30, edgesPerNode: 2, seed: 5, fixedPorts: 0.2 });
const ids = (g: Graph): string[] => g.edges.map((e) => e.id);

describe("shuffleEdges and stableOrder", () => {
  it("keeps the edges, and the seed fixes the order", () => {
    const a = shuffleEdges(board, 7);
    expect([...ids(a)].sort()).toEqual([...ids(board)].sort());
    expect(ids(shuffleEdges(board, 7))).toEqual(ids(a));
    expect(ids(shuffleEdges(board, 8))).not.toEqual(ids(a));
    expect(a.nodes).toBe(board.nodes);
  });

  it("gives one order for each order of the input", () => {
    const want = ids(stableOrder(board));
    for (const seed of [1, 2, 3]) expect(ids(stableOrder(shuffleEdges(board, seed)))).toEqual(want);
  });
});

describe("stableOrderStrategy (WILD-053)", () => {
  const names = ["straight", "corners", "trunks", "shared", "shared-all", "sections"] as const;
  for (const name of names) {
    it(`gives the same output of ${name} for each order of the input edges`, () => {
      const stable = stableOrderStrategy(routerStrategies[name]);
      expect(stable.name).toBe(`${name}+stable`);
      const want = stable.run(board);
      for (const seed of [1, 2]) {
        const got = stable.run(shuffleEdges(board, seed));
        const order = new Map(board.edges.map((e, i) => [e.id, i]));
        // The routes come back in the order of the input edges, so sort them to compare.
        const sorted = [...got.routes].sort((x, y) => order.get(x.edge)! - order.get(y.edge)!);
        expect(sameData({ ...got, routes: sorted }, want)).toBe(true);
      }
    });
  }

  it("gives the routes in the order of the input edges", () => {
    const shuffled = shuffleEdges(board, 3);
    const out = routeInStableOrder(shuffled, (g) => routerStrategies.corners.run(g));
    expect(out.routes.map((r) => r.edge)).toEqual(ids(shuffled));
  });

  it("does not change the strategy, its defaults or the router", () => {
    const base = routerStrategies.trunks;
    const stable = stableOrderStrategy(base);
    expect(stable.defaults).toEqual(base.defaults);
    expect(stable.schema).toEqual(base.schema);
    expect(sameData(base.run(board), asRouter(routerStrategies.trunks).route(board))).toBe(true);
    const router = withStableOrder(asRouter(base));
    expect(router.name).toBe("trunks");
    expect(sameData(router.route(board), stable.run(board))).toBe(true);
  });
});
