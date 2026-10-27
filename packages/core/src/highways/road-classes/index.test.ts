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
import { ROAD_CLASS_DEFAULTS, roadClassPlan } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Three edges that go around one tall wall, so their ways share the links over the wall.
const wall: Graph = {
  nodes: [
    { id: "wall", box: box(280, 0, 40, 400) },
    ...[0, 1, 2].flatMap((i) => [
      { id: `s${i}`, box: box(0, 100 + 30 * i) },
      { id: `t${i}`, box: box(600, 100 + 30 * i) },
    ]),
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `s${i}` }, target: { node: `t${i}` } })),
};

describe("the highway strategy road-classes (HWY-034, EDA-050)", () => {
  it("makes a main road of the links that the most ways use", () => {
    const plan = roadClassPlan({ graph: wall }, ROAD_CLASS_DEFAULTS);
    expect(checkPlan(wall, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    const riders = new Set(plan.highways.flatMap((h) => h.lanes));
    expect([...riders].sort()).toEqual(["e0", "e1", "e2"]);
    expect(roadClassPlan({ graph: wall }, { ...ROAD_CLASS_DEFAULTS, minSize: 4 }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "road-classes");
    for (const graph of [hub, clustered]) {
      const plan = strategy.run({ graph }, { ...ROAD_CLASS_DEFAULTS });
      expect(checkPlan(graph, plan)).toEqual([]);
      expect(roadClassPlan({ graph }, ROAD_CLASS_DEFAULTS)).toEqual(plan);
    }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "road-classes"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
