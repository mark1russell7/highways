import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import type { Box } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { basePlan } from "../base.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { channelOverflows, LANES_DEFAULTS, lanesPlan } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Six edges of one collection through a narrow gap between two walls. A second gap below the walls has room.
const gap: Graph = {
  nodes: [
    { id: "top", box: box(300, -400, 40, 390) },
    { id: "mid", box: box(300, 10, 40, 300) },
    { id: "low", box: box(300, 400, 40, 300) },
    ...[0, 1, 2, 3, 4, 5].flatMap((i) => [
      { id: `s${i}`, box: box(0, -60 + 30 * i), data: { collection: "c" } },
      { id: `t${i}`, box: box(640, -60 + 30 * i), data: { collection: "c" } },
    ]),
  ],
  edges: [0, 1, 2, 3, 4, 5].map((i) => ({ id: `e${i}`, source: { node: `s${i}` }, target: { node: `t${i}` } })),
};

describe("the highway strategy lanes (HWY-051)", () => {
  it("keeps a plan with no overflow, and does not add overflows", () => {
    for (const graph of [gap, hub, clustered]) {
      const base = basePlan({ graph }, "shared-ways");
      const plan = lanesPlan({ graph }, LANES_DEFAULTS);
      expect(checkPlan(graph, plan)).toEqual([]);
      if (channelOverflows(graph, base, LANES_DEFAULTS) === 0) expect(plan).toEqual(base);
      expect(channelOverflows(graph, plan, LANES_DEFAULTS)).toBeLessThanOrEqual(channelOverflows(graph, base, LANES_DEFAULTS));
    }
  });

  it("with no split, gives the plan of its base", () => {
    expect(lanesPlan({ graph: clustered }, { ...LANES_DEFAULTS, depth: 0 })).toEqual(basePlan({ graph: clustered }, "shared-ways"));
  });

  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "lanes");
    for (const graph of [hub, clustered]) {
      const plan = strategy.run({ graph }, { ...LANES_DEFAULTS });
      expect(checkPlan(graph, plan)).toEqual([]);
      expect(lanesPlan({ graph }, LANES_DEFAULTS)).toEqual(plan);
    }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "lanes"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
