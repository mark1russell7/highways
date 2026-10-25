import { describe, expect, it } from "vitest";
import { checkProperties } from "../bench/properties.ts";
import { measureQuality } from "../bench/quality.ts";
import { makeFixture, type FixtureKind } from "../fixtures.ts";
import type { Graph } from "../model.ts";
import { cornersRouter } from "./corners.ts";
import { plugsRouter } from "./plugs.ts";

const corners = cornersRouter({ name: "corners" });
const smooth = cornersRouter({ name: "corners-smooth", smooth: true });

// A wall between a and b: the straight way goes through it.
const wall: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 0, w: 40, h: 40 } },
    { id: "w", box: { x: 100, y: -100, w: 20, h: 240 } },
    { id: "b", box: { x: 200, y: 0, w: 40, h: 40 } },
  ],
  edges: [{ id: "ab", source: { node: "a" }, target: { node: "b" } }],
};

// Two groups of nodes, far apart, and one edge between them. The nearest corners of each group are all in that group.
const groups: Graph = {
  nodes: [0, 1].flatMap((gi) =>
    Array.from({ length: 16 }, (_, i) => ({
      id: `g${gi}n${i}`,
      box: { x: gi * 3000 + (i % 4) * 60, y: Math.floor(i / 4) * 60, w: 40, h: 40 },
    })),
  ),
  edges: [{ id: "far", source: { node: "g0n5" }, target: { node: "g1n10" } }],
};

describe("cornersRouter", () => {
  it("links groups of nodes across empty space", () => {
    for (const r of [corners, smooth]) expect(checkProperties(groups, r.route(groups))).toEqual([]);
  });

  it("goes around a wall", () => {
    for (const r of [corners, smooth]) {
      const result = r.route(wall);
      expect(checkProperties(wall, result)).toEqual([]);
      expect(measureQuality(wall, result).detour).toBeGreaterThan(1.5);
    }
  });

  it("keeps the hard rules on generated graphs (property, 5 kinds × 4 seeds)", () => {
    const kinds: FixtureKind[] = ["uniform", "clustered", "grid", "hubs", "collections"];
    for (const kind of kinds) {
      for (let seed = 1; seed <= 4; seed++) {
        const g = makeFixture({ name: "t", kind, nodes: 80, edgesPerNode: 2, seed, fixedPorts: 0.2 });
        for (const r of [corners, smooth]) expect(checkProperties(g, r.route(g)), `${r.name} ${kind} ${seed}`).toEqual([]);
      }
    }
  });

  it("gives the same result for the same input", () => {
    const g = makeFixture({ name: "t", kind: "clustered", nodes: 120, edgesPerNode: 2, seed: 9 });
    expect(JSON.stringify(smooth.route(g))).toBe(JSON.stringify(smooth.route(g)));
  });
});

describe("plugsRouter", () => {
  it("ends each route at its plugs", () => {
    const g = makeFixture({ name: "t", kind: "uniform", nodes: 60, edgesPerNode: 2, seed: 2, fixedPorts: 0.3 });
    const v = checkProperties(g, plugsRouter.route(g)).filter((x) => x.rule !== "no-pass-through");
    expect(v).toEqual([]);
  });
});
