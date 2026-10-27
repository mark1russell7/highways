import { describe, expect, it } from "vitest";
import { checkLevels, checkProperties } from "../bench/properties.ts";
import { sameData } from "../bench/run.ts";
import { packedGridBoard } from "../cases.ts";
import type { Graph, Level, Result, Route } from "../model.ts";
import { routerStrategies } from "../strategies/builtins.ts";
import { nearestOnBoundary, repairResult, repairStrategy } from "./index.ts";

const node = (id: string, x: number, y: number, w = 10, h = 10) => ({ id, box: { x, y, w, h } });
const route = (edge: string, ...points: [number, number][]): Route => ({ edge, points: points.map(([x, y]) => ({ x, y })) });

// Two nodes `a` and `b` on one line, and the node `c` between them.
const board: Graph = {
  nodes: [node("a", 0, 0), node("b", 100, 0), node("c", 40, -20, 20, 40)],
  edges: [{ id: "ab", source: { node: "a" }, target: { node: "b" } }],
};
const rules = (g: Graph, r: Result): string[] => checkProperties(g, r).map((v) => v.rule);

describe("nearestOnBoundary", () => {
  it("gives the nearest point of the boundary from inside and from outside", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    expect(nearestOnBoundary(box, { x: 9, y: 5 })).toEqual({ x: 10, y: 5 });
    expect(nearestOnBoundary(box, { x: 5, y: 1 })).toEqual({ x: 5, y: 0 });
    expect(nearestOnBoundary(box, { x: 20, y: 20 })).toEqual({ x: 10, y: 10 });
  });
});

describe("repairResult (RULE-046)", () => {
  it("does not change a route without a break", () => {
    const r = route("ab", [10, 5], [10, 30], [100, 30], [100, 5]);
    const out = repairResult(board, { routes: [r] });
    expect(out.result.routes[0]).toBe(r);
    expect(out.counts.faulty).toBe(0);
  });

  it("pushes an inner leg out of the box that it goes through", () => {
    const base = { routes: [route("ab", [10, 5], [20, 5], [80, 5], [100, 5])] };
    expect(rules(board, base)).toContain("no-pass-through");
    const out = repairResult(board, base);
    expect(out.counts.pushed).toBe(1);
    expect(rules(board, out.result)).toEqual([]);
    // The leg goes to the near side of `c`, with a clearance of half the margin.
    expect(out.result.routes[0]!.points[1]!.y).toBeCloseTo(22.5);
  });

  it("takes a detour for a leg that it cannot push", () => {
    const base = { routes: [route("ab", [10, 5], [100, 5])] };
    const out = repairResult(board, base);
    expect(out.counts.detoured).toBe(1);
    expect(out.counts.pushed).toBe(0);
    expect(rules(board, out.result)).toEqual([]);
  });

  it("moves a free end back to the box of its node and to its fixed plug", () => {
    const free = repairResult(board, { routes: [route("ab", [10, 5], [10, 40], [130, 40])] });
    expect(free.counts.snapped).toBe(1);
    expect(free.result.routes[0]!.points.at(-1)).toEqual({ x: 110, y: 10 });
    expect(rules(board, free.result)).toEqual([]);

    const plugged: Graph = {
      nodes: [node("a", 0, 0), { ...node("b", 100, 0), ports: [{ id: "w", at: { x: 0, y: 5 } }] }],
      edges: [{ id: "ab", source: { node: "a" }, target: { node: "b", port: "w" } }],
    };
    const fixed = repairResult(plugged, { routes: [route("ab", [10, 5], [110, 5])] });
    expect(fixed.counts.snapped).toBe(1);
    expect(rules(plugged, fixed.result)).toEqual([]);
  });

  it("walks along the boundaries of boxes that touch", () => {
    // The three boxes touch, so no way goes around `c` with a margin. The walk goes along the top side of `c`.
    const row: Graph = {
      nodes: [node("a", 0, 0), node("c", 10, 0), node("b", 20, 0)],
      edges: [{ id: "ab", source: { node: "a" }, target: { node: "b" } }],
    };
    const base = { routes: [route("ab", [10, 5], [20, 5])] };
    expect(rules(row, base)).toContain("no-pass-through");
    const out = repairResult(row, base, { detour: false, reroute: false });
    expect(out.counts.walked).toBe(1);
    expect(out.result.routes[0]!.points).toEqual([{ x: 10, y: 5 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 5 }]);
    expect(rules(row, out.result)).toEqual([]);
  });

  it("keeps the base route when no repair works", () => {
    const r = route("ab", [10, 5], [100, 5]);
    const out = repairResult(board, { routes: [r] }, { push: false, detour: false, reroute: false, walk: false });
    expect(out.counts.kept).toBe(1);
    expect(out.result.routes[0]).toBe(r);
  });

  it("adds a route for an edge without a route", () => {
    const out = repairResult(board, { routes: [] });
    expect(out.counts.added).toBe(1);
    expect(rules(board, out.result)).toEqual([]);
  });

  it("takes a repaired edge out of a run that its route does not hold", () => {
    const g: Graph = { ...board, edges: [...board.edges, { id: "ab2", source: { node: "a" }, target: { node: "b" } }] };
    const runPoints = [{ x: 10, y: 5 }, { x: 20, y: 5 }];
    const base: Result = {
      routes: [route("ab", [10, 5], [20, 5], [20, 5], [100, 5]), route("ab2", [10, 5], [20, 5], [20, 30], [100, 30], [100, 5])],
      runs: [{ id: "r", key: "k", points: runPoints, edges: ["ab", "ab2"] }],
    };
    const out = repairResult(g, base);
    expect(out.counts.faulty).toBe(1);
    expect(rules(g, out.result)).toEqual([]);
    // The run keeps its edges when the new route holds it, and drops it otherwise.
    const held = out.result.runs?.[0]?.edges.length ?? 0;
    expect(held + out.counts.unbundled).toBe(2);
  });

  it("moves the ends of a level link to the boundaries of its items", () => {
    const level: Level = {
      depth: 0,
      items: [
        { id: "a", box: { x: 0, y: 0, w: 10, h: 10 }, nodes: ["a"] },
        { id: "b", box: { x: 100, y: 0, w: 10, h: 10 }, nodes: ["b"] },
      ],
      links: [{ source: "a", target: "b", count: 1, points: [{ x: 5, y: 5 }, { x: 105, y: 5 }] }],
    };
    expect(checkLevels(board, [level]).length).toBeGreaterThan(0);
    const out = repairResult(board, { routes: [route("ab", [10, 5], [10, 30], [100, 30], [100, 5])], levels: [level] });
    expect(out.counts.linkEnds).toBe(2);
    expect(checkLevels(board, out.result.levels!).filter((v) => v.rule === "link-ends")).toEqual([]);
  });

  it("gives the same output for the same input, and repairs the packed grid of a router", () => {
    const g = packedGridBoard({ cols: 5, rows: 4, long: 8 });
    const base = routerStrategies.straight.run(g);
    const a = repairResult(g, base);
    expect(sameData(a, repairResult(g, base))).toBe(true);
    const before = checkProperties(g, base, 1e6).filter((v) => v.rule === "no-pass-through").length;
    const after = checkProperties(g, a.result, 1e6).filter((v) => v.rule === "no-pass-through").length;
    expect(after).toBeLessThan(before);
  });

  it("makes a strategy with the name, the defaults and the schema of the router", () => {
    const s = repairStrategy(routerStrategies.corners);
    expect(s.name).toBe("corners+repair");
    expect(s.defaults).toEqual(routerStrategies.corners.defaults);
    expect(s.schema).toEqual(routerStrategies.corners.schema);
    expect(rules(board, s.run(board))).toEqual([]);
  });
});
