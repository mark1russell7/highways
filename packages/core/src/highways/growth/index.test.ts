import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import type { Box } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { GROWTH_DEFAULTS, growthPlan } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Four parallel edges from left to right. The longest is the seed, and the others join its highway.
const parallel: Graph = {
  nodes: [0, 1, 2, 3].flatMap((i) => [
    { id: `s${i}`, box: box(0, 30 * i) },
    { id: `t${i}`, box: box(800 + 10 * i, 30 * i) },
  ]),
  edges: [0, 1, 2, 3].map((i) => ({ id: `e${i}`, source: { node: `s${i}` }, target: { node: `t${i}` } })),
};

describe("the highway strategy growth (HWY-055)", () => {
  it("grows one highway from the longest edge, and the other edges join it", () => {
    const plan = growthPlan({ graph: parallel }, GROWTH_DEFAULTS);
    expect(checkPlan(parallel, plan)).toEqual([]);
    expect(plan.highways).toHaveLength(1);
    expect([...plan.highways[0]!.lanes].sort()).toEqual(["e0", "e1", "e2", "e3"]);
    expect(growthPlan({ graph: parallel }, { ...GROWTH_DEFAULTS, share: 1 }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "growth");
    for (const graph of [hub, clustered]) {
      const plan = strategy.run({ graph }, { ...GROWTH_DEFAULTS });
      expect(checkPlan(graph, plan)).toEqual([]);
      expect(growthPlan({ graph }, GROWTH_DEFAULTS)).toEqual(plan);
    }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "growth"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
