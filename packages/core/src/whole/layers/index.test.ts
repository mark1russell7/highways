import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { BOARD_PORTFOLIO_SETTINGS, checkOptions, wholeStrategies } from "../../strategies/index.ts";
import { boardPortfolio, BOARD_PORTFOLIO_DEFAULTS } from "../portfolio/index.ts";
import { LAYER_DEFAULTS, LAYER_ORDERS, layerPick, layers } from "./index.ts";

/** Three settings. The first has the fewest crossings, the second the most ink saved, and the third is near the best on each rule. */
const entries = [
  { crossings: 10, detour: 1.5, ink: 0.1 },
  { crossings: 30, detour: 1.2, ink: 0.5 },
  { crossings: 10.4, detour: 1.1, ink: 0.48 },
];

describe("the whole strategy layers (RULE-017)", () => {
  it("holds each layer within its slack while the next layer picks", () => {
    expect(layerPick(entries, "crossings,detour,ink", 0)).toBe(0);
    expect(layerPick(entries, "crossings,detour,ink", 0.05)).toBe(2);
    expect(layerPick(entries, "ink,crossings,detour", 0)).toBe(1);
    expect(layerPick(entries, "ink,crossings,detour", 0.05)).toBe(2);
    expect(layerPick(entries, "detour,crossings,ink", 0)).toBe(2);
  });

  it("does not trade a high layer for a low layer, unlike the sum of the ranks", () => {
    const list = [
      { crossings: 5, detour: 3, ink: 0 },
      { crossings: 6, detour: 1, ink: 0.5 },
      { crossings: 7, detour: 1.1, ink: 0.4 },
    ];
    // The sum of the ranks picks the second entry. The first layer keeps only the first entry.
    expect(layerPick(list, "crossings,detour,ink", 0.05)).toBe(0);
    expect(layerPick(list, "crossings,detour,ink", 0.2)).toBe(1);
  });

  it("gives -1 for a list with no entry, and a tie goes to the earlier setting", () => {
    expect(layerPick([], "crossings,detour,ink", 0.05)).toBe(-1);
    expect(layerPick([entries[0]!, entries[0]!], "crossings,detour,ink", 0)).toBe(0);
  });

  it("gives the output of one setting, with no break of a hard rule, for each order", () => {
    const run = boardPortfolio(hub, BOARD_PORTFOLIO_SETTINGS, { ...BOARD_PORTFOLIO_DEFAULTS, settings: 3 });
    for (const order of LAYER_ORDERS) {
      const out = layers(hub, BOARD_PORTFOLIO_SETTINGS, { order, slack: 0.05, settings: 3 });
      expect(run.entries.map((e) => e.output.result).some((r) => JSON.stringify(r.routes) === JSON.stringify(out.result.routes))).toBe(true);
      expect(checkProperties(out.graph, out.result, 1_000_000)).toEqual([]);
    }
  });

  it("is in the registry, with its options", () => {
    expect(checkOptions(wholeStrategies.layers, LAYER_DEFAULTS)).toEqual([]);
    const out = wholeStrategies.layers.run(clustered, { ...LAYER_DEFAULTS, settings: 3 });
    expect(checkProperties(out.graph, out.result, 1_000_000)).toEqual([]);
  });
});
