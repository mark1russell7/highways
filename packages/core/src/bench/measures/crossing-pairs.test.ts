import { mulberry32 } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { highwaysRegistry } from "../../families/index.ts";
import { EPS_STEPS, snapToEps } from "../../geom.ts";
import { ROUTERS } from "../../routers/index.ts";
import { measureQuality, routePairCrossings } from "../quality.ts";
import { crossingPairs, eachCrossing, snapLines, splitPairs, type EdgeLine } from "./crossing-pairs.ts";

const line = (edge: string, ...xy: readonly (readonly [number, number])[]): EdgeLine => ({ edge, points: xy.map(([x, y]) => ({ x, y })) });

describe("crossingPairs", () => {
  it("counts each crossing point by its pair, and each pair once", () => {
    const zig = line("a", [0, 0], [10, 10], [20, 0], [30, 10]);
    const flat = line("b", [-5, 5], [35, 5]);
    const far = line("c", [0, 50], [30, 50]);
    expect([...crossingPairs([zig, flat, far])]).toEqual([["a|b", 3]]);
  });

  it("does not count two lines of one edge", () => {
    expect(crossingPairs([line("a", [0, 0], [10, 10]), line("a", [0, 10], [10, 0])]).size).toBe(0);
  });

  it("gives the same pair in each order of the lines", () => {
    const [a, b] = [line("a", [0, 0], [10, 10]), line("b", [0, 10], [10, 0])];
    expect([...crossingPairs([b, a])]).toEqual([...crossingPairs([a, b])]);
  });

  it("has no crossing with no segment", () => {
    expect(crossingPairs([line("a", [1, 1]), line("b", [2, 2], [2, 2])]).size).toBe(0);
  });

  it("equals the count of `measureQuality` when no two routes share a drawn segment", () => {
    const { graph } = highwaysRegistry().generate("dense-groups", 0);
    const result = ROUTERS.find((r) => r.name === "straight")!.route(graph);
    const points = [...crossingPairs(result.routes).values()].reduce((sum, n) => sum + n, 0);
    expect(points).toBeGreaterThan(0);
    expect(points).toBe(measureQuality(graph, result).crossings);
  });
});

describe("crossingPairs on the grid", () => {
  const wall = line("wall", [0, 0], [10, 0]);
  const stub = (end: number): EdgeLine => line("stub", [5, -5], [5, end]);
  const floatCount = (lines: readonly EdgeLine[]): number => {
    let count = 0;
    eachCrossing(lines, () => count++);
    return count;
  };

  it("gives one answer for a touch, while the floats flip it at a shift of 1e-12", () => {
    expect(floatCount([wall, stub(0)])).toBe(0);
    expect(floatCount([wall, stub(1e-12)])).toBe(1);
    expect(crossingPairs([wall, stub(0)]).size).toBe(0);
    expect(crossingPairs([wall, stub(1e-12)]).size).toBe(0);
  });

  it("keeps a crossing that reaches over the grid", () => {
    expect([...crossingPairs([wall, stub(2 / EPS_STEPS)])]).toEqual([["stub|wall", 1]]);
  });

  it("does not change the lines that it gets", () => {
    const lines = [line("a", [0.1234567891, 0]), line("b", [1, 1], [2, 2])];
    expect(snapLines(lines)[0]!.points[0]).toEqual({ x: 0.123457, y: 0 });
    expect(lines[0]!.points[0]).toEqual({ x: 0.1234567891, y: 0 });
  });

  it("rounds a point to the nearest place of the grid", () => {
    expect(snapToEps({ x: 0.4 / EPS_STEPS, y: 0.6 / EPS_STEPS })).toEqual({ x: 0, y: 1 / EPS_STEPS });
  });

  it("gives the count of `routePairCrossings` on lines that share no vertex, so the two counts read one grid", () => {
    const next = mulberry32(20261104);
    for (let round = 0; round < 25; round++) {
      const lines = Array.from({ length: 12 }, (_, i): EdgeLine => ({ edge: `e${i}`, points: Array.from({ length: 4 }, () => ({ x: next() * 100, y: next() * 100 })) }));
      const points = [...crossingPairs(lines).values()].reduce((sum, n) => sum + n, 0);
      expect(routePairCrossings(lines).pairs).toBe(points);
    }
  });
});

describe("splitPairs", () => {
  it("splits a rise into added pairs, lost pairs and repeats", () => {
    const before = new Map([
      ["a|b", 1],
      ["a|c", 1],
    ]);
    const after = new Map([
      ["a|b", 3],
      ["b|c", 1],
    ]);
    const split = splitPairs(after, before);
    expect(split).toEqual({ points: 4, beforePoints: 2, pairs: 2, beforePairs: 2, added: 1, lost: 1 });
    expect(split.points - split.beforePoints).toBe(split.added - split.lost + (split.points - split.pairs) - (split.beforePoints - split.beforePairs));
  });
});
