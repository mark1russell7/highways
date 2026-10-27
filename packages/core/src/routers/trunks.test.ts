import { describe, expect, it } from "vitest";
import { checkProperties } from "../bench/properties.ts";
import { measureQuality } from "../bench/quality.ts";
import { makeFixture, type FixtureKind } from "../fixtures.ts";
import type { Graph, Result } from "../model.ts";
import { CASES } from "../cases.ts";
import type { Point } from "../geom.ts";
import { cornersRouter } from "./corners.ts";
import { byCollection, groupEdges, laneOrder, leaveTrunk, sharedWays, splitPoint, trunksRouter } from "./trunks.ts";

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

describe("leaveTrunk", () => {
  const free = (): boolean => true;
  const trunk: Point[] = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 },
    { x: 150, y: 0 },
  ];

  it("keeps the split point for a branch that goes on ahead", () => {
    const branch = [{ x: 150, y: 0 }, { x: 200, y: 10 }, { x: 210, y: 10 }];
    expect(leaveTrunk(trunk, branch, free)).toEqual({ at: 4, point: { x: 150, y: 0 }, rest: branch.slice(1) });
  });

  it("leaves at an earlier point when the branch goes back along the trunk", () => {
    const branch = [{ x: 150, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 105, y: 60 }];
    expect(leaveTrunk(trunk, branch, free)).toEqual({ at: 3, point: { x: 100, y: 0 }, rest: branch.slice(2) });
  });

  it("leaves at the foot of the next point on the second leg, when the line from there is free", () => {
    const branch = [{ x: 150, y: 0 }, { x: 30, y: 40 }, { x: 30, y: 45 }];
    expect(leaveTrunk(trunk, branch, free)).toEqual({ at: 1 + 25 / 45, point: { x: 30, y: 0 }, rest: branch.slice(1) });
    expect(leaveTrunk(trunk, branch, () => false)).toEqual({ at: 4, point: { x: 150, y: 0 }, rest: branch.slice(1) });
  });

  it("gives undefined when the target is behind or beside the plug", () => {
    expect(leaveTrunk(trunk, [{ x: 150, y: 0 }, { x: 0, y: 40 }, { x: 0, y: 45 }], free)).toBeUndefined();
    expect(leaveTrunk(trunk, [{ x: 150, y: 0 }, { x: 10, y: 40 }, { x: 10, y: 45 }], free, 10)).toBeUndefined();
    expect(leaveTrunk(trunk, [{ x: 150, y: 0 }, { x: 20, y: 40 }, { x: 20, y: 45 }], free, 10)?.point).toEqual({ x: 20, y: 0 });
  });
});

describe("sharedWays", () => {
  it("gives a way for each set of routes that go on together", () => {
    const p = (x: number, y: number): Point => ({ x, y });
    const routes = [
      { edge: "a", points: [p(0, 0), p(10, 0), p(20, 0), p(30, 0), p(40, 10)] },
      { edge: "b", points: [p(0, 0), p(10, 0), p(20, 0), p(30, 0), p(40, -10)] },
      { edge: "c", points: [p(0, 0), p(10, 0), p(20, 0), p(20, 10)] },
      { edge: "d", points: [p(0, 0), p(10, 0), p(10, 10)] },
    ];
    expect(sharedWays(routes, 2)).toEqual([
      { points: [p(10, 0), p(20, 0)], edges: ["a", "b", "c"] },
      { points: [p(20, 0), p(30, 0)], edges: ["a", "b"] },
    ]);
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

  it("turns fewer lanes back where they leave the trunk than version 0.2.0, on the case boards", () => {
    const ahead = (a: Point, s: Point, q: Point): boolean => (s.x - a.x) * (q.x - s.x) + (s.y - a.y) * (q.y - s.y) > -1e-6;
    // This function counts the lanes that turn back by more than 90 degrees where they leave their bundle or their last run.
    const backs = (g: Graph, result: Result): number => {
      const routes = new Map(result.routes.map((r) => [r.edge, r.points]));
      const lanes = new Map<string, number>();
      for (const b of result.bundles ?? []) for (const e of b.edges) lanes.set(e, b.trunk.length);
      for (const r of result.runs ?? []) {
        const end = r.points.at(-1)!;
        for (const e of r.edges) lanes.set(e, Math.max(lanes.get(e) ?? 0, routes.get(e)!.findIndex((p) => p.x === end.x && p.y === end.y) + 1));
      }
      expect(checkProperties(g, result)).toEqual([]);
      return [...lanes].filter(([e, n]) => {
        const [a, s, q] = routes.get(e)!.slice(n - 2, n + 1);
        return a && s && q && !ahead(a, s, q);
      }).length;
    };
    const rule = (): string => "all";
    let now = 0;
    let before = 0;
    for (const c of CASES) {
      const g = c.make();
      const n = backs(g, trunksRouter({ name: "trunks-all", rule }).route(g));
      const old = backs(g, trunksRouter({ name: "trunks-all", rule, leave: "split" }).route(g));
      expect(n, c.name).toBeLessThanOrEqual(old);
      now += n;
      before += old;
    }
    expect(now).toBeLessThan(before / 4);
  });

  it("keeps the routes of version 0.2.0 with the option leave: split", () => {
    const old = trunksRouter({ name: "trunks", rule: byCollection, leave: "split" }).route(star);
    expect(old.runs).toBeUndefined();
    expect(old.bundles![0]!.edges).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(checkProperties(star, old)).toEqual([]);
  });

  it("gives the same result for the same input", () => {
    const g = makeFixture({ name: "t", kind: "hubs", nodes: 100, edgesPerNode: 3, seed: 4 });
    expect(JSON.stringify(trunks.route(g))).toBe(JSON.stringify(trunks.route(g)));
  });
});
