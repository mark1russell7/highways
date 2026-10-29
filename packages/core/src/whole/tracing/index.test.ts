import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import type { Result } from "../../model.ts";
import { BOARD_PORTFOLIO_SETTINGS, checkOptions, wholeStrategies } from "../../strategies/index.ts";
import { TRACING_DEFAULTS, tracing, tracingLoads, tracingValue } from "./index.ts";

/** Two crossing routes, `a` with one bend, and a run of three edges where `m` is not an outer lane. */
const result: Result = {
  routes: [
    {
      edge: "a",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    },
    {
      edge: "b",
      points: [
        { x: 5, y: -5 },
        { x: 5, y: 5 },
      ],
    },
    {
      edge: "m",
      points: [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
    },
  ],
  runs: [{ edges: ["a", "m", "b"], points: [] } as never],
};

describe("the whole strategy tracing (WILD-057)", () => {
  it("gives the tracing load of each edge", () => {
    const loads = tracingLoads(result);
    // a: 1 crossing and 1 bend. b: 1 crossing. m: 1 merge and 1 split, not on an outer lane.
    expect(Object.fromEntries(loads)).toEqual({ a: 1 + 0.5, b: 1, m: 2 * 2 });
    expect(Object.fromEntries(tracingLoads(result, { crossing: 0, merge: 1, bend: 4 }))).toEqual({ a: 4, b: 0, m: 2 });
  });

  it("gives the median, the quantile 0.95 and the mean of the loads", () => {
    const loads = [0, 1, 2, 3, 10];
    expect(tracingValue(loads, "q50")).toBe(2);
    expect(tracingValue(loads, "q95")).toBe(10);
    expect(tracingValue(loads, "mean")).toBe(3.2);
    expect(tracingValue([], "q95")).toBe(0);
  });

  it("picks the setting with the least load, with no break of a hard rule, the same each time", () => {
    for (const graph of [hub, clustered]) {
      const run = tracing(graph, BOARD_PORTFOLIO_SETTINGS, TRACING_DEFAULTS);
      expect(run.entries.length).toBeGreaterThan(0);
      const pick = run.entries.find((e) => e.name === run.pick)!;
      for (const e of run.entries) expect(pick.value).toBeLessThanOrEqual(e.value);
      expect(wholeStrategies.tracing.run(graph, { ...TRACING_DEFAULTS })).toEqual(run.output);
      expect(checkProperties(run.output.graph, run.output.result, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(wholeStrategies.tracing, TRACING_DEFAULTS)).toEqual([]);
  });
});
