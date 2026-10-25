import { describe, expect, it } from "vitest";
import { checkProperties } from "../bench/properties.ts";
import { measureQuality } from "../bench/quality.ts";
import { makeFixture, type FixtureKind } from "../fixtures.ts";
import type { Graph } from "../model.ts";
import { cornersRouter } from "./corners.ts";
import { byCollection, groupEdges, laneOrder, splitPoint, trunksRouter } from "./trunks.ts";

const trunks = trunksRouter({ name: "trunks", rule: byCollection });

// One node with five edges to five nodes of one collection, to the east.
const star: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 200, w: 40, h: 40 } },
    ...[0, 1, 2, 3, 4].map((i) => ({ id: `t${i}`, box: { x: 400, y: i * 100, w: 40, h: 40 } })),
  ],
  edges: [3, 0, 4, 1, 2].map((i) => ({ id: `e${i}`, source: { node: "a" }, target: { node: `t${i}` }, data: { collection: "users" } })),
};

describe("groupEdges", () => {
  it("groups by the source plug and the key, and drops small groups", () => {
    const g = groupEdges(
      [
        { id: "1", source: { node: "a" }, target: { node: "b" }, data: { collection: "x" } },
        { id: "2", source: { node: "a" }, target: { node: "c" }, data: { collection: "x" } },
        { id: "3", source: { node: "a", port: "p" }, target: { node: "c" }, data: { collection: "x" } },
        { id: "4", source: { node: "a" }, target: { node: "c" }, data: { collection: "y" } },
        { id: "5", source: { node: "a" }, target: { node: "c" } },
      ],
      byCollection,
    );
    expect([...g.values()].map((l) => l.map((e) => e.id))).toEqual([["1", "2"]]);
  });
});

describe("laneOrder", () => {
  it("puts the branch that turns most to the left in lane 0", () => {
    const order = laneOrder({ x: 1, y: 0 }, { x: 0, y: 0 }, [
      { edge: "down", next: { x: 10, y: 10 } },
      { edge: "up", next: { x: 10, y: -10 } },
      { edge: "ahead", next: { x: 10, y: 0 } },
    ]);
    expect(order).toEqual(["up", "ahead", "down"]);
  });
});

describe("splitPoint", () => {
  it("stops at half of the way to the nearest target, and moves out of the boxes", () => {
    const free = (): boolean => true;
    expect(splitPoint({ x: 0, y: 0 }, [{ x: 100, y: 0 }], 0.9, free, 5)).toEqual({ x: 50, y: 0 });
    expect(splitPoint({ x: 0, y: 0 }, [{ x: 100, y: 0 }], 0.9, (p) => p.x < 32, 5)).toEqual({ x: 30, y: 0 });
  });
});

describe("trunksRouter", () => {
  it("bundles a star into one trunk with lanes in the order of the targets", () => {
    const result = trunks.route(star);
    expect(checkProperties(star, result)).toEqual([]);
    expect(result.bundles).toHaveLength(1);
    expect(result.bundles![0]!.edges).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    const corners = cornersRouter({ name: "corners" }).route(star);
    expect(measureQuality(star, result).ink).toBeLessThan(measureQuality(star, corners).ink);
  });

  it("keeps the hard rules on generated graphs (property, 5 kinds × 3 seeds)", () => {
    const kinds: FixtureKind[] = ["uniform", "clustered", "grid", "hubs", "collections"];
    for (const kind of kinds) {
      for (let seed = 1; seed <= 3; seed++) {
        const g = makeFixture({ name: "t", kind, nodes: 80, edgesPerNode: 3, seed, fixedPorts: 0.2 });
        const result = trunks.route(g);
        expect(checkProperties(g, result), `${kind} ${seed}`).toEqual([]);
        expect((result.bundles ?? []).length, `${kind} ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it("uses less ink than the corner router when nodes fan out to one collection", () => {
    const g = makeFixture({ name: "t", kind: "collections", nodes: 150, edgesPerNode: 2, seed: 9 });
    const result = trunks.route(g);
    expect(checkProperties(g, result)).toEqual([]);
    const corners = cornersRouter({ name: "corners" }).route(g);
    expect(measureQuality(g, result).ink).toBeLessThan(measureQuality(g, corners).ink);
  });

  it("gives the same result for the same input", () => {
    const g = makeFixture({ name: "t", kind: "hubs", nodes: 100, edgesPerNode: 3, seed: 4 });
    expect(JSON.stringify(trunks.route(g))).toBe(JSON.stringify(trunks.route(g)));
  });
});
