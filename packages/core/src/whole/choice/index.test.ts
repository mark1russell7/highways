import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import type { Graph } from "../../model.ts";
import { BOARD_PORTFOLIO_SETTINGS, checkOptions, wholeStrategies } from "../../strategies/index.ts";
import { runPipeline } from "../pipeline/index.ts";
import { boardFeatures, CHOICE_DEFAULTS, CHOICE_FEATURES, choice, rankSettings, type ChoiceRow } from "./index.ts";
import { CHOICE_TABLE } from "./table.ts";

/** Two boxes of 10 by 10, 30 apart, and one edge with a key. */
const pair: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 0, w: 10, h: 10 } },
    { id: "b", box: { x: 30, y: 0, w: 10, h: 10 } },
  ],
  edges: [{ id: "e", source: { node: "a" }, target: { node: "b" }, data: { collection: "p" } }],
};

/** This function gives a row of the table with the feature vector `v` repeated, and the winner `winner`. */
const row = (board: string, v: number, winner: string): ChoiceRow => ({ board, features: CHOICE_FEATURES.map(() => v), winner });

describe("the whole strategy choice (WILD-046)", () => {
  it("gives the features of a board", () => {
    const f = boardFeatures(pair);
    expect(f).toHaveLength(CHOICE_FEATURES.length);
    expect(f[0]).toBe(2);
    expect(f[1]).toBe(1);
    expect(f[2]).toBe(0.5);
    expect(f[3]).toBe(1);
    expect(f[4]).toBe(0);
    expect(f[6]).toBe(1);
    expect(f[7]).toBe(1);
    expect(f[8]).toBe(3);
    expect(boardFeatures(clustered)).toEqual(boardFeatures(clustered));
  });

  it("ranks the settings by the vote of the nearest rows of the table", () => {
    const table = [row("t/1", 0, "shared"), row("t/2", 1, "shared"), row("t/3", 10, "corners"), row("t/4", 11, "corners"), row("t/5", 12, "trunks")];
    const near = (v: number) => CHOICE_FEATURES.map(() => v);
    expect(rankSettings(near(0.5), table, { k: 2, features: "all" })[0]).toBe("shared");
    expect(rankSettings(near(10.5), table, { k: 2, features: "all" })[0]).toBe("corners");
    expect(rankSettings(near(12), table, { k: 1, features: "size" })[0]).toBe("trunks");
    expect([...rankSettings(near(12), table, { k: 1, features: "all" })].sort()).toEqual(["corners", "shared", "trunks"]);
    expect(rankSettings(near(0), [], CHOICE_DEFAULTS)).toEqual([]);
  });

  it("routes the first setting of the list when the table is empty", () => {
    const run = choice(hub, BOARD_PORTFOLIO_SETTINGS, CHOICE_DEFAULTS, []);
    expect(run.ranked).toEqual(BOARD_PORTFOLIO_SETTINGS.map((s) => s.name));
    expect(run.pick).toBe(BOARD_PORTFOLIO_SETTINGS[0]!.name);
    expect(run.output).toEqual(runPipeline(hub, BOARD_PORTFOLIO_SETTINGS[0]!.pipeline));
  });

  it("routes one setting of the vote with no break of a hard rule, the same each time", () => {
    for (const graph of [hub, clustered]) {
      const run = choice(graph, BOARD_PORTFOLIO_SETTINGS, CHOICE_DEFAULTS);
      expect(BOARD_PORTFOLIO_SETTINGS.map((s) => s.name)).toContain(run.pick);
      expect(checkProperties(run.output.graph, run.output.result, 1_000_000)).toEqual([]);
      expect(wholeStrategies.choice.run(graph, { ...CHOICE_DEFAULTS })).toEqual(run.output);
    }
  }, 60_000);

  it("has a table of made-up boards with known settings and full feature vectors", () => {
    const names = new Set(BOARD_PORTFOLIO_SETTINGS.map((s) => s.name));
    for (const r of CHOICE_TABLE) {
      expect(names.has(r.winner), r.board).toBe(true);
      expect(r.features, r.board).toHaveLength(CHOICE_FEATURES.length);
    }
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(wholeStrategies.choice, CHOICE_DEFAULTS)).toEqual([]);
  });
});
