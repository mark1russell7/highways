import { BASELINE_STRATEGIES, keyOfStrategy, OPT_IN_STRATEGIES, register, STRATEGIES, UNSCREENED_STRATEGIES, listStrategies, KEYED_STRATEGIES } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { demoComplete, demoPickers, pageCoverage } from "./demo-data.ts";
import { COMPARE_STRATEGIES } from "./opt-in.ts";

describe("the strategies and options that the pages show", () => {
  const coverage = pageCoverage();

  it("leaves out of the demo only the baselines and the strategies with no screen", () => {
    expect([...coverage.leftByDemo].sort()).toEqual([...BASELINE_STRATEGIES, ...UNSCREENED_STRATEGIES].map(keyOfStrategy).sort());
  });

  it("keeps each built-in strategy first, so the picks and the first drawing of the demo stay the same", () => {
    for (const picker of demoPickers()) {
      const builtIn = listStrategies(STRATEGIES, picker.step).map((s) => s.name);
      expect(picker.names.slice(0, builtIn.length), picker.step).toEqual(builtIn);
    }
    const added = demoPickers().flatMap((p) => p.names.filter((name) => !listStrategies(STRATEGIES, p.step).some((s) => s.name === name)));
    expect(added.sort()).toEqual(OPT_IN_STRATEGIES.map((s) => s.name).sort());
  });

  it("marks the demo complete, and a new strategy that no page lists takes that away", () => {
    expect(demoComplete(coverage)).toBe(true);
    const made = { ...listStrategies(STRATEGIES, "curve")[0]!, name: "made-up" };
    expect(demoComplete(pageCoverage(register(KEYED_STRATEGIES, made)))).toBe(false);
  });

  it("leaves out of both pages only the baselines and the strategies with no screen", () => {
    expect([...coverage.leftByPages].sort()).toEqual([...BASELINE_STRATEGIES, ...UNSCREENED_STRATEGIES].map(keyOfStrategy).sort());
  });

  it("states the counts", () => {
    expect({ strategies: coverage.strategies, leftByDemo: coverage.leftByDemo.length, leftByPages: coverage.leftByPages.length, controls: coverage.controls, fixed: coverage.fixed }).toEqual({
      strategies: 124,
      leftByDemo: 4,
      leftByPages: 4,
      controls: 759,
      fixed: 43,
    });
  });

  it("shows a new built-in strategy in the demo with no edit of the page", () => {
    const made = { ...listStrategies(STRATEGIES, "curve")[0]!, name: "made-up" };
    const more = pageCoverage(register(KEYED_STRATEGIES, made), register(COMPARE_STRATEGIES, made));
    expect(more.strategies).toBe(coverage.strategies + 1);
    expect(more.leftByDemo).toEqual(coverage.leftByDemo);
  });

  it("names a keyed strategy that no page reads", () => {
    const made = { ...listStrategies(STRATEGIES, "curve")[0]!, name: "made-up" };
    expect(pageCoverage(register(KEYED_STRATEGIES, made)).leftByPages).toContain("curve/made-up");
  });
});
