import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions } from "../../strategies/options.ts";
import { ANNEALING_DEFAULTS, ANNEALING_SCHEMA, annealingStrategy } from "./index.ts";

describe("the router annealing (RULE-021)", () => {
  it("gives the same routes for the same seed, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = annealingStrategy.run(graph, { ...ANNEALING_DEFAULTS });
      expect(annealingStrategy.run(graph, { ...ANNEALING_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 30_000);

  it("changes the routes when the crossing cost and the seed change", () => {
    const none = annealingStrategy.run(clustered, { ...ANNEALING_DEFAULTS, crossing: 0, seed: 7, budget: 200, temperature: 10 });
    const some = annealingStrategy.run(clustered, { ...ANNEALING_DEFAULTS, crossing: 20, seed: 3, budget: 200, temperature: 10 });
    expect(some.routes).not.toEqual(none.routes);
  }, 30_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(annealingStrategy, ANNEALING_DEFAULTS)).toEqual([]);
    expect(Object.keys(ANNEALING_SCHEMA).sort()).toEqual(Object.keys(ANNEALING_DEFAULTS).sort());
  });
});
