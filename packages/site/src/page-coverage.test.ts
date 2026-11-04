import { BASELINE_STRATEGIES, keyOfStrategy, OPT_IN_STRATEGIES, register, STRATEGIES, UNSCREENED_STRATEGIES, listStrategies, KEYED_STRATEGIES } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { pageCoverage } from "./demo-data.ts";

describe("the strategies and options that the pages show", () => {
  const coverage = pageCoverage();

  it("leaves out of the demo only the opt-in strategies, the baselines and the strategies with no screen", () => {
    const expected = [...OPT_IN_STRATEGIES, ...BASELINE_STRATEGIES, ...UNSCREENED_STRATEGIES].map(keyOfStrategy).sort();
    expect([...coverage.leftByDemo].sort()).toEqual(expected);
  });

  it("leaves out of both pages only the baselines and the strategies with no screen", () => {
    expect([...coverage.leftByPages].sort()).toEqual([...BASELINE_STRATEGIES, ...UNSCREENED_STRATEGIES].map(keyOfStrategy).sort());
  });

  it("states the counts", () => {
    expect({ strategies: coverage.strategies, leftByDemo: coverage.leftByDemo.length, leftByPages: coverage.leftByPages.length, controls: coverage.controls, fixed: coverage.fixed }).toEqual({
      strategies: 120,
      leftByDemo: 13,
      leftByPages: 2,
      controls: 684,
      fixed: 43,
    });
  });

  it("shows a new built-in strategy in the demo with no edit of the page", () => {
    const made = { ...listStrategies(STRATEGIES, "curve")[0]!, name: "made-up" };
    const more = pageCoverage(register(KEYED_STRATEGIES, made), register(STRATEGIES, made));
    expect(more.strategies).toBe(coverage.strategies + 1);
    expect(more.leftByDemo).toEqual(coverage.leftByDemo);
  });

  it("names a keyed strategy that no page reads", () => {
    const made = { ...listStrategies(STRATEGIES, "curve")[0]!, name: "made-up" };
    expect(pageCoverage(register(KEYED_STRATEGIES, made)).leftByPages).toContain("curve/made-up");
  });
});
