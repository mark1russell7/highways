import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions, routerStrategies, wholeStrategies, type Strategy } from "../../strategies/index.ts";
import { attraction, FIREFLY_DEFAULTS, fireflies, settingAt } from "./index.ts";

const shared = routerStrategies.shared as Strategy<"router">;

describe("the whole strategy fireflies (NAT-047)", () => {
  it("gives a rational attraction near the exponential of the record", () => {
    expect(attraction(1, 0)).toBe(1);
    expect(attraction(1, 1)).toBe(0.4);
    expect(attraction(2, 1)).toBe(0.2);
    for (let u = 0; u <= 3; u += 0.25) {
      // 1 + u + u² / 2 is at most exp(u), so the attraction is at least exp(-u), and near it.
      expect(attraction(1, u)).toBeGreaterThanOrEqual(Math.exp(-u) - 1e-15);
      expect(attraction(1, u) - Math.exp(-u)).toBeLessThan(0.1);
    }
  });

  it("puts the defaults of shared on the grid", () => {
    expect(settingAt(9 / 19, 2 / 7)).toEqual({ discount: 0.5, margin: 5 });
    expect(settingAt(0, 0)).toEqual({ discount: 0.05, margin: 3 });
    expect(settingAt(1, 1)).toEqual({ discount: 1, margin: 10 });
  });

  it("starts at the defaults, keeps to its budget, and gives the same routes for the same seed", () => {
    for (const search of ["firefly", "bees"] as const) {
      const run = fireflies(clustered, shared, { search, budget: 6 });
      expect(run.entries[0]!.setting).toEqual({ discount: 0.5, margin: 5 });
      expect(run.entries.length).toBeLessThanOrEqual(6);
      expect(new Set(run.entries.map((e) => `${e.setting.discount}:${e.setting.margin}`)).size).toBe(run.entries.length);
      for (const e of run.entries) expect(run.entries.find((x) => x.setting === run.best)!.score).toBeLessThanOrEqual(e.score);
      expect(fireflies(clustered, shared, { search, budget: 6 }).output).toEqual(run.output);
      expect(checkProperties(run.output.graph, run.output.result, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const out = wholeStrategies.fireflies.run(graph, { ...FIREFLY_DEFAULTS });
      expect(wholeStrategies.fireflies.run(graph, { ...FIREFLY_DEFAULTS })).toEqual(out);
      expect(out.result.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, out.result, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(wholeStrategies.fireflies, FIREFLY_DEFAULTS)).toEqual([]);
  });
});
