import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions, CURRICULUM_POOL, wholeStrategies } from "../../strategies/index.ts";
import { CURRICULUM_DEFAULTS, curriculum, pairCosts } from "./index.ts";

/** This function gives the sum of the costs of one rule over each pair of routes. */
function total(routes: readonly { points: readonly { x: number; y: number }[] }[], rule: "R1" | "R12" | "R2"): number {
  let sum = 0;
  for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) sum += pairCosts(routes[i]!.points, routes[j]!.points)[rule];
  return sum;
}

describe("the whole strategy curriculum (RULE-048)", () => {
  it("gives the costs of the rules between two routes", () => {
    const h = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const v = [
      { x: 5, y: -5 },
      { x: 5, y: 5 },
    ];
    const near = [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
    ];
    expect(pairCosts(h, v)).toEqual({ R1: 1, R2: 0, R12: 0 });
    expect(pairCosts(h, near).R12).toBeCloseTo(6, 9);
    expect(pairCosts(h, near).R1).toBe(0);
  });

  it("gives the same routes each time, with no break of a hard rule, and no more crossings than its first setting", () => {
    for (const graph of [hub, clustered]) {
      const out = curriculum(graph, CURRICULUM_POOL, CURRICULUM_DEFAULTS);
      expect(wholeStrategies.curriculum.run(graph, { ...CURRICULUM_DEFAULTS })).toEqual(out);
      expect(out.result.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, out.result, 1_000_000)).toEqual([]);
      const first = curriculum(graph, CURRICULUM_POOL.slice(0, 1), CURRICULUM_DEFAULTS);
      expect(total(out.result.routes, "R1")).toBeLessThanOrEqual(total(first.result.routes, "R1"));
    }
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(wholeStrategies.curriculum, CURRICULUM_DEFAULTS)).toEqual([]);
  });
});
