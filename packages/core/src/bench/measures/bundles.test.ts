import { describe, expect, it } from "vitest";
import type { Route } from "../../model.ts";
import { bundledShare, bundleStretch, mergeAngle } from "./bundles.ts";

const route = (edge: string, ...points: [number, number][]): Route => ({ edge, points: points.map(([x, y]) => ({ x, y })) });

describe("bundledShare (B2)", () => {
  it("counts the edges that share a drawn segment", () => {
    // a and b share the segment from (0, 0) to (10, 0). c goes alone.
    const routes = [route("a", [0, 0], [10, 0], [20, 10]), route("b", [0, 0], [10, 0], [20, -10]), route("c", [0, 50], [20, 50])];
    expect(bundledShare({ routes })).toBeCloseTo(2 / 3);
  });

  it("counts the edges of the runs and of the bundles with two edges or more", () => {
    const routes = [route("a", [0, 0], [10, 0]), route("b", [0, 10], [10, 10]), route("c", [0, 20], [10, 20]), route("d", [0, 30], [10, 30])];
    expect(bundledShare({ routes })).toBe(0);
    const runs = [{ id: "r", key: "k", edges: ["a", "b"], points: [] }];
    const bundles = [
      { id: "x", key: "k", node: "n", edges: ["c"], trunk: [] },
      { id: "y", key: "k", node: "n", edges: ["c", "d"], trunk: [] },
    ];
    expect(bundledShare({ routes, runs, bundles })).toBe(1);
    expect(bundledShare({ routes, bundles: [bundles[0]!] })).toBe(0);
  });

  it("gives 0 for no routes", () => {
    expect(bundledShare({ routes: [] })).toBe(0);
  });
});

describe("bundleStretch (B3)", () => {
  it("gives the median and the 0.95 quantile of the length ratios against the base", () => {
    const base = [route("a", [0, 0], [10, 0]), route("b", [0, 0], [10, 0]), route("c", [0, 0], [10, 0])];
    const routes = [route("a", [0, 0], [10, 0]), route("b", [0, 0], [0, 5], [10, 5], [10, 0]), route("c", [0, 0], [0, 10], [10, 10], [10, 0])];
    const st = bundleStretch(routes, base);
    expect(st.edges).toBe(3);
    // The ratios are 1, 2 and 3.
    expect(st.median).toBeCloseTo(2);
    expect(st.q95).toBeGreaterThan(2.8);
    expect(st.q95).toBeLessThanOrEqual(3);
  });

  it("skips the edges without a base route or with a base route of 1 unit or less", () => {
    const base = [route("a", [0, 0], [0.5, 0])];
    const st = bundleStretch([route("a", [0, 0], [10, 0]), route("b", [0, 0], [10, 0])], base);
    expect(st).toEqual({ median: 1, q95: 1, edges: 0 });
  });
});

describe("mergeAngle (B6)", () => {
  it("gives the largest turn where a lane joins or leaves a shared segment", () => {
    // a and b share (0, 0) to (10, 0). a goes on straight, b turns 90 degrees.
    const routes = [route("a", [0, 0], [10, 0], [20, 0]), route("b", [0, 0], [10, 0], [10, 10])];
    expect(mergeAngle(routes)).toBeCloseTo(90);
  });

  it("gives 45 degrees for a lane that leaves at 45 degrees", () => {
    const routes = [route("a", [0, 0], [10, 0], [20, 0]), route("b", [0, 0], [10, 0], [20, 10])];
    expect(mergeAngle(routes)).toBeCloseTo(45);
  });

  it("does not count a turn inside a run or a turn of a lone route", () => {
    // Both routes turn together at (10, 0), so the edges on the segments do not change there.
    const together = [route("a", [0, 0], [10, 0], [10, 10]), route("b", [0, 0], [10, 0], [10, 10])];
    expect(mergeAngle(together)).toBe(0);
    expect(mergeAngle([route("a", [0, 0], [10, 0], [10, 10])])).toBe(0);
  });
});
