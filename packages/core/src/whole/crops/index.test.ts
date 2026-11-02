import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { center } from "../../geom.ts";
import { BOARD_PORTFOLIO_SETTINGS, checkOptions, wholeStrategies } from "../../strategies/index.ts";
import { BOARD_PORTFOLIO_DEFAULTS, boardPortfolio } from "../portfolio/index.ts";
import { CROP_DEFAULTS, cropWindow, crops } from "./index.ts";

describe("the whole strategy crops (WILD-048)", () => {
  it("cuts a window of the nearest nodes, and ends each cut edge at a stub node", () => {
    const at = center(clustered.nodes[0]!.box);
    const window = cropWindow(clustered, at, 10);
    const ids = new Set(window.nodes.map((n) => n.id));
    const kept = window.nodes.filter((n) => !n.id.startsWith("crop-stub-"));
    expect(kept).toHaveLength(10);
    expect(kept.map((n) => n.id)).toContain(clustered.nodes[0]!.id);
    for (const e of window.edges) {
      expect(ids.has(e.source.node), e.id).toBe(true);
      expect(ids.has(e.target.node), e.id).toBe(true);
    }
    for (const n of kept) if (n.parent !== undefined) expect(ids.has(n.parent), n.id).toBe(true);
    expect(cropWindow(clustered, at, 10)).toEqual(window);
  });

  it("runs board-portfolio on a board that is not larger than one window", () => {
    const run = crops(hub, BOARD_PORTFOLIO_SETTINGS, { nodes: hub.nodes.length });
    const portfolio = boardPortfolio(hub, BOARD_PORTFOLIO_SETTINGS, { ...BOARD_PORTFOLIO_DEFAULTS, settings: CROP_DEFAULTS.settings });
    expect(run.pick).toBe(portfolio.pick);
    expect(run.output).toEqual(portfolio.output);
    expect(run.scores).toEqual([]);
  }, 60_000);

  it("ranks the settings on the windows and routes the whole board with the pick, the same each time", () => {
    const o = { ...CROP_DEFAULTS, nodes: 12, settings: 3 };
    const run = crops(clustered, BOARD_PORTFOLIO_SETTINGS, o);
    expect(run.scores.map((s) => s.name)).toEqual(BOARD_PORTFOLIO_SETTINGS.slice(0, 3).map((s) => s.name));
    const least = Math.min(...run.scores.map((s) => s.score));
    expect(run.scores.find((s) => s.name === run.pick)!.score).toBe(least);
    expect(checkProperties(run.output.graph, run.output.result, 1_000_000)).toEqual([]);
    expect(crops(clustered, BOARD_PORTFOLIO_SETTINGS, o)).toEqual(run);
    expect(wholeStrategies.crops.run(clustered, o)).toEqual(run.output);
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(wholeStrategies.crops, CROP_DEFAULTS)).toEqual([]);
  });
});
