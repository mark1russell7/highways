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
import { SplitTree, WSPD_DEFAULTS, wspdGroups, wspdPlan } from "./index.ts";

const p = (x: number, y: number) => ({ x, y });
const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Three edges from one cluster of boxes to another cluster, far away.
const three: Graph = {
  nodes: [0, 1, 2].flatMap((i) => [
    { id: `s${i}`, box: box(0, 30 * i) },
    { id: `t${i}`, box: box(400, 30 * i) },
  ]),
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `s${i}` }, target: { node: `t${i}` } })),
};

describe("the highway strategy wspd (HWY-018)", () => {
  it("gives a well-separated pair that holds each pair of points", () => {
    const points = [p(0, 0), p(0, 10), p(100, 0), p(100, 10), p(50, 200)];
    const tree = new SplitTree(points);
    for (let u = 0; u < points.length; u++)
      for (let v = 0; v < points.length; v++) {
        if (u === v) continue;
        const [a, b] = tree.pairOf(u, v, 2)!;
        expect(tree.holds(a, u) && tree.holds(b, v), `${u} ${v}`).toBe(true);
        expect(tree.holds(a, v) || tree.holds(b, u), `${u} ${v}`).toBe(false);
      }
  });

  it("puts the edges between two far clusters in one group, with one highway", () => {
    const groups = wspdGroups({ graph: three }, WSPD_DEFAULTS);
    expect(new Set([...groups.values()].map((g) => g.key)).size).toBe(1);
    const plan = wspdPlan({ graph: three }, WSPD_DEFAULTS);
    expect(checkPlan(three, plan)).toEqual([]);
    expect(plan.highways).toHaveLength(1);
    expect(wspdPlan({ graph: three }, { ...WSPD_DEFAULTS, minSize: 4 }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan with each spine, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "wspd");
    for (const graph of [hub, clustered])
      for (const spine of ["shared", "trunk"] as const) {
        const plan = strategy.run({ graph }, { ...WSPD_DEFAULTS, spine });
        expect(checkPlan(graph, plan), spine).toEqual([]);
        expect(wspdPlan({ graph }, { ...WSPD_DEFAULTS, spine })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "wspd"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
