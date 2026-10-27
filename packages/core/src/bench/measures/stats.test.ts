import { describe, expect, it } from "vitest";
import { dominates, paretoFront, type Objective } from "./pareto.ts";
import { adjustedRandIndex, kendallTau, quantile, summarize } from "./stats.ts";

describe("the statistics of the suite", () => {
  it("quantile: interpolates between the sorted values", () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([], 0.5)).toBeNaN();
  });

  it("summarize: gives the median, the quartiles, the range and the count, without NaN", () => {
    expect(summarize([5, 1, 3, Number.NaN, 2, 4])).toEqual({ n: 5, median: 3, q1: 2, q3: 4, iqr: 2, min: 1, max: 5 });
  });

  it("kendallTau: gives 1 for the same order, -1 for the inverse order and 1 without pairs", () => {
    expect(kendallTau([1, 2, 3, 4], [10, 20, 30, 40])).toBe(1);
    expect(kendallTau([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
    expect(kendallTau([1], [1])).toBe(1);
    expect(kendallTau([1, 2, 3], [5, 5, 5])).toBe(1);
  });

  it("kendallTau: samples the pairs above the exact limit and keeps the value", () => {
    const n = 3000;
    const a = Array.from({ length: n }, (_, i) => i);
    expect(kendallTau(a, a)).toBe(1);
    expect(kendallTau(a, [...a].reverse())).toBe(-1);
  });

  it("adjustedRandIndex: gives 1 for the same partition with other labels", () => {
    expect(adjustedRandIndex([0, 0, 1, 1], ["x", "x", "y", "y"])).toBe(1);
    expect(adjustedRandIndex([0, 0, 0, 1, 1, 1], [0, 0, 1, 1, 2, 2])).toBeCloseTo(0.8 / 3.3);
  });
});

describe("paretoFront", () => {
  const axes: Objective[] = [
    { key: "cost", better: "min" },
    { key: "gain", better: "max" },
  ];
  const items = [
    { name: "a", cost: 1, gain: 1 },
    { name: "b", cost: 2, gain: 3 },
    { name: "c", cost: 2, gain: 2 },
    { name: "d", cost: 3, gain: 3 },
    { name: "e", cost: Number.NaN, gain: 9 },
  ];

  it("keeps each item that no other item dominates, in the order of the items", () => {
    // The item e has no cost, so its cost is the worst. Its gain is the best, so no other item dominates it.
    expect(paretoFront(items, (i) => ({ cost: i.cost, gain: i.gain }), axes).map((i) => i.name)).toEqual(["a", "b", "e"]);
    expect(paretoFront(items.slice(0, 4), (i) => ({ cost: i.cost, gain: i.gain }), axes).map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("counts a missing value as the worst value", () => {
    expect(dominates({ cost: 1, gain: 1 }, { cost: Number.NaN, gain: 1 }, axes)).toBe(true);
    expect(dominates({ cost: 1, gain: 1 }, { cost: 1, gain: 1 }, axes)).toBe(false);
  });
});
