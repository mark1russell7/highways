import { configId, type StrategyConfig } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { exactBoard } from "./bench/screen/exact-set.ts";
import { resultHash } from "./bench/screen/exercise.ts";
import { routeConfig, routerOfConfig, routeSpace } from "./route-space.ts";
import { annealingStrategy } from "./routers/index.ts";
import { highwayStrategies } from "./strategies/builtins.ts";

// ROUTER-OF-CONFIG: the `Router` of a config of `routeSpace`. Made-up boards only.

const named = routeSpace.named!;

/** The point `shared-stretch` with 3 sift passes, not 2: a config that is not a named point. */
function unnamedConfig(): StrategyConfig {
  const base = named["shared-stretch"]!;
  const lanes = base.stages["lane-order"]!;
  return { ...base, stages: { ...base.stages, "lane-order": { ...lanes, params: { ...lanes.params, order: "sifting", siftPasses: 3 } } } };
}

describe("routerOfConfig (ROUTER-OF-CONFIG)", () => {
  it("gives the key of each named point as the name of the router", () => {
    const wrong = Object.entries(named).flatMap(([name, point]) => (routerOfConfig(point).name === name ? [] : [name]));
    expect(wrong).toEqual([]);
  });

  it("gives the configId as the name of a config that is not a named point", () => {
    const config = unnamedConfig();
    const id = configId(routeSpace, config);
    expect(Object.values(named).map((p) => configId(routeSpace, p))).not.toContain(id);
    expect(routerOfConfig(config).name).toBe(id);
  });

  it("keeps the maxNodes of the router strategy and of each plan", () => {
    expect(annealingStrategy.maxNodes).toBe(10_000);
    expect(routerOfConfig(named["annealing"]!).maxNodes).toBe(10_000);
    for (const plan of Object.values(highwayStrategies)) expect(routerOfConfig(named[plan.name]!).maxNodes, plan.name).toBe(plan.maxNodes);
  });

  it("gives the routes of routeConfig", { timeout: 120_000 }, () => {
    const g = exactBoard("clustered", 18, 4);
    for (const config of [named["sections-tree"]!, named["shared-ways-all"]!, unnamedConfig()]) {
      expect(resultHash(routerOfConfig(config).route(g))).toBe(resultHash(routeConfig(g, config)));
    }
  });

  it("refuses a config with a break, with a RangeError", () => {
    const base = named["shared-stretch"]!;
    const bad: StrategyConfig = { ...base, stages: { ...base.stages, routing: { option: "no-such-router", params: {} } } };
    expect(() => routerOfConfig(bad)).toThrow(RangeError);
  });
});
