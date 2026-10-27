import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import { pointBoxDistance, type Box } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { STUB_DEFAULTS, stubPlan } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// One source on the left, and three targets far to the right, in near directions.
const fan: Graph = {
  nodes: [
    { id: "s", box: box(0, 0) },
    { id: "t0", box: box(400, -40) },
    { id: "t1", box: box(400, 0) },
    { id: "t2", box: box(400, 40) },
  ],
  edges: [
    { id: "a", source: { node: "s" }, target: { node: "t0" } },
    { id: "b", source: { node: "s" }, target: { node: "t1" } },
    { id: "c", source: { node: "s" }, target: { node: "t2" } },
  ],
};

describe("the highway strategy stubs (HWY-015, WILD-005)", () => {
  it("gives one stub from the box of the source. The three edges share it, and then fan out", () => {
    const plan = stubPlan({ graph: fan }, { ...STUB_DEFAULTS, from: "none" });
    expect(checkPlan(fan, plan)).toEqual([]);
    expect(plan.highways).toHaveLength(1);
    const stub = plan.highways[0]!;
    expect(stub.key).toBe("stub:s:source:east");
    expect([...stub.lanes].sort()).toEqual(["a", "b", "c"]);
    expect(pointBoxDistance(stub.spine[0]!, fan.nodes[0]!.box)).toBe(0);
    const result = follow(fan, plan);
    const tip = stub.spine[stub.spine.length - 1]!;
    for (const r of result.routes) expect(r.points.some((p) => Math.abs(p.x - tip.x) < 1e-6), r.edge).toBe(true);
    expect(checkProperties(fan, result, 1_000_000)).toEqual([]);
  });

  it("gives no stub for too few edges, a window of 0 or the other end", () => {
    expect(stubPlan({ graph: fan }, { ...STUB_DEFAULTS, from: "none", minSize: 4 }).highways).toEqual([]);
    expect(stubPlan({ graph: fan }, { ...STUB_DEFAULTS, from: "none", omega: 0 }).highways).toEqual([]);
    expect(stubPlan({ graph: fan }, { ...STUB_DEFAULTS, from: "none", ends: "target" }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan on each base, the same each time", () => {
    const stubs = getStrategy(STRATEGIES, "highway", "stubs");
    for (const graph of [hub, clustered])
      for (const from of ["shared-ways", "corridors", "none"] as const) {
        const plan = stubs.run({ graph }, { ...STUB_DEFAULTS, from });
        expect(checkPlan(graph, plan), from).toEqual([]);
        expect(stubPlan({ graph }, { ...STUB_DEFAULTS, from })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "stubs"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
