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
import { mdf, QUICKBUNDLES_DEFAULTS, quickBundles, quickBundlesPlan, resample } from "./index.ts";

const p = (x: number, y: number) => ({ x, y });
const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Two edges that run parallel, 30 apart.
const pair: Graph = {
  nodes: [
    { id: "s0", box: box(0, 0) },
    { id: "s1", box: box(0, 30) },
    { id: "t0", box: box(400, 0) },
    { id: "t1", box: box(400, 30) },
  ],
  edges: [
    { id: "a", source: { node: "s0" }, target: { node: "t0" } },
    { id: "b", source: { node: "s1" }, target: { node: "t1" } },
  ],
};

describe("the highway strategy quickbundles (HWY-026)", () => {
  it("resamples a line at equal steps, and gives the MDF distance with the flip", () => {
    const line = resample([p(0, 0), p(10, 0), p(10, 10)], 5);
    expect(line).toHaveLength(5);
    expect(line[0]).toEqual(p(0, 0));
    expect(line[2]!.x).toBeCloseTo(10, 9);
    expect(line[4]).toEqual(p(10, 10));
    const a = resample([p(0, 0), p(100, 0)], 4);
    const same = mdf(a, resample([p(0, 10), p(100, 10)], 4));
    expect(same.d).toBeCloseTo(10, 9);
    expect(same.flip).toBe(false);
    const back = mdf(a, resample([p(100, 10), p(0, 10)], 4));
    expect(back.d).toBeCloseTo(10, 9);
    expect(back.flip).toBe(true);
  });

  it("puts two near parallel edges in one cluster, and two far edges in two clusters", () => {
    const o = { ...QUICKBUNDLES_DEFAULTS, line: "lines" as const };
    const near = quickBundles({ graph: pair }, o);
    expect(near.get("a")!.key).toBe(near.get("b")!.key);
    const far = quickBundles({ graph: pair }, { ...o, theta: 0.5 });
    expect(far.get("a")!.key).not.toBe(far.get("b")!.key);
    expect(quickBundlesPlan({ graph: pair }, { ...o, theta: 0.5 }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan with each spine, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "quickbundles");
    for (const graph of [hub, clustered])
      for (const spine of ["shared", "trunk"] as const) {
        const plan = strategy.run({ graph }, { ...QUICKBUNDLES_DEFAULTS, spine });
        expect(checkPlan(graph, plan), spine).toEqual([]);
        expect(quickBundlesPlan({ graph }, { ...QUICKBUNDLES_DEFAULTS, spine })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "quickbundles"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
