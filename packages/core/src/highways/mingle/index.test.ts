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
import { MINGLE_DEFAULTS, mingleBundles, minglePlan } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Four long parallel edges, 30 apart, and one edge at a right angle far away. The edge `d` goes from right to left.
const fan: Graph = {
  nodes: [
    ...[0, 1, 2, 3].flatMap((i) => [
      { id: `s${i}`, box: box(0, 30 * i) },
      { id: `t${i}`, box: box(600, 30 * i) },
    ]),
    { id: "u", box: box(300, 400) },
    { id: "v", box: box(300, 800) },
  ],
  edges: [
    { id: "a", source: { node: "s0" }, target: { node: "t0" } },
    { id: "b", source: { node: "s1" }, target: { node: "t1" } },
    { id: "c", source: { node: "s2" }, target: { node: "t2" } },
    { id: "d", source: { node: "t3" }, target: { node: "s3" } },
    { id: "x", source: { node: "u" }, target: { node: "v" } },
  ],
};

describe("the highway strategy mingle (HWY-003)", () => {
  it("merges the parallel edges into one bundle, with the reversed edge flipped, and keeps the far edge alone", () => {
    const groups = mingleBundles({ graph: fan }, MINGLE_DEFAULTS);
    const key = groups.get("a")!.key;
    for (const e of ["b", "c", "d"]) expect(groups.get(e)!.key, e).toBe(key);
    expect(groups.get("d")!.flip).not.toBe(groups.get("a")!.flip);
    expect(groups.get("x")!.key).not.toBe(key);
  });

  it("does not merge when the turn limit is too small", () => {
    const groups = mingleBundles({ graph: fan }, { ...MINGLE_DEFAULTS, maxTurn: 0.01 });
    expect(new Set([...groups.values()].map((g) => g.key)).size).toBe(5);
    expect(minglePlan({ graph: fan }, { ...MINGLE_DEFAULTS, maxTurn: 0.01 }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan with each spine, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "mingle");
    for (const graph of [fan, hub, clustered])
      for (const spine of ["shared", "trunk"] as const) {
        const plan = strategy.run({ graph }, { ...MINGLE_DEFAULTS, spine });
        expect(checkPlan(graph, plan), spine).toEqual([]);
        expect(minglePlan({ graph }, { ...MINGLE_DEFAULTS, spine })).toEqual(plan);
      }
    expect(minglePlan({ graph: fan }, MINGLE_DEFAULTS).highways.length).toBeGreaterThan(0);
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "mingle"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
