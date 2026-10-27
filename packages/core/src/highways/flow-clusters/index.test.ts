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
import { FLOW_CLUSTER_DEFAULTS, flowClusterPlan, flowClusters, flowDistance } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Three edges from one area on the left to one area on the right (one of them reversed), and two edges from the top to the bottom.
const flows: Graph = {
  nodes: [
    ...[0, 1, 2].flatMap((i) => [
      { id: `l${i}`, box: box(0, 30 * i) },
      { id: `r${i}`, box: box(600, 30 * i) },
    ]),
    ...[0, 1].flatMap((i) => [
      { id: `u${i}`, box: box(250 + 60 * i, -400) },
      { id: `d${i}`, box: box(250 + 60 * i, 400) },
    ]),
  ],
  edges: [
    { id: "a", source: { node: "l0" }, target: { node: "r0" } },
    { id: "b", source: { node: "l1" }, target: { node: "r1" } },
    { id: "c", source: { node: "r2" }, target: { node: "l2" } },
    { id: "x", source: { node: "u0" }, target: { node: "d0" } },
    { id: "y", source: { node: "u1" }, target: { node: "d1" } },
  ],
};

describe("the highway strategy flow-clusters (HWY-023)", () => {
  it("gives the flow distance as a share of the shorter edge, in the nearer direction", () => {
    const p = (x: number, y: number) => ({ x, y });
    expect(flowDistance(p(0, 0), p(100, 0), p(0, 10), p(100, 20), true).d).toBeCloseTo(0.2, 9);
    const back = flowDistance(p(0, 0), p(100, 0), p(100, 10), p(0, 10), false);
    expect(back.flip).toBe(true);
    expect(back.d).toBeCloseTo(0.1, 9);
    expect(flowDistance(p(0, 0), p(100, 0), p(100, 10), p(0, 10), true).flip).toBe(false);
  });

  it("puts the edges between the same two areas into one cluster, with each linkage", () => {
    for (const linkage of ["average", "complete", "single"] as const) {
      const groups = flowClusters({ graph: flows }, { ...FLOW_CLUSTER_DEFAULTS, linkage });
      const key = groups.get("a")!.key;
      expect(groups.get("b")!.key, linkage).toBe(key);
      expect(groups.get("c")!.key, linkage).toBe(key);
      expect(groups.get("c")!.flip, linkage).toBe(true);
      expect(groups.get("x")!.key, linkage).not.toBe(key);
      expect(groups.get("x")!.key, linkage).toBe(groups.get("y")!.key);
    }
    const directed = flowClusters({ graph: flows }, { ...FLOW_CLUSTER_DEFAULTS, directed: true });
    expect(directed.get("c")!.key).not.toBe(directed.get("a")!.key);
    const tight = flowClusters({ graph: flows }, { ...FLOW_CLUSTER_DEFAULTS, tau: 0.01 });
    expect(new Set([...tight.values()].map((g) => g.key)).size).toBe(5);
  });

  it("is in the registry, and gives a correct plan with each spine, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "flow-clusters");
    for (const graph of [flows, hub, clustered])
      for (const spine of ["shared", "trunk"] as const) {
        const plan = strategy.run({ graph }, { ...FLOW_CLUSTER_DEFAULTS, spine });
        expect(checkPlan(graph, plan), spine).toEqual([]);
        expect(flowClusterPlan({ graph }, { ...FLOW_CLUSTER_DEFAULTS, spine })).toEqual(plan);
      }
    expect(flowClusterPlan({ graph: flows }, FLOW_CLUSTER_DEFAULTS).highways.length).toBeGreaterThan(0);
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "flow-clusters"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
