import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { BOARD_PORTFOLIO_SETTINGS, checkOptions, wholeStrategies } from "../../strategies/index.ts";
import { BOARD_PORTFOLIO_DEFAULTS, boardPortfolio, rankShares } from "./index.ts";

describe("the whole strategy board-portfolio (WILD-045)", () => {
  it("gives rank shares from 0 to 1, with the mean rank for a tie", () => {
    expect(rankShares([3, 1, 2], true)).toEqual([1, 0, 0.5]);
    expect(rankShares([3, 1, 2], false)).toEqual([0, 1, 0.5]);
    expect(rankShares([1, 1, 2], true)).toEqual([0.25, 0.25, 1]);
    expect(rankShares([5], true)).toEqual([0]);
  });

  it("picks one setting of its list on the board, the same each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const run = boardPortfolio(graph, BOARD_PORTFOLIO_SETTINGS, BOARD_PORTFOLIO_DEFAULTS);
      expect(run.entries.length).toBe(4);
      expect(BOARD_PORTFOLIO_SETTINGS.slice(0, 4).map((s) => s.name)).toContain(run.pick);
      const out = wholeStrategies["board-portfolio"].run(graph, { ...BOARD_PORTFOLIO_DEFAULTS });
      expect(out).toEqual(run.output);
      expect(out.graph).toBe(graph);
      expect(checkProperties(graph, out.result, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("changes the pick with the weights, and stops after the time budget", () => {
    const ink = boardPortfolio(clustered, BOARD_PORTFOLIO_SETTINGS, { ...BOARD_PORTFOLIO_DEFAULTS, crossings: 0, detour: 0, ink: 1 });
    const direct = boardPortfolio(clustered, BOARD_PORTFOLIO_SETTINGS, { ...BOARD_PORTFOLIO_DEFAULTS, crossings: 0, detour: 1, ink: 0 });
    expect(ink.pick).not.toBe(direct.pick);
    let t = 0;
    const slow = boardPortfolio(clustered, BOARD_PORTFOLIO_SETTINGS, { ...BOARD_PORTFOLIO_DEFAULTS, budget: 0.1 }, () => (t += 1000));
    expect(slow.entries.length).toBe(1);
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(wholeStrategies["board-portfolio"], BOARD_PORTFOLIO_DEFAULTS)).toEqual([]);
  });
});
