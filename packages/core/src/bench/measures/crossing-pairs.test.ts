import { describe, expect, it } from "vitest";
import { highwaysRegistry } from "../../families/index.ts";
import { ROUTERS } from "../../routers/index.ts";
import { measureQuality } from "../quality.ts";
import { crossingPairs, splitPairs, type EdgeLine } from "./crossing-pairs.ts";

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
