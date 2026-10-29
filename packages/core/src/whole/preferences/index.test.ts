import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions, CURRICULUM_POOL, wholeStrategies } from "../../strategies/index.ts";
import { agreementOf, fitPreferences, madeUpPairs, PREFERENCE_DEFAULTS, PREFERENCE_FEATURES, PREFERENCE_PANEL, preferences, softStep } from "./index.ts";

describe("the whole strategy preferences (RULE-038)", () => {
  it("gives a smooth step from 0 to 1 with only rational operations", () => {
    expect(softStep(0)).toBe(0.5);
    expect(softStep(1)).toBe(0.75);
    expect(softStep(-3)).toBe(0.125);
    for (let z = -10; z < 10; z += 0.5) expect(softStep(z + 0.5)).toBeGreaterThan(softStep(z));
  });

  it("gives the same made-up pairs for a seed, and other pairs for another seed", () => {
    expect(madeUpPairs(20, 3)).toEqual(madeUpPairs(20, 3));
    expect(madeUpPairs(20, 3)).not.toEqual(madeUpPairs(20, 4));
    expect(madeUpPairs(5, 1)[0]!.a).toHaveLength(PREFERENCE_FEATURES.length);
  });

  it("fits weights that agree with 75% or more of the held-out pairs, from made-up pairs alone", () => {
    const model = fitPreferences();
    expect(model.agreement).toBeGreaterThanOrEqual(0.75);
    expect(agreementOf(model.weights, madeUpPairs(50, 1 + 7919))).toBe(model.agreement);
    expect(model.source).toContain("made-up pairs");
    // The crossings get the largest weight, as in the panel.
    const top = model.weights.indexOf(Math.max(...model.weights));
    expect(top).toBe(PREFERENCE_PANEL.indexOf(Math.max(...PREFERENCE_PANEL)));
    expect(model.weights.reduce((s, v) => s + v, 0)).toBeCloseTo(PREFERENCE_FEATURES.length, 9);
    expect(fitPreferences()).toBe(model);
  });

  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const out = preferences(graph, CURRICULUM_POOL, PREFERENCE_DEFAULTS);
      expect(wholeStrategies.preferences.run(graph, { ...PREFERENCE_DEFAULTS })).toEqual(out);
      expect(out.result.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, out.result, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(wholeStrategies.preferences, PREFERENCE_DEFAULTS)).toEqual([]);
  });
});
