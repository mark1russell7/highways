import { describe, expect, it } from "vitest";
import { inkSaved } from "../../bench/measures/bundles.ts";
import { polylineLength } from "../../geom.ts";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { BOARD_PORTFOLIO_SETTINGS, checkOptions, routerStrategies, wholeStrategies } from "../../strategies/index.ts";
import { asRouter, type Strategy } from "../../strategies/model.ts";
import { MOAT_DEFAULTS, inkFloor, inkShare, moats, plugPairs } from "./index.ts";

const p = (x: number, y: number) => ({ x, y });

describe("the whole strategy moats (WILD-054)", () => {
  it("gives the exact ink of one pair, and of two pairs far apart", () => {
    expect(inkFloor([[p(0, 0), p(10, 0)]]).floor).toBeCloseTo(10, 9);
    const two = inkFloor([
      [p(0, 0), p(10, 0)],
      [p(0, 100), p(0, 130)],
    ]);
    expect(two.floor).toBeCloseTo(40, 9);
    expect(two.read).toBe(2);
  });

  it("gives a floor below the ink of a shared trunk", () => {
    // Two pairs that share a trunk: the best drawing has less ink than the two direct lines.
    const pairs: [{ x: number; y: number }, { x: number; y: number }][] = [
      [p(0, 0), p(100, 0)],
      [p(0, 4), p(100, 4)],
    ];
    const f = inkFloor(pairs).floor;
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(200 + 1e-9);
    // A trunk of length 100 and four stubs of length 2 joins both pairs.
    expect(f).toBeLessThanOrEqual(108 + 1e-9);
  });

  it("gives a floor at most the ink of each router on each board", () => {
    for (const graph of [hub, clustered]) {
      for (const name of ["corners", "shared", "trunks"] as const) {
        const result = asRouter(routerStrategies[name] as Strategy<"router">).route(graph);
        let total = 0;
        for (const r of result.routes) total += polylineLength(r.points);
        const ink = (1 - inkSaved(result.routes)) * total;
        const { floor } = inkFloor(plugPairs(result));
        expect(floor, `${name}`).toBeGreaterThan(0);
        expect(floor, `${name}`).toBeLessThanOrEqual(ink + 1e-6);
        const share = inkShare(result);
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
      }
    }
  }, 30_000);

  it("picks the setting with the largest share, with no break of a hard rule, the same each time", () => {
    for (const graph of [hub, clustered]) {
      const run = moats(graph, BOARD_PORTFOLIO_SETTINGS, MOAT_DEFAULTS);
      expect(run.entries.length).toBeGreaterThan(0);
      const pick = run.entries.find((e) => e.name === run.pick)!;
      for (const e of run.entries) expect(pick.share).toBeGreaterThanOrEqual(e.share - 1e-9);
      expect(wholeStrategies.moats.run(graph, { ...MOAT_DEFAULTS })).toEqual(run.output);
      expect(checkProperties(run.output.graph, run.output.result, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(wholeStrategies.moats, MOAT_DEFAULTS)).toEqual([]);
  });
});
