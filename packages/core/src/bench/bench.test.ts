import { describe, expect, it } from "vitest";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import type { Graph, Result, Router } from "../model.ts";
import { straightRouter } from "../routers/straight.ts";
import { checkProperties } from "./properties.ts";
import { countCrossings, measureQuality, measureStability, sideAngle } from "./quality.ts";
import { benchOne, formatTable, runBenchmark } from "./run.ts";

// Three nodes in a row: a straight edge from a to c goes through b.
const row: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 0, w: 20, h: 20 }, ports: [{ id: "p", at: { x: 20, y: 10 } }] },
    { id: "b", box: { x: 50, y: 0, w: 20, h: 20 } },
    { id: "c", box: { x: 100, y: 0, w: 20, h: 20 } },
  ],
  edges: [{ id: "ac", source: { node: "a", port: "p" }, target: { node: "c" } }],
};

describe("checkProperties", () => {
  it("finds a route through a node", () => {
    const v = checkProperties(row, straightRouter.route(row));
    expect(v.map((x) => x.rule)).toEqual(["no-pass-through"]);
  });
  it("accepts a route around the node", () => {
    const r: Result = { routes: [{ edge: "ac", points: [{ x: 20, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 30 }, { x: 80, y: 30 }, { x: 80, y: 10 }, { x: 100, y: 10 }] }] };
    expect(checkProperties(row, r)).toEqual([]);
  });
  it("finds a missing route, a moved fixed plug and an end away from its node", () => {
    expect(checkProperties(row, { routes: [] })[0]?.rule).toBe("complete");
    const moved: Result = { routes: [{ edge: "ac", points: [{ x: 20, y: 5 }, { x: 20, y: 40 }, { x: 110, y: 40 }, { x: 110, y: 20 }] }] };
    expect(checkProperties(row, moved).map((x) => x.rule)).toEqual(["fixed-plugs"]);
    const away: Result = { routes: [{ edge: "ac", points: [{ x: 20, y: 10 }, { x: 20, y: 40 }, { x: 110, y: 40 }, { x: 110, y: 60 }] }] };
    expect(checkProperties(row, away).map((x) => x.rule)).toEqual(["ends-at-plugs"]);
  });
  it("checks that the counts of a level add up", () => {
    const g: Graph = { nodes: row.nodes, edges: [...row.edges, { id: "ab", source: { node: "a" }, target: { node: "b" } }] };
    const good: Result = {
      routes: [],
      levels: [{ depth: 0, items: [{ id: "ab", box: { x: 0, y: 0, w: 70, h: 20 }, nodes: ["a", "b"] }, { id: "c", box: row.nodes[2]!.box, nodes: ["c"] }], links: [{ source: "ab", target: "c", count: 1, points: [] }] }],
    };
    expect(checkProperties(g, good).filter((v) => v.rule === "counts-sum")).toEqual([]);
    const bad: Result = { ...good, levels: [{ ...good.levels![0]!, links: [{ source: "ab", target: "c", count: 2, points: [] }] }] };
    expect(checkProperties(g, bad).filter((v) => v.rule === "counts-sum")).toHaveLength(1);
  });
});

describe("measureQuality", () => {
  it("counts a shared segment one time in the ink, and crossings between drawn segments", () => {
    const g: Graph = {
      nodes: [
        { id: "a", box: { x: 0, y: 0, w: 2, h: 2 } },
        { id: "b", box: { x: 100, y: 0, w: 2, h: 2 } },
      ],
      edges: [
        { id: "1", source: { node: "a" }, target: { node: "b" } },
        { id: "2", source: { node: "a" }, target: { node: "b" } },
      ],
    };
    const line = [{ x: 2, y: 1 }, { x: 100, y: 1 }];
    const q = measureQuality(g, { routes: [{ edge: "1", points: line }, { edge: "2", points: line }] });
    expect(q.ink).toBeCloseTo(98);
    expect(q.crossings).toBe(0);
    expect(q.detour).toBeCloseTo(1);
    expect(q.plugAngle).toBeCloseTo(0);
  });
  it("estimates the crossings of a large set close to the exact count", () => {
    const segs = Array.from({ length: 30_000 }, (_, i) => {
      const y = i % 150;
      return i < 15_000 ? ([{ x: 0, y: y + 0.5 }, { x: 150, y: y + 0.5 }] as const) : ([{ x: y + 0.5, y: 0 }, { x: y + 0.5, y: 150 }] as const);
    });
    const [n, est] = countCrossings(segs);
    expect(est).toBe(true);
    expect(n / (15_000 * 15_000)).toBeGreaterThan(0.85);
    expect(n / (15_000 * 15_000)).toBeLessThan(1.15);
    // All the segments share one or two buckets, so each query visits each segment. A CI runner needs more than 5 s.
  }, 30_000);
  it("gives the angle of a route at the side of its node", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    expect(sideAngle(box, { x: 10, y: 5 }, { x: 20, y: 5 })).toBeCloseTo(0);
    expect(sideAngle(box, { x: 10, y: 5 }, { x: 10, y: 20 })).toBeCloseTo(90);
    expect(sideAngle(box, { x: 5, y: 5 }, { x: 20, y: 5 })).toBeUndefined();
  });
});

describe("measureStability", () => {
  it("gives 0 for the same result and the shift for a moved route", () => {
    const a: Result = { routes: [{ edge: "e", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] };
    const b: Result = { routes: [{ edge: "e", points: [{ x: 0, y: 4 }, { x: 10, y: 4 }] }] };
    expect(measureStability(a, a).mean).toBe(0);
    expect(measureStability(a, b)).toEqual({ mean: 4, max: 4, moved: 1 });
  });
});

describe("runBenchmark", () => {
  it("races the straight router on the small fixtures with no broken rule except pass-through", () => {
    const rows = runBenchmark([straightRouter], FIXTURES.filter((f) => f.nodes <= 400), { repeat: 2 });
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.deterministic).toBe(true);
      expect(r.sample.every((v) => v.rule === "no-pass-through")).toBe(true);
      expect(r.quality.bends).toBe(0);
    }
    expect(formatTable(rows).split("\n")).toHaveLength(5);
  });
  it("finds a router that gives different results for the same input", () => {
    let n = 0;
    const flaky: Router = { name: "flaky", route: (g) => ({ routes: straightRouter.route(g).routes.map((r) => ({ ...r, points: r.points.map((p) => ({ x: p.x + n++, y: p.y })) })) }) };
    expect(benchOne(flaky, "x", makeFixture(FIXTURES[0]!), 2).deterministic).toBe(false);
  });
});
