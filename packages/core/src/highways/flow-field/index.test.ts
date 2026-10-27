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
import { FLOW_FIELD_DEFAULTS, flowFieldPlan } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Three edges into one target, around one tall wall.
const fan: Graph = {
  nodes: [
    { id: "wall", box: box(280, 0, 40, 400) },
    { id: "t", box: box(600, 130) },
    ...[0, 1, 2].map((i) => ({ id: `s${i}`, box: box(0, 100 + 30 * i) })),
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `s${i}` }, target: { node: "t" } })),
};

describe("the highway strategy flow-field (EDA-046, HWY-037)", () => {
  it("merges the ways into one target like streams", () => {
    const plan = flowFieldPlan({ graph: fan }, FLOW_FIELD_DEFAULTS);
    expect(checkPlan(fan, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(flowFieldPlan({ graph: fan }, { ...FLOW_FIELD_DEFAULTS, minFanIn: 4 }).highways).toEqual([]);
    expect(flowFieldPlan({ graph: fan }, { ...FLOW_FIELD_DEFAULTS, end: "source" }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan on each end, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "flow-field");
    for (const graph of [hub, clustered])
      for (const end of ["target", "source"] as const) {
        const plan = strategy.run({ graph }, { ...FLOW_FIELD_DEFAULTS, end });
        expect(checkPlan(graph, plan), end).toEqual([]);
        expect(flowFieldPlan({ graph }, { ...FLOW_FIELD_DEFAULTS, end })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "flow-field"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
